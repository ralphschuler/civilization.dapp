'use client';

import { MiniKit } from '@worldcoin/minikit-js';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { PublicWorldRuntimeConfiguration } from '@/lib/runtime-config';
import { verifyWalletForDirectGame } from '@/lib/direct-wallet-game-flow';

// The game imports IDKit and starts its runtime; do not load either before WalletAuth succeeds.
const CivilizationClient = dynamic(() => import('@/components/CivilizationClient'), { ssr: false });

export const NativeWalletAuthDiagnostic = ({ worldConfiguration }: { worldConfiguration: PublicWorldRuntimeConfiguration }) => {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const onClick = async () => {
    if (isPending) return;
    setIsPending(true);
    setFeedback(null);
    try {
      setWalletAddress(await verifyWalletForDirectGame({
        fetchImpl: fetch,
        walletAuth: (input: Parameters<typeof MiniKit.walletAuth>[0]) => MiniKit.walletAuth(input),
      }));
    } catch {
      setFeedback('Wallet-Bestätigung konnte nicht geprüft werden. Bitte versuche es erneut.');
    } finally {
      setIsPending(false);
    }
  };

  // This is deliberately outside the gate markup: a verified player gets the full game page.
  if (walletAddress) return <CivilizationClient walletAddress={walletAddress} worldConfiguration={worldConfiguration} worldAppConfirmed={true} />;

  return (
    <main className="world-id-gate">
      <div className="world-id-gate-card">
        <span className="world-id-gate-mark">CD</span><p>WORLD MINI APP</p><h1>Civilization</h1>
        <span>Dein Spielzugang wird direkt in World App bestätigt.</span>
        <section className="native-wallet-auth-diagnostic" aria-label="Wallet bestätigen">
          <p>Bestätige deine World Wallet, um Civilization zu starten.</p>
          <button type="button" onClick={onClick} disabled={isPending}>
            {isPending ? 'Wallet wird bestätigt …' : 'Civilization starten'}
          </button>
          {feedback ? <p aria-live="polite">{feedback}</p> : null}
        </section>
      </div>
    </main>
  );
};
