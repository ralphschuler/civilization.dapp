'use client';

import { MiniKit } from '@worldcoin/minikit-js';
import { getSession, signIn, signOut } from 'next-auth/react';
import { useRef, useState } from 'react';
import { getAddress, isAddress } from 'viem';
import { createAndConfirmWalletSession, safeLoginErrorCode } from '@/lib/civilization-login-session';

type LoginPhase = 'idle' | 'wallet' | 'confirming' | 'success' | 'error';
type LoginError = 'native_wallet_auth_failed' | 'wallet_auth_verification_failed' | 'session_creation_failed' | 'session_identity_mismatch' | 'wallet_auth_unavailable';

const statement = 'Bestätige deine World-Wallet für den Civilization-Spielzugang.';
const loginIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const friendlyErrors: Record<LoginError, string> = {
  native_wallet_auth_failed: 'Die Wallet-Anfrage wurde nicht abgeschlossen. Bitte versuche es erneut.',
  wallet_auth_verification_failed: 'Deine Anmeldung konnte nicht bestätigt werden. Bitte versuche es erneut.',
  session_creation_failed: 'Die Anmeldung konnte nicht eingerichtet werden. Bitte versuche es erneut.',
  session_identity_mismatch: 'Die Anmeldung passt nicht zu deiner Wallet. Bitte versuche es erneut.',
  wallet_auth_unavailable: 'Die Wallet ist gerade nicht erreichbar. Bitte versuche es erneut.',
};

export function CivilizationLogin() {
  const [phase, setPhase] = useState<LoginPhase>('idle');
  const [error, setError] = useState<LoginError | null>(null);
  const loginInFlight = useRef(false);

  const onClick = async () => {
    if (loginInFlight.current || phase === 'success') return;
    loginInFlight.current = true;
    let failureCode: LoginError = 'wallet_auth_unavailable';
    setError(null);
    setPhase('wallet');
    try {
      const response = await fetch('/api/wallet-auth/nonce', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('challenge_unavailable');
      const challenge: unknown = await response.json();
      if (!challenge || typeof challenge !== 'object') throw new Error('challenge_unavailable');
      const { nonce: issuedNonce, expires_at } = challenge as Record<string, unknown>;
      if (typeof issuedNonce !== 'string' || !/^[A-Za-z0-9]{8,}$/.test(issuedNonce)
        || typeof expires_at !== 'number' || !Number.isFinite(expires_at) || expires_at <= Date.now()) {
        throw new Error('challenge_unavailable');
      }
      const nonce = issuedNonce;
      const expirationTime = new Date(expires_at);
      failureCode = 'native_wallet_auth_failed';
      const result = await MiniKit.walletAuth({ nonce, statement, expirationTime });
      const payload = result && typeof result === 'object' && 'data' in result ? result.data : undefined;
      if (result.executedWith !== 'minikit' || !payload || typeof payload !== 'object'
        || typeof (payload as { address?: unknown }).address !== 'string'
        || typeof (payload as { message?: unknown }).message !== 'string'
        || typeof (payload as { signature?: unknown }).signature !== 'string') throw new Error('wallet_unavailable');
      failureCode = 'wallet_auth_verification_failed';
      setPhase('confirming');
      const verification = await fetch('/api/wallet-auth/verify', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ nonce, payload: result.data }),
      });
      const verified: unknown = await verification.json().catch(() => null);
      const data = verification.ok && verified && typeof verified === 'object' ? verified as Record<string, unknown> : null;
      if (!data || data.isValid !== true || typeof data.address !== 'string' || !isAddress(data.address)
        || typeof data.ticket !== 'string' || typeof data.loginId !== 'string' || !loginIdPattern.test(data.loginId)) throw new Error('verification_failed');
      const sessionResult = await createAndConfirmWalletSession({
        signIn, getSession, signOut, walletAddress: getAddress(data.address), loginId: data.loginId, ticket: data.ticket,
      });
      if (!sessionResult.sessionSuccess) {
        failureCode = safeLoginErrorCode(sessionResult.error) as LoginError;
        throw new Error('session_failed');
      }
      setPhase('success');
      window.location.assign('/game');
    } catch {
      setError(safeLoginErrorCode(failureCode) as LoginError);
      setPhase('error');
      loginInFlight.current = false;
    }
  };

  const pending = phase === 'wallet' || phase === 'confirming' || phase === 'success';
  const feedback = phase === 'wallet' ? 'Wallet-Anfrage wird geöffnet …'
    : phase === 'confirming' ? 'Anmeldung wird bestätigt …'
      : phase === 'success' ? 'Angemeldet. Dein Dorf wird geladen …' : error ? friendlyErrors[error] : null;

  return <section className="civilization-login" aria-label="World Wallet Anmeldung" aria-busy={pending}>
    <button className="civilization-login-button" type="button" onClick={onClick} disabled={pending} aria-describedby="civilization-login-feedback">
      {pending ? (phase === 'success' ? 'Dorf wird geöffnet …' : 'Bitte warten …') : 'Mit World Wallet anmelden'}
    </button>
    <p id="civilization-login-feedback" className={`civilization-login-feedback ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite" aria-atomic="true">
      {feedback}
    </p>
  </section>;
}
