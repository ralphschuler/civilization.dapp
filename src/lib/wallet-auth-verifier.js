import { verifySiweMessage } from "@worldcoin/minikit-js/siwe";
import { getAddress, isAddress } from "viem";
import { WALLET_AUTH_STATEMENT } from "./auth-challenge.js";
import { hasValidSiweBinding } from "../auth/siwe-binding.js";

const MAX_MESSAGE_LENGTH = 16_384;
const MAX_SIGNATURE_LENGTH = 1_024;
const NONCE_PATTERN = /^[A-Za-z0-9]{8,128}$/;

export function isWalletAuthNonce(nonce) {
  return typeof nonce === "string" && NONCE_PATTERN.test(nonce);
}

function hasBoundedString(value, maxLength) {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maxLength
  );
}

function requireHttpsAuthUrl(authUrl) {
  try {
    if (typeof authUrl !== "string" || new URL(authUrl).protocol !== "https:")
      throw new Error();
    return authUrl;
  } catch {
    throw new Error("wallet_auth_configuration_unavailable");
  }
}

/**
 * Verifies precisely the native WalletAuth callback. This grants no
 * session or application authority; the injected verifier keeps its behavior
 * unit-testable without changing production verification.
 */
export async function verifyWalletAuthPayload(
  payload,
  nonce,
  statement,
  verifier = verifySiweMessage,
  authUrl = process.env.WALLET_AUTH_URL,
) {
  if (
    !isWalletAuthNonce(nonce) ||
    statement !== WALLET_AUTH_STATEMENT ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !hasBoundedString(payload.address, 128) ||
    !hasBoundedString(payload.message, MAX_MESSAGE_LENGTH) ||
    !hasBoundedString(payload.signature, MAX_SIGNATURE_LENGTH) ||
    !isAddress(payload.address)
  )
    return null;

  const expectedAuthUrl = requireHttpsAuthUrl(authUrl);

  let verified;
  try {
    verified = await verifier(payload, nonce, WALLET_AUTH_STATEMENT);
  } catch {
    return null;
  }

  const signedAddress = verified?.siweMessageData?.address;
  if (
    !verified?.isValid ||
    typeof signedAddress !== "string" ||
    !isAddress(signedAddress)
  )
    return null;
  if (
    !hasValidSiweBinding(
      {
        domain: verified.siweMessageData.domain,
        uri: verified.siweMessageData.uri,
        version: verified.siweMessageData.version,
        chainId: verified.siweMessageData.chain_id,
      },
      expectedAuthUrl,
    )
  )
    return null;

  try {
    const callbackAddress = getAddress(payload.address);
    const normalizedSignedAddress = getAddress(signedAddress);
    return callbackAddress === normalizedSignedAddress
      ? normalizedSignedAddress
      : null;
  } catch {
    return null;
  }
}
