import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CONTRACT_STATUS } from "../server/contract-status.js";

test("contract status is explicitly non-deployed and quote-only", () => {
  assert.equal(CONTRACT_STATUS.release, "beta_quote_only");
  assert.equal(CONTRACT_STATUS.deployment, "not_deployed");
  assert.deepEqual(CONTRACT_STATUS.deployedContracts, []);
  assert.equal(CONTRACT_STATUS.onChainActionsEnabled, false);
  assert.equal(CONTRACT_STATUS.custodyEnabled, false);
  assert.equal(CONTRACT_STATUS.paymentsEnabled, false);
  assert.equal(CONTRACT_STATUS.withdrawalsEnabled, false);
  assert.equal(CONTRACT_STATUS.contracts.length, 4);
});

test("Solidity sources declare drafts but no hard-coded deployment address", async () => {
  for (const contract of CONTRACT_STATUS.contracts) {
    const source = await readFile(new URL(`../${contract.source}`, import.meta.url), "utf8");
    assert.match(source, /pragma solidity \^0\.8\.24;/);
    assert.doesNotMatch(source, /0x[a-fA-F0-9]{40}/);
  }
});
