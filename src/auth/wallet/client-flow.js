import { getAddress, isAddress } from 'viem';

const SAFE_NATIVE_REASONS = new Set(['malformed_request', 'user_rejected', 'generic_error']);

export const WalletReadiness = Object.freeze({
  OutsideWorldApp: 'outside_world_app',
  Initializing: 'initializing',
  BridgeUnavailable: 'bridge_unavailable',
  Unsupported: 'wallet_auth_unsupported',
  Ready: 'ready',
});

export class WalletAuthClientError extends Error {
  constructor(stage, reason) {
    super(stage);
    this.name = 'WalletAuthClientError';
    this.stage = stage;
    this.reason = reason;
  }
}

export function safeNativeWalletAuthReason(error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && SAFE_NATIVE_REASONS.has(code) ? code : undefined;
}

export function supportsWalletAuthV2(supportedCommands) {
  return Array.isArray(supportedCommands) && supportedCommands.some((command) => (
    command
    && typeof command === 'object'
    && command.name === 'wallet-auth'
    && Array.isArray(command.supported_versions)
    && command.supported_versions.includes(2)
  ));
}

export function getWalletReadiness({
  inWorldApp,
  miniKitInstalled,
  walletAuthAvailable,
  supportedCommands,
  attempts,
  maxAttempts,
}) {
  const walletAuthV2 = supportsWalletAuthV2(supportedCommands);
  if (inWorldApp && miniKitInstalled && walletAuthAvailable && walletAuthV2) {
    return WalletReadiness.Ready;
  }

  // The native bridge may be injected after React has mounted. Do not classify
  // the first missing bridge as an external browser.
  if (attempts < maxAttempts) return WalletReadiness.Initializing;
  if (!inWorldApp) return WalletReadiness.OutsideWorldApp;
  if (!miniKitInstalled) return WalletReadiness.BridgeUnavailable;
  return WalletReadiness.Unsupported;
}

export function sessionMatchesWallet(session, walletAddress) {
  const sessionAddress = session?.user?.walletAddress;
  if (typeof sessionAddress !== 'string' || typeof walletAddress !== 'string'
    || !isAddress(sessionAddress) || !isAddress(walletAddress)) return false;
  return getAddress(sessionAddress) === getAddress(walletAddress);
}

export async function confirmWalletSession(fetchSession, walletAddress) {
  try {
    const response = await fetchSession('/api/auth/session', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json', 'cache-control': 'no-store' },
    });
    if (!response?.ok) return false;
    return sessionMatchesWallet(await response.json(), walletAddress);
  } catch {
    return false;
  }
}
