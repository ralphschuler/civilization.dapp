// Browser demo is deliberately limited to local development and the two
// published demo origins. All other locations must wait for World App.
export function isExplicitDemoLocation(location) {
  if (!location || typeof location.hostname !== "string") {
    return false;
  }

  const hostname = location.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const pathname =
    typeof location.pathname === "string" ? location.pathname : "/";

  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    return true;
  }
  if (hostname === "ralphschuler.github.io") {
    return true;
  }
  return (
    hostname === "nyphon.de" &&
    (pathname === "/civilization.dapp" ||
      pathname.startsWith("/civilization.dapp/"))
  );
}

// A World Mini App exposes the game only after the server has verified the
// wallet's WalletAuth/SIWE response. The browser demo has its own explicit
// location boundary and therefore needs no wallet access confirmation.
export function canRenderGameWorld({
  worldAppInstalled,
  walletAccessConfirmed,
}) {
  return !worldAppInstalled || walletAccessConfirmed;
}
