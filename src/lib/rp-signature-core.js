import { getAddress, isAddress } from "viem";

export function isRpSigningConfigured({ signingKey, rpId }) {
  return (
    /^0x[0-9a-fA-F]{64}$/.test(signingKey || "") &&
    /^rp_[0-9a-fA-F]{16}$/.test(rpId || "")
  );
}

/** Converts the signing SDK result to IDKit v4's exact RpContext wire shape. */
export function rpContextResponse(rpId, signature) {
  if (
    !/^rp_[0-9a-fA-F]{16}$/.test(rpId || "") ||
    !signature ||
    typeof signature.sig !== "string" ||
    typeof signature.nonce !== "string" ||
    !Number.isFinite(Number(signature.createdAt)) ||
    !Number.isFinite(Number(signature.expiresAt))
  )
    throw new Error("invalid_rp_signature");
  return {
    rp_id: rpId,
    signature: signature.sig,
    nonce: signature.nonce,
    created_at: Number(signature.createdAt),
    expires_at: Number(signature.expiresAt),
  };
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
