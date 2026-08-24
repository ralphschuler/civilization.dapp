"use client";

import { useUserOperationReceipt } from "@worldcoin/minikit-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createWorldGameAdapter,
  persistPendingRegistration,
  readCivilizationState,
  registerWalletWithMiniKit,
  restorePendingRegistration,
  worldGameClient,
} from "@/world-game";
import {
  type WalletAccessLocale,
  walletAccessMessages,
} from "@/lib/wallet-access-locale";

const RECEIPT_DEADLINE_MS = 60_000;

type RegistrationStatus = keyof ReturnType<
  typeof walletAccessMessages
>["registration"];

function registrationFailureStatus(error: unknown): RegistrationStatus {
  const code = error instanceof Error ? error.message : "";
  if (code === "receipt_timeout") return "pending";
  if (code === "world_app_wallet_required") return "walletRequired";
  if (code === "user_rejected") return "cancelled";
  if (code === "transaction_failed") return "transactionFailed";
  if (code === "transaction_wallet_mismatch") return "walletMismatch";
  if (code === "wallet_registration_not_confirmed") return "notConfirmed";
  if (code === "wallet_registration_rejected") return "rejected";
  // Transport/configuration failures are never evidence of an unregistered
  // wallet. Keep the gate fail-closed until a later authoritative read works.
  return "unavailable";
}

function useReceiptPolling() {
  const { poll, reset } = useUserOperationReceipt({
    client: worldGameClient,
    confirmations: 1,
    timeout: 45_000,
  });

  return useCallback(
    (userOpHash: string) =>
      new Promise<unknown>((resolve, reject) => {
        let finished = false;
        const timer = window.setTimeout(() => {
          if (finished) {
            return;
          }
          finished = true;
          reset();
          reject(new Error("receipt_timeout"));
        }, RECEIPT_DEADLINE_MS);
        poll(userOpHash)
          .then((result) => {
            if (finished) {
              return;
            }
            finished = true;
            window.clearTimeout(timer);
            resolve(result);
          })
          .catch((error) => {
            if (finished) {
              return;
            }
            finished = true;
            window.clearTimeout(timer);
            reject(error);
          });
      }),
    [poll, reset],
  );
}

/**
 * Manages the one-time wallet registration before the contract-authoritative
 * game runtime is mounted. WalletAuth/SIWE binds the UI to an address; it does
 * not authorize this contract call. The contract accepts a public call only
 * for msg.sender, whose World wallet signs the submitted transaction.
 */
export function useWalletVillageRegistration(
  walletAddress: string,
  contractAddress: string,
  worldTokenAddress: string,
  locale: WalletAccessLocale,
) {
  const registrationInFlight = useRef(false);
  const registrationCheckInFlight = useRef(false);
  const pendingRegistrationHash = useRef<string | null>(null);
  const pollReceipt = useReceiptPolling();
  const [registered, setRegistered] = useState(false);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [checkFailed, setCheckFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<RegistrationStatus>("checking");
  const statusCopy = walletAccessMessages(locale).registration;

  const worldAdapter = useMemo(
    () =>
      createWorldGameAdapter({
        walletAddress,
        contractAddress,
        worldTokenAddress,
        pollReceipt,
      }),
    [contractAddress, pollReceipt, walletAddress, worldTokenAddress],
  );

  const readRegistration = useCallback(
    () => readCivilizationState(walletAddress, contractAddress),
    [contractAddress, walletAddress],
  );

  const retryRegistrationCheck = useCallback(async () => {
    if (registrationCheckInFlight.current || registrationInFlight.current) {
      return;
    }
    registrationCheckInFlight.current = true;
    // Defer state updates so the initial effect subscribes to the async
    // on-chain read instead of synchronously cascading a render.
    await Promise.resolve();
    setChecking(true);
    setCheckFailed(false);
    setChecked(false);
    setStatus("checking");
    try {
      const state = await readRegistration();
      if (state.registered && pendingRegistrationHash.current) {
        pendingRegistrationHash.current = null;
        persistPendingRegistration(walletAddress, contractAddress, null);
      }
      setChecked(true);
      setRegistered(state.registered);
      setStatus(state.registered ? "loaded" : "ready");
    } catch {
      // A failed RPC/configuration read is not evidence that the wallet is
      // unregistered, so keep registration unavailable until a later read.
      setCheckFailed(true);
      setStatus("unavailable");
    } finally {
      registrationCheckInFlight.current = false;
      setChecking(false);
    }
  }, [contractAddress, readRegistration, walletAddress]);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => {
      pendingRegistrationHash.current = restorePendingRegistration(
        walletAddress,
        contractAddress,
      );
      void retryRegistrationCheck();
    }, 0);
    return () => window.clearTimeout(initialCheck);
  }, [contractAddress, retryRegistrationCheck, walletAddress]);

  const registerVillage = useCallback(async () => {
    if (registrationInFlight.current) {
      return;
    }
    if (!checked || checking || checkFailed) {
      return;
    }
    registrationInFlight.current = true;
    setBusy(true);
    setStatus("rechecking");
    try {
      // registerWalletWithMiniKit always reads first, including every retry.
      const result = await registerWalletWithMiniKit({
        walletAddress,
        contractAddress,
        pollReceipt,
        pendingUserOpHash: pendingRegistrationHash.current,
        onPendingUserOpHash: (hash: string | null) => {
          pendingRegistrationHash.current = hash;
          persistPendingRegistration(walletAddress, contractAddress, hash);
        },
      });
      setChecked(true);
      setRegistered(true);
      setStatus(result.alreadyRegistered ? "loaded" : "created");
    } catch (error) {
      const nextStatus = registrationFailureStatus(error);
      if (nextStatus === "unavailable") {
        setCheckFailed(true);
        setChecked(false);
      } else {
        setChecked(true);
      }
      setStatus(nextStatus);
    } finally {
      registrationInFlight.current = false;
      setBusy(false);
    }
  }, [
    checked,
    checkFailed,
    checking,
    contractAddress,
    pollReceipt,
    walletAddress,
  ]);

  return {
    busy,
    checked,
    checking,
    checkFailed,
    registered,
    retryRegistrationCheck,
    registerVillage,
    status: statusCopy[status],
    worldAdapter,
  };
}
