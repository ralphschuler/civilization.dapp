/**
 * Validates the SIWE fields that bind a Wallet Auth response to this app.
 * This stays deliberately strict because MiniKit's runtime parser exposes
 * chain_id as either a number or its decimal string representation.
 *
 * @param {{ domain: unknown, uri: unknown, version: unknown, chainId: unknown }} message
 * @param {string | undefined} authUrl
 * @returns {boolean}
 */
export function hasValidSiweBinding(message, authUrl) {
  if (typeof authUrl !== 'string') return false;

  let expected;
  let signedUri;
  try {
    expected = new URL(authUrl);
    signedUri = typeof message.uri === 'string' ? new URL(message.uri) : null;
  } catch {
    return false;
  }

  if (expected.protocol !== 'https:' || !signedUri) return false;

  const validDomain = message.domain === expected.host || message.domain === expected.origin;
  const validChainId = message.chainId === 480 || message.chainId === '480';

  return validDomain
    && signedUri.origin === expected.origin
    && message.version === '1'
    && validChainId;
}
