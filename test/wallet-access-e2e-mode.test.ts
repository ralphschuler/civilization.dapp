import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("WalletAccess E2E mode is limited to an explicit development server flag", async () => {
  const mode = await readFile(
    new URL("../src/lib/wallet-access-e2e-mode.ts", import.meta.url),
    "utf8",
  );

  assert.match(mode, /import "server-only"/);
  assert.match(mode, /env\.NODE_ENV === "development"/);
  assert.match(mode, /env\.CIVILIZATION_WALLET_E2E_TEST_MODE === "enabled"/);
});

test("E2E query inputs are read only within the server E2E gate", async () => {
  const page = await readFile(
    new URL("../src/app/page.tsx", import.meta.url),
    "utf8",
  );
  const gateStart = page.indexOf("if (walletAccessE2eModeEnabled()) {");
  const gateEnd = page.indexOf(
    "  const configuration = runtimeConfiguration();",
  );
  const e2eQueryParameters = [
    "appearanceE2e",
    "buildPanelE2e",
    "entryGuideE2e",
    "feedbackE2e",
    "raidHistoryE2e",
  ];

  assert.ok(gateStart >= 0);
  for (const parameter of e2eQueryParameters) {
    const read = page.indexOf(parameter, gateStart);
    assert.ok(read > gateStart && read < gateEnd, parameter);
  }
  assert.match(
    page.slice(gateStart, gateEnd),
    /<WalletAccessE2eHarness\s+appearanceE2e=\{appearanceE2e === "world"\}\s+initialFeedback=\{feedbackE2e\}\s+\/>/,
  );
  assert.doesNotMatch(
    page.slice(gateEnd),
    /appearanceE2e|buildPanelE2e|entryGuideE2e|feedbackE2e|raidHistoryE2e/,
  );
});
