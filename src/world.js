import { MiniKit } from "@worldcoin/minikit-js";

// World App injects this bridge before the Mini App JavaScript executes.
// Browser demos deliberately stay walletless and never ask for a connection.
export function installWorldAppBridge() {
  if (typeof window === "undefined" || !window.WorldApp) return { installed: false };
  const result = MiniKit.install(import.meta.env.VITE_WORLD_APP_ID);
  if (!result.success || !MiniKit.isInstalled()) return { installed: false };
  return { installed: true, walletAddress: MiniKit.user.walletAddress || null };
}
