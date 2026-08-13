import { verifySiweMessage } from '@worldcoin/minikit-js/siwe';
import { getAddress, isAddress } from 'viem';
import { LEGACY_WALLET_AUTH_STATEMENT } from './auth-challenge.js';

const MAX_MESSAGE_LENGTH = 16_384;
const MAX_SIGNATURE_LENGTH = 1_024;
const NONCE_PATTERN = /^[A-Za-z0-9]{8,128}$/;

export function isLegacyWalletAuthNonce(nonce) {
  return typeof nonce === 'string' && NONCE_PATTERN.test(nonce);
}

function hasBoundedString(value, maxLength) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

/**
 * Verifies precisely the legacy native Wallet Auth callback. This grants no
 * session or application authority; the injected verifier keeps its behavior
 * unit-testable without changing production verification.
 */
export async function verifyLegacyWalletAuthPayload(payload, nonce, statement, verifier = verifySiweMessage) {
  if (!isLegacyWalletAuthNonce(nonce)
    || statement !== LEGACY_WALLET_AUTH_STATEMENT
    || !payload
    || typeof payload !== 'object'
    || Array.isArray(payload)
    || !hasBoundedString(payload.address, 128)
    || !hasBoundedString(payload.message, MAX_MESSAGE_LENGTH)
    || !hasBoundedString(payload.signature, MAX_SIGNATURE_LENGTH)
    || !isAddress(payload.address)) return null;

  let verified;
  try {
    verified = await verifier(payload, nonce, LEGACY_WALLET_AUTH_STATEMENT);
  } catch {
    return null;
  }

  const signedAddress = verified?.siweMessageData?.address;
  if (!verified?.isValid || typeof signedAddress !== 'string' || !isAddress(signedAddress)) return null;

  try {
    const callbackAddress = getAddress(payload.address);
    const normalizedSignedAddress = getAddress(signedAddress);
    return callbackAddress === normalizedSignedAddress ? normalizedSignedAddress : null;
  } catch {
    return null;
  }
}
