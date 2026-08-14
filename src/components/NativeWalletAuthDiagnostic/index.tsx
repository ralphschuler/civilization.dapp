'use client';

import { MiniKit } from '@worldcoin/minikit-js';
import { getSession, signIn, signOut } from 'next-auth/react';
import { useState } from 'react';
import { getAddress, isAddress } from 'viem';
import { createAndConfirmWalletSession, safeDiagnosticErrorCode } from '@/lib/native-wallet-auth-diagnostic';

type Diagnostic = {
  nativeSuccess: boolean;
  siweVerified: boolean;
  sessionSuccess: boolean;
  wallet?: string;
  error?: 'session_creation_failed' | 'session_identity_mismatch' | 'wallet_auth_unavailable' | 'native_wallet_auth_failed' | 'wallet_auth_verification_failed';
};
const statement = 'Bestätige deine World-Wallet für den Civilization-Spielzugang.';
const loginIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const maskWallet = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export const NativeWalletAuthDiagnostic = () => {
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [isPending, setIsPending] = useState(false);

  const onClick = async () => {
    if (isPending) return;
    let nativeSuccess = false;
    let siweVerified = false;
    let failureCode: Diagnostic['error'] = 'wallet_auth_unavailable';
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

      const nonce = issuedNonce;
      const expirationTime = new Date(expires_at);
      failureCode = 'native_wallet_auth_failed';
      const result = await MiniKit.walletAuth({ nonce, statement, expirationTime });
      const payload = result && typeof result === 'object' && 'data' in result ? result.data : undefined;
      if (result.executedWith !== 'minikit'
        || !payload || typeof payload !== 'object'
        || typeof (payload as { address?: unknown }).address !== 'string'
        || typeof (payload as { message?: unknown }).message !== 'string'
        || typeof (payload as { signature?: unknown }).signature !== 'string') {
        failureCode = 'native_wallet_auth_failed';
        throw new Error('native_wallet_auth_failed');
      }
      nativeSuccess = true;
      failureCode = 'wallet_auth_verification_failed';
      const verification = await fetch('/api/wallet-auth/verify', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ nonce, payload: result.data }),
      });
      const verificationResult: unknown = await verification.json().catch(() => ({ error: 'wallet_auth_verification_failed' }));
      const verified = verification.ok && verificationResult && typeof verificationResult === 'object'
        ? verificationResult as Record<string, unknown> : null;
      const address = verified?.address;
      const ticket = verified?.ticket;
      const loginId = verified?.loginId;
      if (!verified || verified.isValid !== true || typeof address !== 'string' || !isAddress(address)
        || typeof ticket !== 'string' || typeof loginId !== 'string' || !loginIdPattern.test(loginId)) {
        setDiagnostic({ nativeSuccess, siweVerified: false, sessionSuccess: false, error: 'wallet_auth_verification_failed' });
        return;
      }

      const walletAddress = getAddress(address);
      siweVerified = true;
      const sessionResult = await createAndConfirmWalletSession({
        signIn, getSession, signOut, walletAddress, loginId, ticket,
      });
      setDiagnostic({
        nativeSuccess,
        siweVerified,
        sessionSuccess: sessionResult.sessionSuccess,
        wallet: maskWallet(walletAddress),
        ...(sessionResult.error ? { error: safeDiagnosticErrorCode(sessionResult.error) } : {}),
      });
    } catch {
      setDiagnostic({
        nativeSuccess,
        siweVerified,
        sessionSuccess: false,
        error: safeDiagnosticErrorCode(failureCode),
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section className="native-wallet-auth-diagnostic" aria-label="Native Wallet Auth Diagnose">
      <p>Diagnose: Native Wallet Auth wird serverseitig per SIWE geprüft und erstellt anschließend eine lokale Auth.js-Sitzung. Es erfolgt keine Navigation.</p>
      <button type="button" onClick={onClick} disabled={isPending}>
        {isPending ? 'Native Auth wird getestet …' : 'Nur native Auth testen'}
      </button>
      <output className="native-wallet-auth-diagnostic-output" aria-live="polite">
        {diagnostic ? <>
          <p>Native Wallet Auth: {diagnostic.nativeSuccess ? 'erfolgreich' : 'fehlgeschlagen'}</p>
          <p>SIWE-Prüfung: {diagnostic.siweVerified ? 'erfolgreich' : 'fehlgeschlagen'}</p>
          <p>Auth.js-Sitzung: {diagnostic.sessionSuccess ? 'erfolgreich' : 'fehlgeschlagen'}</p>
          {diagnostic.wallet ? <p>Wallet: {diagnostic.wallet}</p> : null}
          {diagnostic.error ? <p>Fehlercode: {diagnostic.error}</p> : null}
          {diagnostic?.sessionSuccess ? <a className="native-wallet-auth-diagnostic-game-link" href="/game">Spiel öffnen</a> : null}
        </> : null}
      </output>
    </section>
  );
};
