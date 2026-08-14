'use client';

import { useUserOperationReceipt } from '@worldcoin/minikit-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { startCivilizationApp, stopCivilizationApp } from '@/app';
import {
  createWorldGameAdapter,
  readCivilizationState,
  registerWalletWithMiniKit,
  worldGameClient,
} from '@/world-game';

const RECEIPT_DEADLINE_MS = 60_000;

/**
 * This component is reached only after the server has verified WalletAuth/SIWE.
 * Its wallet is therefore the server-verified checksum identity; it never
 * accepts an address supplied to a registration call.
 */
export default function CivilizationClient({ walletAddress, contractAddress }: { walletAddress: string; contractAddress: string }) {
  const root = useRef<HTMLDivElement>(null);
  const registrationInFlight = useRef(false);
  const pendingRegistrationHash = useRef<string | null>(null);
  const { poll, reset } = useUserOperationReceipt({
    client: worldGameClient,
    confirmations: 1,
    timeout: 45_000,
  });
  const [registered, setRegistered] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('On-chain-Dorf wird geprüft …');

  const pollReceipt = useCallback((userOpHash: string) => new Promise<unknown>((resolve, reject) => {
    let finished = false;
    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      reset();
      reject(new Error('receipt_timeout'));
    }, RECEIPT_DEADLINE_MS);
    poll(userOpHash).then((result) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      resolve(result);
    }).catch((error) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      reject(error);
    });
  }), [poll, reset]);

  const worldAdapter = useMemo(
    () => createWorldGameAdapter({ walletAddress, contractAddress, pollReceipt }),
    [contractAddress, pollReceipt, walletAddress],
  );

  const readRegistration = useCallback(
    () => readCivilizationState(walletAddress, contractAddress),
    [contractAddress, walletAddress],
  );

  useEffect(() => {
    let active = true;
    setChecked(false);
    setRegistered(false);
    setStatus('On-chain-Dorf wird geprüft …');
    readRegistration().then((state) => {
      if (!active) return;
      setChecked(true);
      setRegistered(state.registered);
      setStatus(state.registered
        ? 'On-chain-Dorf geladen …'
        : 'Deine Wallet ist bestätigt. Erstelle jetzt einmalig dein On-chain-Dorf.');
    }).catch(() => {
      if (!active) return;
      setChecked(true);
      setStatus('Der On-chain-Status konnte nicht gelesen werden. Bitte prüfe ihn erneut.');
    });
    return () => { active = false; };
  }, [readRegistration]);

  useEffect(() => {
    if (!registered || !root.current) return;
    startCivilizationApp({
      root: root.current,
      worldAppInstalled: true,
      worldAccessConfirmed: true,
      worldWalletAddress: walletAddress,
      worldAdapter,
    });
    return stopCivilizationApp;
  }, [registered, walletAddress, worldAdapter]);

  const begin = useCallback(async () => {
    if (registrationInFlight.current) return;
    registrationInFlight.current = true;
    setBusy(true);
    setStatus('Registrierungsstatus wird erneut geprüft …');
    try {
      // registerWalletWithMiniKit always reads first, including every retry.
      const result = await registerWalletWithMiniKit({
        walletAddress,
        contractAddress,
        pollReceipt,
        pendingUserOpHash: pendingRegistrationHash.current,
        onPendingUserOpHash: (hash: string | null) => { pendingRegistrationHash.current = hash; },
      });
      setChecked(true);
      setRegistered(true);
      setStatus(result.alreadyRegistered ? 'On-chain-Dorf geladen …' : 'Dorf erstellt. On-chain-Spielstand wird geladen …');
    } catch {
      setRegistered(false);
      setChecked(true);
      setStatus('Das Dorf wurde noch nicht bestätigt. Prüfe den Status und versuche es bei Bedarf erneut.');
    } finally {
      registrationInFlight.current = false;
      setBusy(false);
    }
  }, [contractAddress, pollReceipt, walletAddress]);

  if (registered) return <div ref={root} />;
  return <main className="world-id-gate" aria-busy={busy}><div className="world-id-gate-card">
    <span className="world-id-gate-mark">CD</span><p>WORLD MINI APP</p><h1>Dein Dorf erstellen</h1>
    <span role="status" aria-live="polite" aria-atomic="true">{status}</span>
    <button className="world-access-action" onClick={begin} disabled={busy || !checked}>
      {busy ? 'Dorf wird erstellt …' : 'Dorf on-chain erstellen'}
    </button>
  </div></main>;
}
