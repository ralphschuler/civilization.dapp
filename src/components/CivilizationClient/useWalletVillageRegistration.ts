"use client";

import { useUserOperationReceipt } from "@worldcoin/minikit-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createWorldGameAdapter,
  readCivilizationState,
  registerWalletWithMiniKit,
  worldGameClient,
} from "@/world-game";
import {
  type WalletAccessLocale,
  walletAccessMessages,
} from "@/lib/wallet-access-locale";

const RECEIPT_DEADLINE_MS = 60_000;

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
  const [status, setStatus] =
    useState<keyof ReturnType<typeof walletAccessMessages>["registration"]>(
      "checking",
    );
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
      setChecked(true);
      setRegistered(state.registered);
      setStatus(state.registered ? "loaded" : "ready");
    } catch {
      // A failed RPC/configuration read is not evidence that the wallet is
      // unregistered, so keep registration unavailable until a later read.
      setRegistered(false);
      setCheckFailed(true);
      setStatus("unavailable");
    } finally {
      registrationCheckInFlight.current = false;
      setChecking(false);
    }
  }, [readRegistration]);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => {
      void retryRegistrationCheck();
    }, 0);
    return () => window.clearTimeout(initialCheck);
  }, [retryRegistrationCheck]);

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
        },
      });
      setChecked(true);
      setRegistered(true);
      setStatus(result.alreadyRegistered ? "loaded" : "created");
    } catch {
      setRegistered(false);
      setChecked(true);
      setStatus("rejected");
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
