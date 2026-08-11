import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MiniKitProvider, useMiniKit } from "@worldcoin/minikit-js/minikit-provider";
import { useUserOperationReceipt } from "@worldcoin/minikit-react";
import { createPublicClient, http } from "viem";
import { startCivilizationApp, stopCivilizationApp } from "./app.js";
import { WORLD_CHAIN_MAINNET_RPC_URL } from "./world.js";

function CivilizationApp() {
  const root = useRef(null);
  const { isInstalled } = useMiniKit();
  const [runtimeInstalled, setRuntimeInstalled] = useState(undefined);
  const client = useMemo(() => createPublicClient({ transport: http(WORLD_CHAIN_MAINNET_RPC_URL) }), []);
  const { poll } = useUserOperationReceipt({ client });

  useEffect(() => {
    if (isInstalled !== undefined) setRuntimeInstalled(isInstalled);
  }, [isInstalled]);

  useEffect(() => {
    // undefined means MiniKitProvider is still installing. Both explicit
    // outcomes preserve the browser demo while requiring World ID in World App.
    if (runtimeInstalled === undefined) return undefined;
    startCivilizationApp({ root: root.current, worldAppInstalled: runtimeInstalled, onUserOperation: poll });
    return () => stopCivilizationApp();
  }, [runtimeInstalled, poll]);

  return <div ref={root} />;
}

const mount = document.querySelector("#app");
if (!mount) throw new Error("app_mount_missing");

createRoot(mount).render(
  <MiniKitProvider props={{ appId: import.meta.env.VITE_WORLD_APP_ID }}>
    <CivilizationApp />
  </MiniKitProvider>,
);
