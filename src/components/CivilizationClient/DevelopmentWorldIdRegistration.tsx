"use client";

import {
  IDKitRequestWidget,
  proofOfHuman,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";
import { useCallback, useState } from "react";
import { parseWorldIdV4Registration } from "@/lib/world-id-v4";
import { useDevelopmentWorldIdRegistration } from "./useDevelopmentWorldIdRegistration";

type Props = {
  walletAddress: string;
  contractAddress: string;
  appId: string;
  action: string;
  onRegistered: () => void;
};

type Registration = ReturnType<typeof parseWorldIdV4Registration>;

/** Dev-only proof and transaction are intentionally separate user gestures. */
export function DevelopmentWorldIdRegistration({
  walletAddress,
  contractAddress,
  appId,
  action,
  onRegistered,
}: Props) {
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [proof, setProof] = useState<Registration | null>(null);
  const [opening, setOpening] = useState(false);
  const { message, sendRegistration, sending, setMessage } =
    useDevelopmentWorldIdRegistration({
      walletAddress,
      contractAddress,
      proof,
      onRegistered,
    });

  const beginProof = useCallback(async () => {
    setOpening(true);
    setMessage("World-ID-Anfrage wird vorbereitet …");
    try {
      const response = await fetch("/api/rp-signature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, signal: walletAddress }),
      });
      if (!response.ok) throw new Error("rp_context_unavailable");
      const context = (await response.json()) as RpContext;
      if (!context || typeof context.rp_id !== "string" || !context.signature)
        throw new Error("invalid_rp_context");
      setRpContext(context);
      setOpening(true);
      setMessage("Bestätige die World-ID-Anfrage in World App.");
    } catch {
      setOpening(false);
      setMessage(
        "Die World-ID-Anfrage ist nicht verfügbar. Bitte prüfe die Dev-Konfiguration.",
      );
    }
  }, [action, setMessage, walletAddress]);

  const acceptProof = useCallback(
    (result: IDKitResult) => {
      try {
        setProof(parseWorldIdV4Registration(result, { action, walletAddress }));
        setMessage(
          "World ID bestätigt. Sende die getrennte On-chain-Registrierung, wenn du fortfahren möchtest.",
        );
      } catch {
        setMessage(
          "Die World-ID-Antwort passt nicht zu dieser Wallet oder Dev-Aktion.",
        );
      }
    },
    [action, setMessage, walletAddress],
  );

  return (
    <main className="game-access-gate" aria-busy={sending}>
      <div className="game-access-card">
        <span className="game-access-mark">CD</span>
        <p>WORLD MINI APP · DEVELOPMENT</p>
        <h1>World ID registrieren</h1>
        <p className="game-access-warning" role="note">
          Dev nutzt World Chain Mainnet. On-chain-Transaktionen und eingesetzte
          WLD sind echt.
        </p>
        <span role="status" aria-live="polite">
          {message}
        </span>
        <button
          className="game-access-action"
          type="button"
          onClick={beginProof}
          disabled={opening || sending}
        >
          {opening ? "World ID wird geöffnet …" : "1. World ID bestätigen"}
        </button>
        <button
          className="game-access-action"
          type="button"
          onClick={sendRegistration}
          disabled={!proof || sending}
        >
          {sending
            ? "On-chain-Registrierung wird bestätigt …"
            : "2. World ID on-chain registrieren"}
        </button>
        {rpContext ? (
          <IDKitRequestWidget
            open={opening}
            onOpenChange={setOpening}
            app_id={appId as `app_${string}`}
            action={action}
            rp_context={rpContext}
            environment="production"
            allow_legacy_proofs={false}
            preset={proofOfHuman({ signal: walletAddress })}
            onSuccess={acceptProof}
            onError={() =>
              setMessage(
                "World ID wurde abgebrochen oder konnte nicht bestätigt werden.",
              )
            }
          />
        ) : null}
      </div>
    </main>
  );
}
