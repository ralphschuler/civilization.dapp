import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CONTRACT_STATUS } from "../server/contract-status.js";

test("contract status identifies the unaudited World Chain mainnet deployment without settlement", () => {
  assert.equal(CONTRACT_STATUS.release, "mainnet_wallet_registration_deployed_no_settlement");
  assert.equal(CONTRACT_STATUS.deployment, "worldchain_mainnet_wallet_registration_deployed");
  assert.equal(CONTRACT_STATUS.independentlyAudited, false);
  assert.equal(CONTRACT_STATUS.settlementEnabled, false);
  assert.deepEqual(CONTRACT_STATUS.deployedContracts, [{
    name: "CivilizationGame",
    address: "0x71564689Fa320bA010561A880CfE2896b6Dc8f8b",
    chainId: 480,
    status: "mainnet_wallet_registration_deployed_not_independently_audited",
  }]);
  assert.equal(CONTRACT_STATUS.onChainActionsEnabled, true);
  assert.equal(CONTRACT_STATUS.custodyEnabled, false);
  assert.equal(CONTRACT_STATUS.paymentsEnabled, false);
  assert.equal(CONTRACT_STATUS.withdrawalsEnabled, false);
  assert.equal(CONTRACT_STATUS.contracts.length, 3);
  assert.equal(CONTRACT_STATUS.contracts.some(({ source }) => /idle/i.test(source)), false);
});

test("Solidity sources remain free of deployment configuration", async () => {
  for (const contract of CONTRACT_STATUS.contracts) {
    const source = await readFile(new URL(`../${contract.source}`, import.meta.url), "utf8");
    assert.match(source, /pragma solidity \^0\.8\.24;/);
    assert.doesNotMatch(source, /0x[a-fA-F0-9]{40}/);
  }
});
