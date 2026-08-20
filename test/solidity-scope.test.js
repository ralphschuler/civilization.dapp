import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  SCOPE_FILE,
  checkedSolidityScope,
  discoverScopedSolidityFiles,
  validateSolidityScope,
} from "../scripts/solidity-scope.mjs";
import { SOLIDITY_RELEASE_SOLC_ARGS } from "../scripts/solidity-release-profile.mjs";

test("machine-readable Solidity scope classifies every project Solidity source", async () => {
  const [scope, sources, sourceText] = await Promise.all([
    checkedSolidityScope(),
    discoverScopedSolidityFiles(),
    readFile(SCOPE_FILE, "utf8"),
  ]);
  assert.deepEqual(validateSolidityScope(scope, sources), []);
  assert.ok(
    scope.production.includes("contracts/src/CivilizationBuybackVault.sol"),
  );
  assert.ok(
    scope.production.includes(
      "contracts/src/CivilizationRewardDistributor.sol",
    ),
  );
  assert.ok(
    scope.fixtures.includes("contracts/src/CivilizationGameV2Fixture.sol"),
  );
  assert.match(sourceText, /"schemaVersion": 1/);
});

test("unclassified contracts/src Solidity source is rejected", async () => {
  const scope = await checkedSolidityScope();
  const errors = validateSolidityScope(scope, [
    ...(await discoverScopedSolidityFiles()),
    "contracts/src/Unclassified.sol",
  ]);
  assert.deepEqual(errors, [
    "unclassified Solidity source: contracts/src/Unclassified.sol",
  ]);
});

test("Slither consumes the release compiler profile", async () => {
  const slitherScript = await readFile("scripts/security-slither.sh", "utf8");
  assert.match(slitherScript, /solidity-scope\.mjs --fixture-filter/);
  assert.match(slitherScript, /solidity-release-profile\.mjs --solc-args/);
  assert.equal(
    SOLIDITY_RELEASE_SOLC_ARGS,
    "--optimize --optimize-runs 10 --via-ir",
  );
});
