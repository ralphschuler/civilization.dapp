"use client";

import { useUserOperationReceipt } from "@worldcoin/minikit-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createWorldGameAdapter,
  readCivilizationState,
  registerWalletWithMiniKit,
  worldGameClient,
} from "@/world-game";

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
 * game runtime is mounted. The wallet address originates from verified
 * WalletAuth/SIWE and is never accepted from a registration action.
 */
export function useWalletVillageRegistration(
  walletAddress: string,
  contractAddress: string,
) {
  const registrationInFlight = useRef(false);
  const pendingRegistrationHash = useRef<string | null>(null);
  const pollReceipt = useReceiptPolling();
  const [registered, setRegistered] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("On-chain-Dorf wird geprüft …");

  const worldAdapter = useMemo(
    () =>
      createWorldGameAdapter({ walletAddress, contractAddress, pollReceipt }),
    [contractAddress, pollReceipt, walletAddress],
  );

  const readRegistration = useCallback(
    () => readCivilizationState(walletAddress, contractAddress),
    [contractAddress, walletAddress],
  );

  useEffect(() => {
    let active = true;
    readRegistration()
      .then((state) => {
        if (!active) {
          return;
        }
        setChecked(true);
        setRegistered(state.registered);
        setStatus(
          state.registered
            ? "On-chain-Dorf geladen …"
            : "Deine Wallet ist bestätigt. Erstelle jetzt einmalig dein On-chain-Dorf.",
        );
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setChecked(true);
        setStatus(
          "Der On-chain-Status konnte nicht gelesen werden. Bitte prüfe ihn erneut.",
        );
      });
    return () => {
      active = false;
    };
  }, [readRegistration]);

  const registerVillage = useCallback(async () => {
    if (registrationInFlight.current) {
      return;
    }
    registrationInFlight.current = true;
    setBusy(true);
    setStatus("Registrierungsstatus wird erneut geprüft …");
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
      setStatus(
        result.alreadyRegistered
          ? "On-chain-Dorf geladen …"
          : "Dorf erstellt. On-chain-Spielstand wird geladen …",
      );
    } catch {
      setRegistered(false);
      setChecked(true);
      setStatus(
        "Das Dorf wurde noch nicht bestätigt. Prüfe den Status und versuche es bei Bedarf erneut.",
      );
    } finally {
      registrationInFlight.current = false;
      setBusy(false);
    }
  }, [contractAddress, pollReceipt, walletAddress]);

  return { busy, checked, registered, registerVillage, status, worldAdapter };
}
