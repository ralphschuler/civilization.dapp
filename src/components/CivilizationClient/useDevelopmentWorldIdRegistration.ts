"use client";

import { useUserOperationReceipt } from "@worldcoin/minikit-react";
import { useCallback, useState } from "react";
import { registerWorldIdWithMiniKit } from "@/lib/world-id-registration";
import { worldGameClient } from "@/world-game";

export function useDevelopmentWorldIdRegistration({
  walletAddress,
  contractAddress,
  proof,
  onRegistered,
}: {
  walletAddress: string;
  contractAddress: string;
  proof: unknown;
  onRegistered: () => void;
}) {
  const { poll, reset } = useUserOperationReceipt({
    client: worldGameClient,
    confirmations: 1,
    timeout: 45_000,
  });
  const [sending, setSending] = useState(false);
  const [pendingUserOpHash, setPendingUserOpHash] = useState<string | null>(
    null,
  );
  const [message, setMessage] = useState(
    "Bestätige zuerst deine Einzigartigkeit mit World ID.",
  );

  const sendRegistration = useCallback(async () => {
    if (!proof || sending) return;
    setSending(true);
    try {
      const result = await registerWorldIdWithMiniKit({
        walletAddress,
        contractAddress,
        registration: proof,
        pollReceipt: poll,
        pendingUserOpHash,
        onPendingUserOpHash: setPendingUserOpHash,
      });
      onRegistered();
      setMessage(
        result.alreadyRegistered
          ? "Deine On-chain-Registrierung ist bereits bestätigt."
          : "World ID wurde on-chain registriert.",
      );
    } catch (error) {
      const terminal =
        error instanceof Error && error.message === "transaction_failed";
      if (terminal) setPendingUserOpHash(null);
      reset();
      setMessage(
        terminal
          ? "Die Registrierung ist fehlgeschlagen. Du kannst sie erneut senden."
          : pendingUserOpHash
            ? "Die Bestätigung dauert noch. Status wird beim nächsten Versuch erneut geprüft."
            : "Die Registrierung wurde nicht bestätigt. Bitte versuche es erneut.",
      );
    } finally {
      setSending(false);
    }
  }, [
    contractAddress,
    onRegistered,
    pendingUserOpHash,
    poll,
    proof,
    reset,
    sending,
    walletAddress,
  ]);

  return { message, pendingUserOpHash, sendRegistration, sending, setMessage };
}
