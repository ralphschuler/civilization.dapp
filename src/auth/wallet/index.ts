import { MiniKit } from '@worldcoin/minikit-js';
import { Command, isCommandAvailable } from '@worldcoin/minikit-js/commands';
import { signIn } from 'next-auth/react';
import {
  confirmWalletSession,
  safeNativeWalletAuthReason,
  supportsWalletAuthV2,
  WalletAuthClientError,
} from './client-flow';

/**
 * Authenticates a user via their wallet using a nonce-based challenge-response mechanism.
 *
 * This function generates a unique `nonce` and requests the user to sign it with their wallet,
 * producing a `signedNonce`. The `signedNonce` ensures the response we receive from wallet auth
 * is authentic and matches our session creation.
 *
 * @returns {Promise<void>} Resolves after a confirmed sign-in and game navigation.
 * @throws {Error} If wallet authentication fails at any step.
 */
export const walletAuth = async () => {
  if (!MiniKit.isInWorldApp()) throw new WalletAuthClientError('bridge_unavailable');
  if (!MiniKit.isInstalled()
    || !isCommandAvailable(Command.WalletAuth)
    || !supportsWalletAuthV2((window as Window & {
      WorldApp?: { supported_commands?: unknown };
    }).WorldApp?.supported_commands)) {
    throw new WalletAuthClientError('wallet_auth_unsupported');
  }

  let nonceResponse: Response;
  try {
    nonceResponse = await fetch('/api/auth/wallet-nonce', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'cache-control': 'no-store' },
    });
  } catch {
    throw new WalletAuthClientError('nonce_unavailable');
  }
  if (!nonceResponse.ok) throw new WalletAuthClientError('nonce_unavailable');

  let challenge: { nonce?: string; signedNonce?: string; statement?: string; expiresAt?: string };
  try { challenge = await nonceResponse.json(); } catch { throw new WalletAuthClientError('nonce_unavailable'); }
  const { nonce, signedNonce, statement, expiresAt } = challenge;
  if (!nonce || !signedNonce || !statement || typeof expiresAt !== 'string') {
    throw new WalletAuthClientError('nonce_unavailable');
  }
  const expirationTime = new Date(expiresAt);
  if (Number.isNaN(expirationTime.getTime()) || expirationTime.getTime() <= Date.now()) {
    throw new WalletAuthClientError('nonce_unavailable');
  }

  let result;
  try {
    result = await MiniKit.walletAuth({ nonce, statement, expirationTime });
  } catch (error) {
    throw new WalletAuthClientError('native_rejected', safeNativeWalletAuthReason(error));
  }
  if (result.executedWith !== 'minikit') throw new WalletAuthClientError('native_rejected');
  const data = result.data;
  if (!data?.address || !data?.message || !data?.signature) throw new WalletAuthClientError('malformed_response');

  let signInResult;
  try {
    signInResult = await signIn('credentials', {
      redirect: false,
      nonce,
      signedNonce,
      finalPayloadJson: JSON.stringify({
        status: 'success', address: data.address, message: data.message, signature: data.signature,
      }),
    });
  } catch {
    throw new WalletAuthClientError('credentials_rejected');
  }

  if (!signInResult || !signInResult.ok || signInResult.error) throw new WalletAuthClientError('credentials_rejected');

  if (!(await confirmWalletSession(fetch, data.address))) {
    throw new WalletAuthClientError('session_cookie_rejected');
  }
  window.location.assign('/game');
};
