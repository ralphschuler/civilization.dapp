'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- IDKit callback payloads are JSON values. */

import { IDKitRequestWidget } from '@worldcoin/idkit';
import { CredentialRequest } from '@worldcoin/idkit-core';
import type { IDKitDebugReport, IDKitResult } from '@worldcoin/idkit-core';
import { useUserOperationReceipt } from '@worldcoin/minikit-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { startCivilizationApp, stopCivilizationApp } from '@/app';
import type { PublicWorldRuntimeConfiguration } from '@/lib/runtime-config';
import {
  buildWorldIdRegistration,
  confirmWorldIdRegistration,
  getWorldIdConfig,
  isWorldAppBridgePresent,
  prepareWorldIdProofContext,
  submitWorldIdRegistration,
} from '@/world';
import { createWorldGameAdapter, worldGameClient } from '@/world-game';
import { formatWorldIdDiagnostic, sanitizeWorldIdDiagnostic } from '@/lib/world-id-diagnostic';

const ATTEMPTS = 21;
const RECEIPT_DEADLINE_MS = 60_000;

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'error_code' in error) return String(error.error_code);
  return String(error || 'world_id_failed');
}

export default function CivilizationClient({
  walletAddress,
  worldConfiguration,
}: {
  walletAddress: string;
  worldConfiguration: PublicWorldRuntimeConfiguration;
}) {
  const root = useRef<HTMLDivElement>(null);
  const config = useMemo(() => getWorldIdConfig(worldConfiguration), [worldConfiguration]);
  const { poll, reset } = useUserOperationReceipt({
    client: worldGameClient,
    confirmations: 1,
    timeout: 45_000,
  });
  const [bridge, setBridge] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [registrationPending, setRegistrationPending] = useState(false);
  const [status, setStatus] = useState('World App wird geprüft …');
  const [request, setRequest] = useState<any>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const verificationInProgress = useRef(false);
  const recoveryFromWidgetError = useRef(false);

  const pollReceipt = useCallback((userOpHash: string) => new Promise((resolve, reject) => {
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
    () => createWorldGameAdapter({ walletAddress, pollReceipt }),
    [pollReceipt, walletAddress],
  );

  const checkRegistration = useCallback(async (attempts = 1) => {
    const result = await confirmWorldIdRegistration({
      config,
      walletAddress,
      attempts,
      retryDelayMs: attempts > 1 ? 1_500 : 0,
    } as any);
    if (!result.ok) return false;
    setRequest(null);
    setWidgetOpen(false);
    setRegistrationPending(false);
    setStatus('World ID bestätigt. On-chain-Dorf wird geladen …');
    setRegistered(true);
    return true;
  }, [config, walletAddress]);

  useEffect(() => {
    let checks = 0;
    const detect = () => {
      if (isWorldAppBridgePresent()) {
        setBridge(true);
        return true;
      }
      checks += 1;
      if (checks >= 12) setStatus('Öffne Civilization direkt in World App. Zugang bleibt außerhalb geschlossen.');
      return false;
    };
    if (detect()) return;
    const timer = window.setInterval(() => { if (detect()) window.clearInterval(timer); }, 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!bridge || !config.configured) return;
    let active = true;
    checkRegistration().then((ok) => {
      if (active && !ok) setStatus('Bestätige einmalig deinen Proof of Human.');
    });
    return () => { active = false; };
  }, [bridge, checkRegistration, config.configured]);

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
    if (busy) return;
    setBusy(true);
    setStatus(registrationPending ? 'World-Chain-Registrierung wird erneut geprüft …' : 'Registrierungsstatus wird geprüft …');
    try {
      if (await checkRegistration()) return;
      if (registrationPending) {
        setStatus('Transaktion ist noch nicht bestätigt. Warte kurz und prüfe erneut. Kein neuer Proof nötig.');
        return;
      }
      const prepared = await prepareWorldIdProofContext({ config, walletAddress } as any);
      if (!prepared.ok) {
        setStatus(`Proof konnte nicht vorbereitet werden: ${prepared.reason}`);
        return;
      }
      setRequest(prepared);
      recoveryFromWidgetError.current = false;
      setWidgetOpen(true);
      setStatus('Bestätige den World-ID-Nachweis in World App.');
    } catch (error) {
      setStatus(`Prüfung fehlgeschlagen: ${errorText(error)}.`);
    } finally {
      setBusy(false);
    }
  }, [busy, checkRegistration, config, registrationPending, walletAddress]);

  const verify = useCallback(async (result: IDKitResult) => {
    verificationInProgress.current = true;
    setWidgetOpen(false);
    setBusy(true);
    setStatus('World-ID-Transaktion wird an World Chain gesendet …');
    try {
      const registration = buildWorldIdRegistration({ config, walletAddress, result } as any);
      const sent = await submitWorldIdRegistration(registration);
      if (!sent.ok) throw new Error(sent.reason);
      setRegistrationPending(true);
      setStatus('World Chain bestätigt deine Registrierung …');
      if (await checkRegistration(ATTEMPTS)) return;
      setStatus('Transaktion gesendet, aber noch nicht bestätigt. Warte kurz und prüfe erneut; kein neuer Proof nötig.');
    } catch (error) {
      setStatus(`World-ID-Verifizierung fehlgeschlagen: ${errorText(error)}.`);
    } finally {
      verificationInProgress.current = false;
      setBusy(false);
    }
  }, [checkRegistration, config, walletAddress]);

  const closeWidget = useCallback((open: boolean) => {
    setWidgetOpen(open);
    if (open) recoveryFromWidgetError.current = false;
    if (!open && !verificationInProgress.current && !recoveryFromWidgetError.current) {
      setBusy(false);
      setStatus('World ID wurde geschlossen. Du kannst die Verifizierung erneut starten.');
    }
  }, []);

  const handleWidgetError = useCallback((errorCode: unknown, debugReport?: IDKitDebugReport) => {
    verificationInProgress.current = false;
    recoveryFromWidgetError.current = true;
    setWidgetOpen(false);
    setBusy(false);
    const diagnostic = sanitizeWorldIdDiagnostic(errorCode, debugReport);
    const prefix = errorCode === 'user_rejected'
      ? 'World ID wurde abgebrochen. Du kannst die Verifizierung erneut starten'
      : `World ID meldet: ${formatWorldIdDiagnostic(diagnostic)}`;
    setStatus(`${prefix}.`);
  }, []);

  if (!bridge || !config.configured) {
    const title = config.configured ? 'World App erforderlich' : 'World-Konfiguration fehlt';
    return <main className="world-id-gate"><div className="world-id-gate-card"><span className="world-id-gate-mark">CD</span><p>WORLD MINI APP</p><h1>{title}</h1><span aria-live="polite">{status}</span></div></main>;
  }
  if (!registered) {
    return <main className="world-id-gate"><div className="world-id-gate-card">
      <span className="world-id-gate-mark">CD</span><p>WORLD MINI APP</p><h1>Mit World ID verifizieren</h1>
      <span aria-live="polite">{status}</span>
      <button className="world-access-action" onClick={begin} disabled={busy}>
        {busy ? 'Bitte warten …' : registrationPending ? 'Registrierung erneut prüfen' : 'Mit World ID verifizieren'}
      </button>
      {request && <IDKitRequestWidget
        open={widgetOpen}
        onOpenChange={closeWidget}
        app_id={config.appId as `app_${string}`}
        action={config.action}
        rp_context={request.rpContext}
        allow_legacy_proofs={true}
        environment="production"
        constraints={CredentialRequest('proof_of_human', { signal: walletAddress })}
        onSuccess={verify}
        onError={handleWidgetError}
      />}
    </div></main>;
  }
  return <div ref={root} />;
}
