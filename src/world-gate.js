// Browser demo is deliberately limited to local development and the two
// published demo origins. All other locations must wait for World App.
export function isExplicitDemoLocation(location) {
  if (!location || typeof location.hostname !== "string") return false;

  const hostname = location.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const pathname = typeof location.pathname === "string" ? location.pathname : "/";

  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) return true;
  if (hostname === "ralphschuler.github.io") return true;
  return hostname === "nyphon.de" && (pathname === "/civilization.dapp" || pathname.startsWith("/civilization.dapp/"));
}

// A World Mini App must not expose the game UI until both steps of the access
// flow have completed. `verified` is assigned only after the v4 proof,
// MiniKit submission, and a World Chain mainnet playerState read confirm the
// wallet's registration.
export function canRenderGameWorld({ worldAppInstalled, worldIdStatus }) {
  return !worldAppInstalled || worldIdStatus === "verified";
}

export function canRetryWorldIdVerification(worldIdStatus) {
  return worldIdStatus === "not_verified" || worldIdStatus === "error" || worldIdStatus === "wallet_unavailable" || worldIdStatus === "wallet_auth_error";
}
