'use client';

import { MiniKit } from '@worldcoin/minikit-js';
import { useState } from 'react';
import {
  normalizeNativeWalletAuthError,
  normalizeNativeWalletAuthResult,
} from '@/lib/native-wallet-auth-diagnostic';

type Diagnostic = Record<string, unknown>;
const statement = 'Bestätige deine World-Wallet für den Civilization-Spielzugang.';

export const NativeWalletAuthDiagnostic = () => {
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [isPending, setIsPending] = useState(false);

  const onClick = async () => {
    if (isPending) return;
    let nonce: string | undefined;
    let nativeResult: ReturnType<typeof normalizeNativeWalletAuthResult> | undefined;
    setIsPending(true);
    try {
      const response = await fetch('/api/wallet-auth/nonce', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Nonce konnte nicht geladen werden.');

      const challenge: unknown = await response.json();
      if (!challenge || typeof challenge !== 'object') throw new Error('Nonce konnte nicht geladen werden.');

      const { nonce: issuedNonce, expires_at } = challenge as Record<string, unknown>;
      if (
        typeof issuedNonce !== 'string'
        || !/^[A-Za-z0-9]{8,}$/.test(issuedNonce)
        || typeof expires_at !== 'number'
        || !Number.isFinite(expires_at)
        || expires_at <= Date.now()
      ) {
        throw new Error('Nonce konnte nicht geladen werden.');
      }

      nonce = issuedNonce;
      const expirationTime = new Date(expires_at);
      const result = await MiniKit.walletAuth({ nonce, statement, expirationTime });
      nativeResult = normalizeNativeWalletAuthResult(result);
      const payload = result && typeof result === 'object' && 'data' in result ? result.data : undefined;
      if (result.executedWith !== 'minikit'
        || !payload || typeof payload !== 'object'
        || typeof (payload as { address?: unknown }).address !== 'string'
        || typeof (payload as { message?: unknown }).message !== 'string'
        || typeof (payload as { signature?: unknown }).signature !== 'string') {
        throw new Error('Native Wallet Auth wurde nicht erfolgreich abgeschlossen.');
      }
      const verification = await fetch('/api/wallet-auth/verify', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ nonce, payload: result.data }),
      });
      const verificationResult: unknown = await verification.json().catch(() => ({ error: 'wallet_auth_verification_failed' }));
      setDiagnostic({ nonce, result: nativeResult, verification: verificationResult });
    } catch (error) {
      setDiagnostic({
        ...(nonce ? { nonce } : {}),
        ...(nativeResult ? { result: nativeResult } : {}),
        error: normalizeNativeWalletAuthError(error),
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section className="native-wallet-auth-diagnostic" aria-label="Native Wallet Auth Diagnose">
      <p>Nur Diagnose: Der native Callback wird ausschließlich zur SIWE-Prüfung an denselben Server gesendet. Es wird keine Sitzung erstellt; die Ausgabe bleibt lokal sichtbar.</p>
      <button type="button" onClick={onClick} disabled={isPending}>
        {isPending ? 'Native Auth wird getestet …' : 'Nur native Auth testen'}
      </button>
      <output className="native-wallet-auth-diagnostic-output" aria-live="polite">
        {diagnostic ? <pre>{JSON.stringify(diagnostic, null, 2)}</pre> : null}
      </output>
    </section>
  );
};
