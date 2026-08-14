import { getAddress, isAddress } from 'viem';

const loginIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Accepts only sessions minted by the wallet-login ticket credentials flow. */
export function getAuthorizedWallet(session: unknown): string | null {
  const user = session && typeof session === 'object' && 'user' in session
    ? (session as { user?: unknown }).user : null;
  const walletAddress = user && typeof user === 'object' && 'walletAddress' in user
    ? (user as { walletAddress?: unknown }).walletAddress : null;
  const loginId = user && typeof user === 'object' && 'loginId' in user
    ? (user as { loginId?: unknown }).loginId : null;
  if (typeof walletAddress !== 'string' || typeof loginId !== 'string'
    || !isAddress(walletAddress) || !loginIdPattern.test(loginId)) return null;
  return getAddress(walletAddress);
}
