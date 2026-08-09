import { IDKit, proofOfHuman } from "@worldcoin/idkit-core";
import { MiniKit } from "@worldcoin/minikit-js";

// This is deliberately stable: the Portal action and the server must use it too.
export const WORLD_ID_GAME_ACCESS_ACTION = "idlemint-game-access-v1";

const isHttpsUrl = (value) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};

export function getWorldIdConfig(env = import.meta.env) {
  const config = {
    appId: env?.VITE_WORLD_APP_ID || "",
    proofContextEndpoint: env?.VITE_WORLD_ID_PROOF_CONTEXT_URL || "",
    verifyEndpoint: env?.VITE_WORLD_ID_VERIFY_URL || "",
    environment: env?.VITE_WORLD_ID_ENVIRONMENT || "production",
  };
  return {
    ...config,
    configured: /^app_[a-zA-Z0-9]+$/.test(config.appId)
      && isHttpsUrl(config.proofContextEndpoint)
      && isHttpsUrl(config.verifyEndpoint)
      && config.environment === "production",
  };
}

// World App injects this bridge before the Mini App JavaScript executes.
// Browser demos deliberately stay walletless and never ask for a connection.
export function installWorldAppBridge() {
  if (typeof window === "undefined" || !window.WorldApp) return { installed: false };
  const result = MiniKit.install(import.meta.env.VITE_WORLD_APP_ID);
  if (!result.success || !MiniKit.isInstalled()) return { installed: false };
  return { installed: true, walletAddress: MiniKit.user.walletAddress || null };
}

function validRpContext(value) {
  return value && typeof value.rp_id === "string" && typeof value.nonce === "string"
    && Number.isFinite(value.created_at) && Number.isFinite(value.expires_at)
    && typeof value.signature === "string";
}

async function jsonResponse(response) {
  if (!response?.ok) throw new Error("server_rejected_request");
  return response.json();
}

/**
 * The client merely transports the proof. Its return value controls only local
 * UI; the backend must verify it and atomically record the action/nullifier.
 */
export async function requestWorldIdGameAccess({
  config = getWorldIdConfig(), fetchImpl = globalThis.fetch, idkit = IDKit,
} = {}) {
  if (!config.configured || typeof fetchImpl !== "function") return { ok: false, reason: "configuration_required" };
  try {
    const rpContext = await fetchImpl(config.proofContextEndpoint, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: WORLD_ID_GAME_ACCESS_ACTION }),
    }).then(jsonResponse);
    if (!validRpContext(rpContext)) return { ok: false, reason: "invalid_proof_context" };
    const request = await idkit.request({
      app_id: config.appId, action: WORLD_ID_GAME_ACCESS_ACTION, rp_context: rpContext,
      allow_legacy_proofs: false, environment: config.environment,
    }).preset(proofOfHuman());
    const completion = await request.pollUntilCompletion();
    if (!completion.success) return { ok: false, reason: completion.error || "proof_failed" };
    const verification = await fetchImpl(config.verifyEndpoint, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: WORLD_ID_GAME_ACCESS_ACTION, rp_id: rpContext.rp_id, idkitResponse: completion.result }),
    }).then(jsonResponse);
    return verification?.verified === true ? { ok: true } : { ok: false, reason: "verification_rejected" };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "verification_failed" };
  }
}
