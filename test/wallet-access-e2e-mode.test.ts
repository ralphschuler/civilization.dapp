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

test("feedback E2E query input is read only within the server E2E gate", async () => {
  const page = await readFile(
    new URL("../src/app/page.tsx", import.meta.url),
    "utf8",
  );
  const gateStart = page.indexOf("if (walletAccessE2eModeEnabled()) {");
  const gateEnd = page.indexOf(
    "  const configuration = runtimeConfiguration();",
  );
  const feedbackRead = page.indexOf("feedbackE2e", gateStart);

  assert.ok(gateStart >= 0);
  assert.ok(feedbackRead > gateStart && feedbackRead < gateEnd);
  assert.match(
    page.slice(gateStart, gateEnd),
    /<WalletAccessE2eHarness initialFeedback=\{feedbackE2e\} \/>/,
  );
  assert.doesNotMatch(page.slice(gateEnd), /feedbackE2e/);
});
