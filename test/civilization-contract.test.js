import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createBlock } from "@ethereumjs/block";
import { bytesToHex, createAddressFromString, hexToBytes } from "@ethereumjs/util";
import { createVM } from "@ethereumjs/vm";
import solc from "solc";
import {
  concatHex,
  decodeFunctionResult,
  encodeAbiParameters,
  encodePacked,
  encodeFunctionData,
  keccak256,
  padHex,
  stringToHex,
  toHex,
} from "viem";

const contractsDirectory = new URL("../contracts/src/", import.meta.url);
let compiledContracts;

async function compileContracts() {
  if (compiledContracts) return compiledContracts;
  compiledContracts = compileContractsOnce();
  return compiledContracts;
}

async function compileContractsOnce() {
  const files = (await readdir(contractsDirectory)).filter((file) => file.endsWith(".sol")).sort();
  const sources = Object.fromEntries(await Promise.all(files.map(async (file) => [
    `contracts/src/${file}`,
    { content: await readFile(new URL(`../contracts/src/${file}`, import.meta.url), "utf8") },
  ])));
  sources["test/fixtures/MockWorldToken.sol"] = {
    content: await readFile(new URL("./fixtures/MockWorldToken.sol", import.meta.url), "utf8"),
  };
  sources["test/fixtures/MockWorldIdVerifier.sol"] = {
    content: await readFile(new URL("./fixtures/MockWorldIdVerifier.sol", import.meta.url), "utf8"),
  };
  return JSON.parse(solc.compile(JSON.stringify({
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  })));
}

const playerA = { address: `0x${"22".repeat(20)}` };
const playerB = { address: `0x${"33".repeat(20)}` };
const playerC = { address: `0x${"55".repeat(20)}` };
const deployer = createAddressFromString(`0x${"44".repeat(20)}`);
const EVM_GAS_LIMIT = 30_000_000n;
const DAY = 86_400n;
const GOLD_UNIT = 10n ** 18n;
const WLD_UNIT = 10n ** 18n;
const PLAYER_MAPPING_SLOT = 3n;

function blockAt(timestamp) {
  return createBlock({ header: { timestamp } });
}

function assertEvmSuccess(result) {
  assert.equal(result.execResult.exceptionError, undefined, bytesToHex(result.execResult.returnValue));
}

async function deployContract(vm, abi, bytecode, args = [], timestamp = 1_000n) {
  const constructor = abi.find((item) => item.type === "constructor");
  const initCode = concatHex([
    `0x${bytecode}`,
    constructor ? encodeAbiParameters(constructor.inputs, args) : "0x",
  ]);
  const result = await vm.evm.runCall({
    caller: deployer,
    data: hexToBytes(initCode),
    gasLimit: EVM_GAS_LIMIT,
    block: blockAt(timestamp),
    skipBalance: true,
  });
  assertEvmSuccess(result);
  assert.ok(result.createdAddress, "constructor execution must create the contract");
  return { vm, address: result.createdAddress, abi };
}

async function evmCall(game, caller, functionName, args, timestamp, { value = 0n, staticCall = false } = {}) {
  const data = encodeFunctionData({ abi: game.abi, functionName, args });
  return game.vm.evm.runCall({
    caller: createAddressFromString(caller),
    to: game.address,
    data: hexToBytes(data),
    gasLimit: EVM_GAS_LIMIT,
    value,
    isStatic: staticCall,
    block: blockAt(timestamp),
    skipBalance: true,
  });
}

async function readGame(game, functionName, args, timestamp) {
  const result = await evmCall(game, playerA.address, functionName, args, timestamp, { staticCall: true });
  assertEvmSuccess(result);
  return decodeFunctionResult({
    abi: game.abi,
    functionName,
    data: bytesToHex(result.execResult.returnValue),
  });
}

function worldIdRegistration(game, player, nullifierHash = 1001n, timestamp = 1_840n, signalHash = BigInt(keccak256(player.address)) >> 8n) {
  return evmCall(game, player.address, "registerWorldId", [
    nullifierHash,
    2002n,
    signalHash,
    3_000n,
    1n,
    [11n, 12n, 13n, 14n, 15n],
  ], timestamp);
}

function legacyWorldIdRegistration(game, player, nullifierHash = 3001n, timestamp = 1_840n, signalHash = BigInt(keccak256(player.address)) >> 8n) {
  return evmCall(game, player.address, "registerWorldIdLegacy", [
    4004n,
    signalHash,
    nullifierHash,
    [21n, 22n, 23n, 24n, 25n, 26n, 27n, 28n],
  ], timestamp);
}

function gameConstructorArgs(verifierAddress, worldTokenAddress, treasuryAddress = playerB.address) {
  return [
    verifierAddress,
    "play",
    123n,
    1n,
    0n,
    verifierAddress,
    "app_civilization",
    "play",
    worldTokenAddress,
    treasuryAddress,
  ];
}

function legacyExternalNullifier(appId = "app_civilization", action = "play") {
  const appField = BigInt(keccak256(stringToHex(appId))) >> 8n;
  return BigInt(keccak256(encodePacked(["uint256", "string"], [appField, action]))) >> 8n;
}

function playerStorageSlot(player, offset) {
  const mappingBase = BigInt(keccak256(encodeAbiParameters([
    { type: "address" },
    { type: "uint256" },
  ], [player, PLAYER_MAPPING_SLOT])));
  return padHex(toHex(mappingBase + BigInt(offset)), { size: 32 });
}

async function setPlayerStorage(game, player, offset, value) {
  await game.vm.stateManager.putStorage(
    game.address,
    hexToBytes(playerStorageSlot(player, offset)),
    hexToBytes(padHex(toHex(value), { size: 32 })),
  );
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

test("CivilizationGame exposes only player-driven game transitions and dual World ID registration gates", async () => {
  const output = await compileContracts();
  const abi = output.contracts["contracts/src/CivilizationGame.sol"].CivilizationGame.abi;
  const functions = new Map(abi.filter((item) => item.type === "function").map((item) => [item.name, item]));
  for (const name of ["registerWorldId", "registerWorldIdLegacy", "claim", "upgrade", "completeUpgrade", "boostConstruction", "train", "startRaid", "resolveRaid", "prestige", "playerState", "worldIdVerifier", "worldIdAction", "worldIdRpId", "worldIdLegacyRouter", "worldIdLegacyExternalNullifier", "worldToken", "boostTreasury", "name", "symbol", "decimals", "totalSupply", "balanceOf", "allowance", "approve", "transfer", "transferFrom"]) {
    assert.ok(functions.has(name), `${name} must be part of the auditable contract interface`);
  }
  assert.equal(functions.get("registerWorldId").stateMutability, "nonpayable");
  assert.equal(functions.get("registerWorldIdLegacy").stateMutability, "nonpayable");
  for (const name of ["claim", "upgrade", "boostConstruction", "train", "startRaid", "resolveRaid", "approve", "transfer", "transferFrom"]) {
    assert.equal(functions.get(name).stateMutability, "nonpayable", `${name} must not accept funds`);
  }
  const events = new Set(abi.filter((item) => item.type === "event").map((item) => item.name));
  for (const name of ["WorldIdRegistered", "ResourcesClaimed", "BuildingUpgraded", "TroopsTrained", "RaidStarted", "RaidResolved"]) assert.ok(events.has(name));
  assert.equal(functions.get("previewPlayerState").stateMutability, "view");
  assert.equal(functions.get("MAX_BUILDING_LEVEL").stateMutability, "view");
  assert.equal(functions.get("prestigeMultiplierBps").stateMutability, "pure");
});

test("contract source verifies World ID 3 and 4 on-chain and protects shared replay paths", async () => {
  const source = await readFile(new URL("../contracts/src/CivilizationGame.sol", import.meta.url), "utf8");
  assert.match(source, /mapping\(uint256 => address\) public nullifierOwner/);
  assert.match(source, /IWorldIDVerifier public immutable worldIdVerifier/);
  assert.match(source, /worldIdVerifier\.verify\(/);
  assert.match(source, /worldIdLegacyRouter\.verifyProof\(/);
  assert.match(source, /WORLD_ID_LEGACY_GROUP_ID = 1/);
  assert.match(source, /abi\.encodePacked\(_hashToField\(bytes\(worldIdLegacyAppId\)\), worldIdLegacyActionId\)/);
  assert.match(source, /function _requireAvailableRegistration\(uint256 nullifierHash, uint256 signalHash\) private view/);
  assert.match(source, /function _registerPlayer\(uint256 nullifierHash\) private/);
  assert.match(source, /signalHash != _hashToField\(abi\.encodePacked\(msg\.sender\)\)/);
  assert.match(source, /issuerSchemaId != worldIdIssuerSchemaId/);
  assert.match(source, /worldIdAction = _hashToField\(bytes\(worldActionId\)\)/);
  assert.doesNotMatch(source, /worldIdAction = uint256\(keccak256\(bytes\(worldActionId\)\)\);/);
  assert.match(source, /function _accrue\(Player storage player\) private/);
  assert.match(source, /function claim\(\) external onlyRegistered/);
  assert.match(source, /function resolveRaid\(\) external onlyRegistered/);
  assert.match(source, /MAX_BUILDING_LEVEL = 30/);
  assert.match(source, /function previewPlayerState\(address account\) external view/);
  assert.match(source, /function completeUpgrade\(\) external onlyRegistered/);
  assert.match(source, /function prestige\(\) external onlyRegistered/);
  assert.match(source, /return nextLevel \* 1 days/);
  assert.match(source, /PRESTIGE_BONUS_BPS = 1_000/);
  assert.match(source, /WORLD_TOKEN_UNIT = 1e18/);
  assert.match(source, /function boostConstruction\(uint256 hoursToBoost\) external onlyRegistered/);
  assert.match(source, /transferFrom\(msg.sender, boostTreasury, wldPaid\)/);
  assert.match(source, /string public constant symbol = "CGOLD"/);
  assert.match(source, /function _mintGold\(address account, uint256 value\) private/);
  assert.match(source, /function _burnGold\(address account, uint256 value\) private/);
  assert.doesNotMatch(source, /function .*onlyBackend/i);
  assert.doesNotMatch(source, /EIP712|backendAttestationSigner|attestation/i);
  assert.doesNotMatch(source, /\bpayable\b/);
});

test("CivilizationGame constructor stores v4 action and v3 app/action as protocol field hashes", async () => {
  const output = await compileContracts();
  const artifact = output.contracts["contracts/src/CivilizationGame.sol"].CivilizationGame;
  const vm = await createVM();
  const game = await deployContract(vm, artifact.abi, artifact.evm.bytecode.object,
    gameConstructorArgs(playerA.address, playerB.address, deployer.toString()));

  assert.equal(
    await readGame(game, "worldIdAction", [], 1_000n),
    BigInt(keccak256(stringToHex("play"))) >> 8n,
  );
  assert.equal(
    await readGame(game, "worldIdLegacyExternalNullifier", [], 1_000n),
    legacyExternalNullifier(),
  );
});

test("World ID v3 and v4 use exact verifier arguments and one shared registration boundary", async () => {
  const output = await compileContracts();
  const artifact = output.contracts["contracts/src/CivilizationGame.sol"].CivilizationGame;
  const verifierArtifact = output.contracts["test/fixtures/MockWorldIdVerifier.sol"].MockWorldIdVerifier;
  const vm = await createVM();
  const verifier = await deployContract(vm, verifierArtifact.abi, verifierArtifact.evm.bytecode.object);
  const game = await deployContract(vm, artifact.abi, artifact.evm.bytecode.object,
    gameConstructorArgs(verifier.address.toString(), playerC.address));

  const v4Signal = BigInt(keccak256(playerA.address)) >> 8n;
  const v4Proof = [11n, 12n, 13n, 14n, 15n];
  assertEvmSuccess(await evmCall(verifier, deployer.toString(), "expectV4", [
    1001n,
    BigInt(keccak256(stringToHex("play"))) >> 8n,
    123n,
    2002n,
    v4Signal,
    3_000n,
    1n,
    0n,
    v4Proof,
  ], 1_001n));
  assertEvmSuccess(await worldIdRegistration(game, playerA, 1001n, 1_002n, v4Signal));

  const sameWalletAcrossPaths = await legacyWorldIdRegistration(game, playerA, 3001n, 1_003n);
  assert.ok(sameWalletAcrossPaths.execResult.exceptionError, "a v4-registered wallet cannot register again through v3");
  const sameNullifierAcrossPaths = await legacyWorldIdRegistration(game, playerB, 1001n, 1_004n);
  assert.ok(sameNullifierAcrossPaths.execResult.exceptionError, "the shared nullifier mapping rejects reuse across protocol paths");

  const v3Signal = BigInt(keccak256(playerB.address)) >> 8n;
  const v3Proof = [21n, 22n, 23n, 24n, 25n, 26n, 27n, 28n];
  assertEvmSuccess(await evmCall(verifier, deployer.toString(), "expectLegacy", [
    4004n,
    1n,
    v3Signal,
    3001n,
    legacyExternalNullifier(),
    v3Proof,
  ], 1_005n));
  assertEvmSuccess(await legacyWorldIdRegistration(game, playerB, 3001n, 1_006n, v3Signal));
  assert.equal((await readGame(game, "playerState", [playerB.address], 1_006n))[0], true);
  assert.equal(await readGame(game, "nullifierOwner", [3001n], 1_006n), playerB.address);

  const legacyWalletUsingV4 = await worldIdRegistration(game, playerB, 1002n, 1_007n);
  assert.ok(legacyWalletUsingV4.execResult.exceptionError, "a v3-registered wallet cannot register again through v4");
  const wrongLegacySignal = await legacyWorldIdRegistration(game, playerC, 3002n, 1_008n, 0n);
  assert.ok(wrongLegacySignal.execResult.exceptionError, "legacy proofs remain bound to msg.sender");
  assertEvmSuccess(await evmCall(verifier, deployer.toString(), "setRejectProof", [true], 1_009n));
  const rejectedLegacyProof = await legacyWorldIdRegistration(game, playerC, 3002n, 1_010n);
  assert.ok(rejectedLegacyProof.execResult.exceptionError, "legacy registration reverts when the router rejects its proof");
  assert.equal((await readGame(game, "playerState", [playerC.address], 1_010n))[0], false, "a rejected legacy proof cannot persist player state");
});

test("CivilizationGame executes World registration, contract-derived production, claims, and replay protection on a local EVM", async () => {
  const output = await compileContracts();
  const artifact = output.contracts["contracts/src/CivilizationGame.sol"].CivilizationGame;
  const worldTokenArtifact = output.contracts["test/fixtures/MockWorldToken.sol"].MockWorldToken;
  const verifierArtifact = output.contracts["test/fixtures/MockWorldIdVerifier.sol"].MockWorldIdVerifier;
  const vm = await createVM();
  const verifier = await deployContract(vm, verifierArtifact.abi, verifierArtifact.evm.bytecode.object);
  const worldToken = await deployContract(vm, worldTokenArtifact.abi, worldTokenArtifact.evm.bytecode.object);
  const game = await deployContract(vm, artifact.abi, artifact.evm.bytecode.object,
    gameConstructorArgs(verifier.address.toString(), worldToken.address.toString()));
  const nullifier = 1001n;
  const registration = await worldIdRegistration(game, playerA, nullifier);
  assertEvmSuccess(registration);

  const registeredAt = 1_840n;
  const firstCollectionAt = registeredAt + DAY;
  const initial = await readGame(game, "playerState", [playerA.address], registeredAt);
  assert.equal(initial[0], true);
  assert.equal(initial[3].wood, 80n);
  assert.equal(initial[4].wood, 0n);

  const preview = await readGame(game, "previewPlayerState", [playerA.address], firstCollectionAt);
  assert.equal(preview[3].wood, 80n, "a view must not change stored resources");
  assert.equal(preview[4].wood, 300n, "the contract production formula must be visible before a claim");

  const claim = await evmCall(game, playerA.address, "claim", [], firstCollectionAt);
  assertEvmSuccess(claim);
  const afterClaim = await readGame(game, "playerState", [playerA.address], firstCollectionAt);
  assert.equal(afterClaim[3].wood, 380n);
  assert.equal(afterClaim[4].wood, 0n);

  const cooldownClaim = await evmCall(game, playerA.address, "claim", [], firstCollectionAt + 1n);
  assert.ok(cooldownClaim.execResult.exceptionError, "claim cooldown must revert on the EVM");

  // Fixture-only gold field stock isolates ERC-20 claim/transfer behavior from
  // the several-day Goldmine prerequisite path.
  await setPlayerStorage(game, playerA.address, 8, 19n);
  const goldClaimAt = firstCollectionAt + 2n * 60n * 60n;
  const goldClaim = await evmCall(game, playerA.address, "claim", [], goldClaimAt);
  assertEvmSuccess(goldClaim);
  assert.equal(await readGame(game, "balanceOf", [playerA.address], goldClaimAt), 19n * GOLD_UNIT);
  assert.equal(await readGame(game, "totalSupply", [], goldClaimAt), 19n * GOLD_UNIT);
  const goldTransfer = await evmCall(game, playerA.address, "transfer", [playerB.address, 7n * GOLD_UNIT], goldClaimAt);
  assertEvmSuccess(goldTransfer);
  assert.equal(await readGame(game, "balanceOf", [playerA.address], goldClaimAt), 12n * GOLD_UNIT);
  assert.equal(await readGame(game, "balanceOf", [playerB.address], goldClaimAt), 7n * GOLD_UNIT);

  const queueTownhall = await evmCall(game, playerA.address, "upgrade", [0], goldClaimAt);
  assertEvmSuccess(queueTownhall);
  const queued = await readGame(game, "playerState", [playerA.address], goldClaimAt);
  assert.equal(queued[5].townhall, 0n, "townhall level changes only after the construction timer");
  assert.equal(queued[8].pending, true);
  assert.equal(queued[8].completesAt, goldClaimAt + DAY);

  const mintWld = await evmCall(worldToken, deployer.toString(), "mint", [playerA.address, WLD_UNIT], goldClaimAt + 1n);
  assertEvmSuccess(mintWld);
  const approveWld = await evmCall(worldToken, playerA.address, "approve", [game.address.toString(), WLD_UNIT], goldClaimAt + 1n);
  assertEvmSuccess(approveWld);
  const boost = await evmCall(game, playerA.address, "boostConstruction", [1n], goldClaimAt + 1n);
  assertEvmSuccess(boost);
  const boosted = await readGame(game, "playerState", [playerA.address], goldClaimAt + 1n);
  assert.equal(boosted[8].completesAt, goldClaimAt + DAY - 1n * 60n * 60n, "one WLD must remove exactly one construction hour");
  assert.equal(await readGame(worldToken, "balanceOf", [playerA.address], goldClaimAt + 1n), 0n);
  assert.equal(await readGame(worldToken, "balanceOf", [playerB.address], goldClaimAt + 1n), WLD_UNIT, "WLD goes directly to the treasury, never to game custody");
  const excessiveBoost = await evmCall(game, playerA.address, "boostConstruction", [24n], goldClaimAt + 1n);
  assert.ok(excessiveBoost.execResult.exceptionError, "a boost cannot overpay past completion");

  const earlyCompletion = await evmCall(game, playerA.address, "completeUpgrade", [], goldClaimAt + DAY - 1n * 60n * 60n - 1n);
  assert.ok(earlyCompletion.execResult.exceptionError, "townhall I cannot complete before its one-day timer");
  const completeTownhall = await evmCall(game, playerA.address, "completeUpgrade", [], goldClaimAt + DAY - 1n * 60n * 60n);
  assertEvmSuccess(completeTownhall);
  const afterTownhall = await readGame(game, "playerState", [playerA.address], goldClaimAt + DAY - 1n * 60n * 60n);
  assert.equal(afterTownhall[5].townhall, 1n);
  assert.equal(afterTownhall[8].pending, false);

  const prestigeMultiplier = await readGame(game, "prestigeMultiplierBps", [1n], goldClaimAt + DAY - 1n * 60n * 60n);
  assert.equal(prestigeMultiplier, 11_000n, "each prestige grants a permanent ten-percent production bonus");

  // Fixture-only storage setup reaches the explicit late-game prestige gate without
  // turning production tests into a multi-year sequence of timed upgrades.
  await setPlayerStorage(game, playerA.address, 13, 30n);
  const prestige = await evmCall(game, playerA.address, "prestige", [], goldClaimAt + DAY - 1n * 60n * 60n + 1n);
  assertEvmSuccess(prestige);
  const afterPrestige = await readGame(game, "playerState", [playerA.address], goldClaimAt + DAY - 1n * 60n * 60n + 1n);
  assert.equal(afterPrestige[3].wood, 80n, "prestige resets protected resources to the fresh-village state");
  assert.equal(afterPrestige[4].wood, 0n, "prestige clears raidable field resources");
  assert.equal(afterPrestige[5].townhall, 0n, "prestige resets village construction progress");
  assert.equal(afterPrestige[9], 1n, "prestige progress survives the village reset");
  const earnedMultiplier = await readGame(game, "productionMultiplierBps", [playerA.address], goldClaimAt + DAY - 1n * 60n * 60n + 1n);
  assert.equal(earnedMultiplier, 11_000n);

  const replay = await worldIdRegistration(game, playerB, nullifier, 1_900n);
  assert.ok(replay.execResult.exceptionError, "a World nullifier can register only one wallet");

  const wrongSignal = await worldIdRegistration(game, playerB, 1002n, 1_901n, 0n);
  assert.ok(wrongSignal.execResult.exceptionError, "a World proof signal must be bound to the registering wallet");

  const rejectProof = await evmCall(verifier, deployer.toString(), "setRejectProof", [true], 1_902n);
  assertEvmSuccess(rejectProof);
  const rejected = await worldIdRegistration(game, playerB, 1003n, 1_903n);
  assert.ok(rejected.execResult.exceptionError, "registration must revert when the World ID verifier rejects a proof");

  const unregisteredClaim = await evmCall(game, playerB.address, "claim", [], firstCollectionAt);
  assert.ok(unregisteredClaim.execResult.exceptionError, "game actions require World registration");
});
