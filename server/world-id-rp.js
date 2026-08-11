import { signRequest } from "@worldcoin/idkit-core/signing";

const RP_ID_PATTERN = /^rp_([0-9a-fA-F]{1,16})$/;
const ACTION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const PRIVATE_KEY_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/;
const DEFAULT_TTL_SECONDS = 300;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 600;

function ttlFromEnvironment(value) {
  if (value === undefined || value === "") return DEFAULT_TTL_SECONDS;
  if (!/^\d+$/.test(value)) return null;
  const ttl = Number(value);
  return Number.isSafeInteger(ttl) && ttl >= MIN_TTL_SECONDS && ttl <= MAX_TTL_SECONDS ? ttl : null;
}

/**
 * Reads only server-side World ID settings. The private key is intentionally
 * never returned, logged, or made available to the browser build.
 */
export function getWorldIdRpConfiguration(environment = process.env) {
  const rpId = environment.WORLD_ID_RP_ID || "";
  const action = environment.WORLD_ID_ACTION || "";
  const signingKey = environment.WORLD_ID_RP_SIGNING_KEY || "";
  const ttl = ttlFromEnvironment(environment.WORLD_ID_RP_CONTEXT_TTL_SECONDS);
  const configured = RP_ID_PATTERN.test(rpId)
    && ACTION_ID_PATTERN.test(action)
    && PRIVATE_KEY_PATTERN.test(signingKey)
    && ttl !== null;
  return {
    configured,
    rpId,
    action,
    signingKey,
    ttl,
  };
}

/** Converts Portal's `rp_<hex>` identifier to the uint64 used by WorldIDVerifier. */
export function worldRpIdToUint64(rpId) {
  const match = RP_ID_PATTERN.exec(rpId || "");
  if (!match) throw new Error("invalid_world_id_rp_id");
  const value = BigInt(`0x${match[1]}`);
  if (value === 0n || value > 0xffffffffffffffffn) throw new Error("invalid_world_id_rp_id");
  return value;
}

/**
 * Signs an RP context for the one configured action. Request payloads do not
 * choose the action; wallet binding is checked by CivilizationGame on-chain.
 */
export function createWorldIdProofContext({ environment = process.env, signer = signRequest } = {}) {
  const config = getWorldIdRpConfiguration(environment);
  if (!config.configured) throw new Error("world_id_rp_not_configured");
  const signed = signer({
    signingKeyHex: config.signingKey,
    action: config.action,
    ttl: config.ttl,
  });
  if (!signed || typeof signed.sig !== "string" || typeof signed.nonce !== "string"
    || !Number.isSafeInteger(signed.createdAt) || !Number.isSafeInteger(signed.expiresAt)) {
    throw new Error("world_id_rp_signing_failed");
  }
  return {
    rp_id: config.rpId,
    nonce: signed.nonce,
    created_at: signed.createdAt,
    expires_at: signed.expiresAt,
    signature: signed.sig,
  };
}
