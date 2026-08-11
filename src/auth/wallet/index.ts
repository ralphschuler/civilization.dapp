import { MiniKit } from '@worldcoin/minikit-js';
import { signIn } from 'next-auth/react';

/**
 * Authenticates a user via their wallet using a nonce-based challenge-response mechanism.
 *
 * This function generates a unique `nonce` and requests the user to sign it with their wallet,
 * producing a `signedNonce`. The `signedNonce` ensures the response we receive from wallet auth
 * is authentic and matches our session creation.
 *
 * @returns {Promise<SignInResponse>} The result of the sign-in attempt.
 * @throws {Error} If wallet authentication fails at any step.
 */
export const walletAuth = async () => {
  const nonceResponse = await fetch('/api/auth/wallet-nonce', { method: 'POST' });
  if (!nonceResponse.ok) throw new Error('wallet_auth_nonce_unavailable');
  const { nonce, signedNonce, statement, requestId, expiresAt } = await nonceResponse.json();

  const result = await MiniKit.walletAuth({
    nonce,
    expirationTime: new Date(expiresAt),
    notBefore: new Date(Date.now() - 30_000),
    statement,
    requestId,
  });
  if (result.executedWith !== 'minikit') throw new Error('world_app_wallet_required');
  const data = result.data;
  if (!data?.address || !data?.message || !data?.signature) throw new Error('wallet_auth_malformed');

  await signIn('credentials', {
    redirectTo: '/game',
    nonce,
    signedNonce,
    finalPayloadJson: JSON.stringify({
      status: 'success', address: data.address, message: data.message, signature: data.signature,
    }),
  });
};
