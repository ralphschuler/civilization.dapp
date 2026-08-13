import { getAddress, isAddress } from 'viem';

/** Requires the fresh session to identify this exact wallet login, not just its wallet. */
export function sessionMatchesWalletLogin(session, walletAddress, loginId) {
  const sessionAddress = session?.user?.walletAddress;
  const sessionLoginId = session?.user?.loginId;
  if (typeof sessionAddress !== 'string' || typeof sessionLoginId !== 'string'
    || typeof walletAddress !== 'string' || typeof loginId !== 'string'
    || !isAddress(sessionAddress) || !isAddress(walletAddress)) return false;
  return getAddress(sessionAddress) === getAddress(walletAddress) && sessionLoginId === loginId;
}

const diagnosticErrorCodes = new Set([
  'native_wallet_auth_failed',
  'wallet_auth_verification_failed',
  'session_creation_failed',
  'session_identity_mismatch',
  'wallet_auth_unavailable',
]);

export function safeDiagnosticErrorCode(code) {
  return diagnosticErrorCodes.has(code) ? code : 'wallet_auth_unavailable';
}

/**
 * Completes the local Auth.js leg after SIWE has already succeeded. Its result
 * deliberately contains no ticket, nonce, callback, or unmasked wallet.
 */
export async function createAndConfirmWalletSession({ signIn, getSession, signOut, walletAddress, loginId, ticket }) {
  try {
    const signInResult = await signIn('credentials', { redirect: false, redirectTo: '/', ticket });
    if (!signInResult || !signInResult.ok || signInResult.error) {
      return { sessionSuccess: false, error: 'session_creation_failed' };
    }
  } catch {
    return { sessionSuccess: false, error: 'session_creation_failed' };
  }

  try {
    const session = await getSession({ broadcast: false });
    if (sessionMatchesWalletLogin(session, walletAddress, loginId)) return { sessionSuccess: true };
  } catch {
    return { sessionSuccess: false, error: 'wallet_auth_unavailable' };
  }

  await signOut({ redirect: false }).catch(() => undefined);
  return { sessionSuccess: false, error: 'session_identity_mismatch' };
}
