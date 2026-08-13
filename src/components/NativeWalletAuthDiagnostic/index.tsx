'use client';

import { MiniKit } from '@worldcoin/minikit-js';
import { useState } from 'react';
import {
  generateNativeWalletAuthNonce,
  normalizeNativeWalletAuthError,
  normalizeNativeWalletAuthResult,
} from '@/lib/native-wallet-auth-diagnostic';

type Diagnostic = Record<string, unknown>;

export const NativeWalletAuthDiagnostic = () => {
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [isPending, setIsPending] = useState(false);

  const onClick = async () => {
    if (isPending) return;
    const nonce = generateNativeWalletAuthNonce();
    const expirationTime = new Date(Date.now() + 5 * 60_000);
    setIsPending(true);
    try {
      const result = await MiniKit.walletAuth({ nonce, statement: "Bestätige deine World-Wallet für den Civilization-Spielzugang.", expirationTime });
      setDiagnostic({ nonce, result: normalizeNativeWalletAuthResult(result) });
    } catch (error) {
      setDiagnostic({ nonce, error: normalizeNativeWalletAuthError(error) });
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
