import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import solc from "solc";

const contractsDirectory = new URL("../contracts/src/", import.meta.url);

async function compileContracts() {
  const files = (await readdir(contractsDirectory)).filter((file) => file.endsWith(".sol")).sort();
  const sources = Object.fromEntries(await Promise.all(files.map(async (file) => [
    `contracts/src/${file}`,
    { content: await readFile(new URL(`../contracts/src/${file}`, import.meta.url), "utf8") },
  ])));
  return JSON.parse(solc.compile(JSON.stringify({
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  })));
}

test("all Solidity drafts compile deterministically with the pinned official solc", async () => {
  assert.equal(solc.version(), "0.8.30+commit.73712a01.Emscripten.clang");
  const output = await compileContracts();
  const errors = (output.errors || []).filter((item) => item.severity === "error");
  assert.deepEqual(errors, [], errors.map((item) => item.formattedMessage).join("\n"));
  const game = output.contracts["contracts/src/CivilizationGame.sol"].CivilizationGame;
  assert.ok(game);
  assert.ok(game.evm.bytecode.object.length > 0, "constructor bytecode must be generated");
  assert.ok(game.evm.deployedBytecode.object.length / 2 <= 24_576, "runtime bytecode must fit the EIP-170 limit");
});

test("CivilizationGame exposes only player-driven game transitions and a signed registration gate", async () => {
  const output = await compileContracts();
  const abi = output.contracts["contracts/src/CivilizationGame.sol"].CivilizationGame.abi;
  const functions = new Map(abi.filter((item) => item.type === "function").map((item) => [item.name, item]));
  for (const name of ["registerWorldId", "claim", "upgrade", "train", "startRaid", "resolveRaid", "playerState"]) {
    assert.ok(functions.has(name), `${name} must be part of the auditable contract interface`);
  }
  assert.equal(functions.get("registerWorldId").stateMutability, "nonpayable");
  for (const name of ["claim", "upgrade", "train", "startRaid", "resolveRaid"]) {
    assert.equal(functions.get(name).stateMutability, "nonpayable", `${name} must not accept funds`);
  }
  const events = new Set(abi.filter((item) => item.type === "event").map((item) => item.name));
  for (const name of ["WorldIdRegistered", "ResourcesClaimed", "BuildingUpgraded", "TroopsTrained", "RaidStarted", "RaidResolved"]) assert.ok(events.has(name));
});

test("contract source keeps backend authority limited to EIP-712 registration and protects replay paths", async () => {
  const source = await readFile(new URL("../contracts/src/CivilizationGame.sol", import.meta.url), "utf8");
  assert.match(source, /mapping\(bytes32 => address\) public nullifierOwner/);
  assert.match(source, /mapping\(bytes32 => bool\) public usedAttestationNonce/);
  assert.match(source, /MAX_ATTESTATION_TTL = 15 minutes/);
  assert.match(source, /_recover\(_hashTypedData\(structHash\), signature\) != backendAttestationSigner/);
  assert.match(source, /function _accrue\(Player storage player\) private/);
  assert.match(source, /function claim\(\) external onlyRegistered/);
  assert.match(source, /function resolveRaid\(\) external onlyRegistered/);
  assert.doesNotMatch(source, /function .*onlyBackend/i);
  assert.doesNotMatch(source, /\b(payable|transfer\(|approve\(|mint\(|burn\()/);
});
