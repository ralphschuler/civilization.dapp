'use client';

import { MiniKit } from '@worldcoin/minikit-js';
import { useState } from 'react';
import {
  normalizeNativeWalletAuthError,
  normalizeNativeWalletAuthResult,
} from '@/lib/native-wallet-auth-diagnostic';

type Diagnostic = Record<string, unknown>;

export const NativeWalletAuthDiagnostic = () => {
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [isPending, setIsPending] = useState(false);

  const onClick = async () => {
    if (isPending) return;
    let nonce: string | undefined;
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
      const result = await MiniKit.walletAuth({ nonce, statement: "Bestätige deine World-Wallet für den Civilization-Spielzugang.", expirationTime });
      setDiagnostic({ nonce, result: normalizeNativeWalletAuthResult(result) });
    } catch (error) {
      setDiagnostic({ ...(nonce ? { nonce } : {}), error: normalizeNativeWalletAuthError(error) });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section className="native-wallet-auth-diagnostic" aria-label="Native Wallet Auth Diagnose">
      <p>Nur Diagnose: erstellt keine Sitzung und sendet keine Callback-Daten. Die Ausgabe enthält sensible Wallet-Daten und bleibt nur auf diesem Gerät sichtbar.</p>
      <button type="button" onClick={onClick} disabled={isPending}>
        {isPending ? 'Native Auth wird getestet …' : 'Nur native Auth testen'}
      </button>
      <output className="native-wallet-auth-diagnostic-output" aria-live="polite">
        {diagnostic ? <pre>{JSON.stringify(diagnostic, null, 2)}</pre> : null}
      </output>
    </section>
  );
};
