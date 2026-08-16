"use client";

import { useCallback, useState } from "react";
import { WalletAccess, type WalletAccessAttempt } from "./index";

type Scenario = "success" | "rejected";

const TEST_WALLET_ADDRESS = "0x0000000000000000000000000000000000000001";

/**
 * This component is mounted only by the server-side E2E gate. Its injected
 * attempt never invokes MiniKit, fetch, SIWE, or a wallet provider.
 */
export function WalletAccessE2eHarness() {
  const [scenario, setScenario] = useState<Scenario>("success");
  const handleAccessGranted = useCallback(() => undefined, []);
  const attempt: WalletAccessAttempt = useCallback(
    () =>
      new Promise((resolve, reject) => {
        window.setTimeout(() => {
          if (scenario === "rejected") {
            reject({ code: "user_rejected" });
            return;
          }
          resolve(TEST_WALLET_ADDRESS);
        }, 150);
      }),
    [scenario],
  );

  return (
    <>
      <WalletAccess
        contractAddress={TEST_WALLET_ADDRESS}
        environment="development"
        worldIdAppId=""
        worldIdAction=""
        attemptWalletAccess={attempt}
        onWalletAccessGranted={handleAccessGranted}
      />
      <aside className="wallet-access-e2e-controls" aria-label="E2E controls">
        <label htmlFor="wallet-access-e2e-scenario">Test scenario</label>
        <select
          id="wallet-access-e2e-scenario"
          data-testid="wallet-access-e2e-scenario"
          value={scenario}
          onChange={(event) => setScenario(event.target.value as Scenario)}
        >
          <option value="success">Success</option>
          <option value="rejected">User rejected</option>
        </select>
      </aside>
    </>
  );
}
