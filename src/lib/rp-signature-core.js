import { getAddress, isAddress } from "viem";

export function isRpSigningConfigured({ signingKey, rpId, liveRpId }) {
  return /^0x[0-9a-fA-F]{64}$/.test(signingKey || "") && rpId === liveRpId;
}

/** The public RP context has no authority over game state; only valid wallet signals are accepted. */
export function validateRpSignatureRequest(body, { action }) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { kind: "invalid_payload" };
  if (body.action !== action) return { kind: "invalid_action" };
  if (typeof body.signal !== "string" || !isAddress(body.signal))
    return { kind: "invalid_signal" };
  return { kind: "success", signal: getAddress(body.signal) };
}
