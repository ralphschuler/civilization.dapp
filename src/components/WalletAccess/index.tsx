"use client";

import { MiniKit } from "@worldcoin/minikit-js";
import dynamic from "next/dynamic";
import { useState } from "react";
import { verifyWalletForDirectGame } from "@/lib/direct-wallet-game-flow";

const CivilizationClient = dynamic(
  () => import("@/components/CivilizationClient"),
  { ssr: false },
);

type WalletAccessProps = {
  contractAddress: string;
  environment: "production" | "development";
  worldIdAppId: string;
  worldIdAction: string;
};

export const WalletAccess = ({
  contractAddress,
  environment,
  worldIdAppId,
  worldIdAction,
}: WalletAccessProps) => {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const handleWalletAccess = async () => {
    if (isPending) {
      return;
    }
    setIsPending(true);
    setFeedback(null);
    try {
      setWalletAddress(
        await verifyWalletForDirectGame({
          fetchImpl: fetch,
          walletAuth: (input: Parameters<typeof MiniKit.walletAuth>[0]) =>
            MiniKit.walletAuth(input),
        }),
      );
    } catch {
      setFeedback(
        "Wallet-Bestätigung konnte nicht geprüft werden. Bitte versuche es erneut.",
      );
    } finally {
      setIsPending(false);
    }
  };
  if (walletAddress) {
    return (
      <CivilizationClient
        key={`${contractAddress}:${walletAddress}`}
        walletAddress={walletAddress}
        contractAddress={contractAddress}
        environment={environment}
        worldIdAppId={worldIdAppId}
        worldIdAction={worldIdAction}
      />
    );
  }
  return (
    <main className="game-access-gate">
      <div className="game-access-card">
        <span className="game-access-mark">CD</span>
        <p>WORLD MINI APP</p>
        <h1>Civilization</h1>
        <span>Dein Spielzugang wird direkt in World App bestätigt.</span>
        <section className="wallet-access" aria-label="Wallet bestätigen">
          <p>Bestätige deine World Wallet, um Civilization zu starten.</p>
          <button
            type="button"
            onClick={handleWalletAccess}
            disabled={isPending}
          >
            {isPending ? "Wallet wird bestätigt …" : "Civilization starten"}
          </button>
          {feedback ? <p aria-live="polite">{feedback}</p> : null}
        </section>
      </div>
    </main>
  );
};
