"use client";

import { MiniKit } from "@worldcoin/minikit-js";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { verifyWalletForDirectGame } from "@/lib/direct-wallet-game-flow";

const CivilizationClient = dynamic(
  () => import("@/components/CivilizationClient"),
  { ssr: false },
);

type WalletAccessProps = {
  contractAddress: string;
  worldTokenAddress: string;
  environment: "production" | "development";
  /** Test-only dependency supplied by the server-gated E2E harness. */
  attemptWalletAccess?: WalletAccessAttempt;
  /** Keeps the E2E harness on the success state instead of loading the game. */
  onWalletAccessGranted?: (walletAddress: string) => void;
};

export type WalletAccessAttempt = () => Promise<string>;

type AccessStatus = "idle" | "pending" | "success" | "cancelled" | "failure";

const accessCopy = {
  idle: {
    action: "Mit World Wallet fortfahren",
    message: "",
  },
  pending: {
    action: "Wallet-Bestätigung wird geöffnet …",
    message: "Bestätige den Zugang sicher in deiner World App.",
  },
  success: {
    action: "Wallet bestätigt",
    message: "Deine Wallet wurde bestätigt. Civilization wird geöffnet …",
  },
  cancelled: {
    action: "Erneut versuchen",
    message:
      "Die Wallet-Bestätigung wurde abgebrochen. Du kannst es erneut versuchen.",
  },
  failure: {
    action: "Erneut versuchen",
    message:
      "Die Wallet-Bestätigung war nicht möglich. Bitte versuche es noch einmal.",
  },
} as const;

function wasCancelled(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "user_rejected")
  );
}

export const WalletAccess = ({
  contractAddress,
  worldTokenAddress,
  environment,
  attemptWalletAccess,
  onWalletAccessGranted,
}: WalletAccessProps) => {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [verifiedWalletAddress, setVerifiedWalletAddress] = useState<
    string | null
  >(null);
  const [status, setStatus] = useState<AccessStatus>("idle");
  const attemptInFlight = useRef(false);

  useEffect(() => {
    if (!verifiedWalletAddress) return;
    if (onWalletAccessGranted) {
      onWalletAccessGranted(verifiedWalletAddress);
      return;
    }
    const nextScreen = window.setTimeout(
      () => setWalletAddress(verifiedWalletAddress),
      250,
    );
    return () => window.clearTimeout(nextScreen);
  }, [onWalletAccessGranted, verifiedWalletAddress]);

  const handleWalletAccess = async () => {
    if (attemptInFlight.current) {
      return;
    }
    attemptInFlight.current = true;
    setStatus("pending");
    try {
      const verifyWallet =
        attemptWalletAccess ??
        (() =>
          verifyWalletForDirectGame({
            fetchImpl: fetch,
            walletAuth: (input: Parameters<typeof MiniKit.walletAuth>[0]) =>
              MiniKit.walletAuth(input),
          }));
      setVerifiedWalletAddress(await verifyWallet());
      setStatus("success");
    } catch (error) {
      setStatus(wasCancelled(error) ? "cancelled" : "failure");
    } finally {
      attemptInFlight.current = false;
    }
  };
  if (walletAddress) {
    return (
      <CivilizationClient
        key={`${contractAddress}:${walletAddress}`}
        walletAddress={walletAddress}
        contractAddress={contractAddress}
        worldTokenAddress={worldTokenAddress}
      />
    );
  }

  const isPending = status === "pending";
  const isLocked = isPending || status === "success";
  const copy = accessCopy[status];

  return (
    <main className="civilization-login" aria-busy={isPending}>
      <div className="civilization-login__backdrop" aria-hidden="true" />
      <section
        className="civilization-login__card"
        aria-labelledby="civilization-login-title"
      >
        <header className="civilization-login__header">
          <span className="civilization-login__mark" aria-hidden="true">
            CD
          </span>
          <div>
            <p className="civilization-login__eyebrow">Civilization</p>
            <p className="civilization-login__product">WORLD MINI APP</p>
          </div>
          {environment === "development" ? (
            <span className="civilization-login__dev">DEV</span>
          ) : null}
        </header>
        <div className="civilization-login__intro">
          <h1 id="civilization-login-title">Baue dein Reich. Zug um Zug.</h1>
          <p>
            Civilization bringt deine Strategie direkt in die World App –
            bereit, wenn du es bist.
          </p>
        </div>
        <section
          className="civilization-login__wallet"
          aria-label="Wallet-Zugang"
        >
          <p>
            Bestätige deine World Wallet, damit diese Oberfläche deine Adresse
            zuordnen kann.
          </p>
          <p className="civilization-login__safety" role="note">
            Diese Bestätigung autorisiert keinen Smart Contract. Jede
            On-chain-Aktion wird separat von deiner World Wallet signiert.
          </p>
          <p className="civilization-login__safety" role="note">
            Civilization fragt niemals nach deiner Seed Phrase oder deinem
            privaten Schlüssel.
          </p>
          <button
            type="button"
            onClick={handleWalletAccess}
            disabled={isLocked}
            className="civilization-login__action"
            aria-describedby="wallet-access-status"
          >
            {copy.action}
          </button>
          <p
            id="wallet-access-status"
            className="civilization-login__status"
            data-state={status}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {copy.message}
          </p>
        </section>
      </section>
    </main>
  );
};
