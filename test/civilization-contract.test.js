import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createBlock } from "@ethereumjs/block";
import {
  bytesToHex,
  createAddressFromString,
  hexToBytes,
} from "@ethereumjs/util";
import { createVM } from "@ethereumjs/vm";
import solc from "solc";
import { privateKeyToAccount } from "viem/accounts";
import {
  EIP170_RUNTIME_LIMIT,
  SOLIDITY_RELEASE_PROFILE,
} from "../scripts/solidity-release-profile.mjs";
import {
  concatHex,
  decodeErrorResult,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  stringToHex,
  toBytes,
  toHex,
} from "viem";

const require = createRequire(import.meta.url);
const sourceDir = new URL("../contracts/src/", import.meta.url);
const deployer = `0x${"44".repeat(20)}`;
const alice = `0x${"22".repeat(20)}`;
const bob = `0x${"33".repeat(20)}`;
const carol = `0x${"55".repeat(20)}`;
const GAS = 30_000_000n;
let output;

function block(timestamp) {
  return createBlock({ header: { timestamp } });
}
function ok(result) {
  assert.equal(
    result.execResult.exceptionError,
    undefined,
    bytesToHex(result.execResult.returnValue),
  );
}
function address(value) {
  return createAddressFromString(value);
}
function artifact(source, name) {
  return output.contracts[source][name];
}

async function compile() {
  if (output) return output;
  const files = (await readdir(sourceDir)).filter((f) => f.endsWith(".sol"));
  const sources = Object.fromEntries(
    await Promise.all(
      files.map(async (f) => [
        `contracts/src/${f}`,
        {
          content: await readFile(
            new URL(`../contracts/src/${f}`, import.meta.url),
            "utf8",
          ),
        },
      ]),
    ),
  );
  for (const f of [
    "MockWorldToken.sol",
    "MockWorldIdVerifier.sol",
    "MockBuybackV3Pool.sol",
    "MockBuybackV3Router.sol",
  ])
    sources[`test/fixtures/${f}`] = {
      content: await readFile(
        new URL(`./fixtures/${f}`, import.meta.url),
        "utf8",
      ),
    };
  for (const name of [
    "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol",
    "@openzeppelin/contracts/governance/TimelockController.sol",
  ])
    sources[name] = {
      content: require("node:fs").readFileSync(require.resolve(name), "utf8"),
    };
  output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources,
        settings: {
          // Compile implementation bytecode with the exact release profile.
          ...SOLIDITY_RELEASE_PROFILE,
          outputSelection: {
            "*": {
              "": ["ast"],
              "*": [
                "abi",
                "evm.bytecode.object",
                "evm.deployedBytecode.object",
                "storageLayout",
              ],
            },
          },
        },
      }),
      {
        import: (p) => {
          try {
            return {
              contents: require("node:fs").readFileSync(
                require.resolve(p),
                "utf8",
              ),
            };
          } catch {
            return { error: `missing pinned source: ${p}` };
          }
        },
      },
    ),
  );
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  assert.deepEqual(
    errors,
    [],
    errors.map((e) => e.formattedMessage).join("\n"),
  );
  return output;
}

async function deploy(vm, a, args = [], at = 1_000n) {
  const constructor = a.abi.find((x) => x.type === "constructor");
  const data = concatHex([
    `0x${a.evm.bytecode.object}`,
    constructor ? encodeAbiParameters(constructor.inputs, args) : "0x",
  ]);
  const result = await vm.evm.runCall({
    caller: address(deployer),
    data: hexToBytes(data),
    gasLimit: GAS,
    block: block(at),
    skipBalance: true,
  });
  ok(result);
  assert.ok(result.createdAddress);
  return { vm, address: result.createdAddress, abi: a.abi };
}
async function deployResult(vm, a, args = [], at = 1_000n) {
  const constructor = a.abi.find((x) => x.type === "constructor");
  const data = concatHex([
    `0x${a.evm.bytecode.object}`,
    constructor ? encodeAbiParameters(constructor.inputs, args) : "0x",
  ]);
  return vm.evm.runCall({
    caller: address(deployer),
    data: hexToBytes(data),
    gasLimit: GAS,
    block: block(at),
    skipBalance: true,
  });
}
async function call(
  c,
  caller,
  name,
  args = [],
  at = 1_000n,
  staticCall = false,
) {
  return c.vm.evm.runCall({
    caller: address(caller),
    to: c.address,
    data: hexToBytes(
      encodeFunctionData({ abi: c.abi, functionName: name, args }),
    ),
    gasLimit: GAS,
    block: block(at),
    isStatic: staticCall,
    skipBalance: true,
  });
}
async function read(c, name, args = [], at = 1_000n) {
  const r = await call(c, alice, name, args, at, true);
  ok(r);
  return decodeFunctionResult({
    abi: c.abi,
    functionName: name,
    data: bytesToHex(r.execResult.returnValue),
  });
}
function init(verifier, token, splitter, timelock) {
  return {
    worldIdVerifier: verifier,
    worldActionId: "play",
    worldRpId: 123n,
    worldIssuerSchemaId: 1n,
    credentialGenesisIssuedAtMin: 0n,
    worldIdLegacyRouter: verifier,
    worldIdLegacyAppId: "app_civilization",
    worldIdLegacyActionId: "play",
    worldToken: token,
    revenueSplitter: splitter,
    timelock,
  };
}
function zero32() {
  return `0x${"00".repeat(32)}`;
}
function exactBuildDuration(level) {
  const wad = 10n ** 18n;
  const factorWad = 1_569_772_144_168_414_000n;
  let powerWad = wad;
  for (let exponent = 1; exponent < level; exponent += 1)
    powerWad = (powerWad * factorWad) / wad;
  return [
    54n + (66n * powerWad + wad - 1n) / wad,
    365n * 24n * 60n * 60n,
  ].reduce((lowest, value) => (lowest < value ? lowest : value));
}

async function fixture(
  at = 1_000n,
  recipients = [bob, carol],
  shares = [5000, 5000],
) {
  await compile();
  // This fixture uses unoptimized V2 bytecode and exercises proxy-state
  // migration only; the release-optimized CivilizationGame runtime remains
  // guarded separately below against EIP-170.
  const vm = await createVM({
    evmOpts: { allowUnlimitedContractSize: true },
  });
  const v1 = await deploy(
    vm,
    artifact("contracts/src/CivilizationGame.sol", "CivilizationGame"),
    [],
    at,
  );
  const verifier = await deploy(
    vm,
    artifact("test/fixtures/MockWorldIdVerifier.sol", "MockWorldIdVerifier"),
    [],
    at,
  );
  const token = await deploy(
    vm,
    artifact("test/fixtures/MockWorldToken.sol", "MockWorldToken"),
    [],
    at,
  );
  const timelock = await deploy(
    vm,
    artifact(
      "@openzeppelin/contracts/governance/TimelockController.sol",
      "TimelockController",
    ),
    [60n, [deployer], [deployer], deployer],
    at,
  );
  const registry = await deploy(
    vm,
    artifact(
      "contracts/src/CivilizationReleaseRegistry.sol",
      "CivilizationReleaseRegistry",
    ),
    [
      timelock.address.toString(),
      [
        "0x0000000000000000000000000000000000000000",
        0n,
        "0x0000000000000000000000000000000000000000",
        zero32(),
        zero32(),
        zero32(),
      ],
    ],
    at,
  );
  const splitter = await deploy(
    vm,
    artifact(
      "contracts/src/CivilizationRevenueSplitter.sol",
      "CivilizationRevenueSplitter",
    ),
    [token.address.toString(), timelock.address.toString(), recipients, shares],
    at,
  );
  const data = encodeFunctionData({
    abi: v1.abi,
    functionName: "initialize",
    args: [
      init(
        verifier.address.toString(),
        token.address.toString(),
        splitter.address.toString(),
        timelock.address.toString(),
      ),
    ],
  });
  const proxy = await deploy(
    vm,
    artifact(
      "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol",
      "TransparentUpgradeableProxy",
    ),
    [v1.address.toString(), timelock.address.toString(), data],
    at,
  );
  const game = { vm, address: proxy.address, abi: v1.abi };
  const buybackVault = await deploy(
    vm,
    artifact(
      "contracts/src/CivilizationBuybackVault.sol",
      "CivilizationBuybackVault",
    ),
    [
      token.address.toString(),
      proxy.address.toString(),
      timelock.address.toString(),
    ],
    at,
  );
  // OZ v5 stores the generated ProxyAdmin in the standard EIP-1967 slot.
  const raw = await vm.stateManager.getStorage(
    proxy.address,
    hexToBytes(
      "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
    ),
  );
  const admin = {
    vm,
    address: createAddressFromString(`0x${bytesToHex(raw).slice(-40)}`),
    abi: artifact(
      "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
      "ProxyAdmin",
    ).abi,
  };
  await timelockCall(
    { vm, timelock, game },
    encodeFunctionData({
      abi: game.abi,
      functionName: "setBuybackVault",
      args: [buybackVault.address.toString()],
    }),
    at,
  );
  return {
    vm,
    v1,
    verifier,
    token,
    timelock,
    registry,
    splitter,
    buybackVault,
    proxy,
    game,
    admin,
  };
}

async function upgrade(f, implementation, at, salt = zero32()) {
  const data = encodeFunctionData({
    abi: f.admin.abi,
    functionName: "upgradeAndCall",
    args: [f.proxy.address.toString(), implementation.address.toString(), "0x"],
  });
  ok(
    await call(
      f.timelock,
      deployer,
      "schedule",
      [f.admin.address.toString(), 0n, data, zero32(), salt, 60n],
      at,
    ),
  );
  const early = await call(
    f.timelock,
    deployer,
    "execute",
    [f.admin.address.toString(), 0n, data, zero32(), salt],
    at + 59n,
  );
  assert.ok(
    early.execResult.exceptionError,
    "timelock execution before its delay must fail",
  );
  ok(
    await call(
      f.timelock,
      deployer,
      "execute",
      [f.admin.address.toString(), 0n, data, zero32(), salt],
      at + 60n,
    ),
  );
}

async function timelockCall(
  f,
  data,
  at,
  salt = zero32(),
  target = f.game.address.toString(),
) {
  ok(
    await call(
      f.timelock,
      deployer,
      "schedule",
      [target, 0n, data, zero32(), salt, 60n],
      at,
    ),
  );
  ok(
    await call(
      f.timelock,
      deployer,
      "execute",
      [target, 0n, data, zero32(), salt],
      at + 60n,
    ),
  );
}

async function configureMarket(f, resource, price, inventory, at, salt) {
  await timelockCall(
    f,
    encodeFunctionData({
      abi: f.game.abi,
      functionName: "configureMarket",
      args: [resource, price, inventory],
    }),
    at,
    salt,
  );
}

async function seedGoldForMarketTest(f, account, value) {
  // Tests seed the existing ERC-20 mapping directly; production reserve is
  // seeded only by an actual timelock-controlled CGOLD transfer.
  const base = BigInt(
    "0xb9c5fb29a19a4c3e9d391dc26eaefcdaaec2a4fc6362d4bd27f1470fa2592b00",
  );
  const balanceSlot = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [account, base + 1n],
    ),
  );
  await f.vm.stateManager.putStorage(
    f.game.address,
    hexToBytes(balanceSlot),
    hexToBytes(toHex(value, { size: 32 })),
  );
  await f.vm.stateManager.putStorage(
    f.game.address,
    hexToBytes(toHex(base, { size: 32 })),
    hexToBytes(toHex(value, { size: 32 })),
  );
}

async function setGoldTotalSupplyForMarketTest(f, value) {
  const base = BigInt(
    "0xb9c5fb29a19a4c3e9d391dc26eaefcdaaec2a4fc6362d4bd27f1470fa2592b00",
  );
  await f.vm.stateManager.putStorage(
    f.game.address,
    hexToBytes(toHex(base, { size: 32 })),
    hexToBytes(toHex(value, { size: 32 })),
  );
}

async function deployBuybackRoute(f, at, tick = 0n) {
  const pool = await deploy(
    f.vm,
    artifact("test/fixtures/MockBuybackV3Pool.sol", "MockBuybackV3Pool"),
    [f.token.address.toString(), f.game.address.toString()],
    at,
  );
  const router = await deploy(
    f.vm,
    artifact("test/fixtures/MockBuybackV3Router.sol", "MockBuybackV3Router"),
    [f.token.address.toString(), f.game.address.toString()],
    at,
  );
  ok(await call(pool, deployer, "setObservation", [0n, tick * 60n], at));
  await timelockCall(
    f,
    encodeFunctionData({
      abi: f.buybackVault.abi,
      functionName: "configureRoute",
      args: [
        router.address.toString(),
        pool.address.toString(),
        3_000,
        1n,
        100n,
        60,
        0,
      ],
    }),
    at,
    `0x${"b".repeat(62)}${(at % 256n).toString(16).padStart(2, "0")}`,
    f.buybackVault.address.toString(),
  );
  return { pool, router };
}

async function creditBuybackVault(f, value, at) {
  ok(
    await call(
      f.token,
      deployer,
      "mint",
      [f.buybackVault.address.toString(), value],
      at,
    ),
  );
  ok(
    await call(
      f.buybackVault,
      f.game.address.toString(),
      "recordFunding",
      [value],
      at,
    ),
  );
}

const GAME_STORAGE_LOCATION = BigInt(
  "0xb9c5fb29a19a4c3e9d391dc26eaefcdaaec2a4fc6362d4bd27f1470fa2592b00",
);
const PLAYER_MAPPING_SLOT = GAME_STORAGE_LOCATION + 12n;

async function setConstructionTestPlayer(f, account, { stored, buildings }) {
  const playerBase = BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [account, PLAYER_MAPPING_SLOT],
      ),
    ),
  );
  const put = (slot, value) =>
    f.vm.stateManager.putStorage(
      f.game.address,
      hexToBytes(toHex(playerBase + BigInt(slot), { size: 32 })),
      hexToBytes(toHex(BigInt(value), { size: 32 })),
    );
  const resourceValues = [stored.wood, stored.clay, stored.stone, stored.gold];
  await Promise.all(
    resourceValues.map((value, index) => put(1 + index, value)),
  );
  const buildingValues = [
    buildings.townhall,
    buildings.timber,
    buildings.claypit,
    buildings.quarry,
    buildings.warehouse,
    buildings.workshop,
    buildings.goldmine,
    buildings.barracks,
  ];
  await Promise.all(
    buildingValues.map((value, index) => put(13 + index, value)),
  );
}

async function setGameplayGoldField(f, account, value) {
  const playerBase = BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [account, PLAYER_MAPPING_SLOT],
      ),
    ),
  );
  // Player.field.gold is slot 8. Claims must still execute the production,
  // cooldown, ERC-20 mint, and payout paths to consume this game state.
  await f.vm.stateManager.putStorage(
    f.game.address,
    hexToBytes(toHex(playerBase + 8n, { size: 32 })),
    hexToBytes(toHex(BigInt(value), { size: 32 })),
  );
}

function constructionTestBuildings(overrides = {}) {
  return {
    townhall: 2n,
    timber: 1n,
    claypit: 1n,
    quarry: 1n,
    warehouse: 1n,
    workshop: 1n,
    goldmine: 0n,
    barracks: 0n,
    ...overrides,
  };
}

const CONSTRUCTION_TEST_RESOURCES = {
  wood: 10n ** 20n,
  clay: 10n ** 20n,
  stone: 10n ** 20n,
  gold: 0n,
};

test("timelock-governed market atomically exchanges only contract inventory for CGOLD", async () => {
  const f = await fixture();
  ok(await call(f.game, alice, "registerWallet", [], 1_000n));
  await configureMarket(f, 0, 100n, 10n, 1_100n, `0x${"01".repeat(32)}`);
  await seedGoldForMarketTest(f, alice, 10_000n);
  const quote = await read(f.game, "quoteMarket", [0, 3n], 1_160n);
  assert.deepEqual(
    quote,
    [305n, 5n, 295n, 5n],
    "buy rounds up and sell rounds down at 1.5%",
  );
  ok(await call(f.game, alice, "buyResource", [0, 3n, 305n, 1_300n], 1_160n));
  assert.equal(await read(f.game, "marketInventory", [0]), 7n);
  assert.equal(await read(f.game, "marketGoldReserve"), 305n);
  let state = await read(f.game, "playerState", [alice], 1_160n);
  assert.equal(state[3].wood, 83n);
  ok(await call(f.game, alice, "sellResource", [0, 2n, 197n, 1_300n], 1_161n));
  assert.equal(await read(f.game, "marketInventory", [0]), 9n);
  assert.equal(await read(f.game, "marketGoldReserve"), 108n);
  state = await read(f.game, "playerState", [alice], 1_161n);
  assert.equal(state[3].wood, 81n);
  assert.equal(await read(f.game, "balanceOf", [alice]), 9_892n);
});

test("market rejects invalid resources, zero/expired/slipped orders and preserves state on failure", async () => {
  const f = await fixture();
  ok(await call(f.game, alice, "registerWallet", [], 1_000n));
  await configureMarket(f, 1, 100n, 1n, 1_100n, `0x${"02".repeat(32)}`);
  await seedGoldForMarketTest(f, alice, 1_000n);
  for (const args of [
    [3, 1n],
    [1, 0n],
  ]) {
    const failure = await call(
      f.game,
      alice,
      "quoteMarket",
      args,
      1_160n,
      true,
    );
    assert.ok(failure.execResult.exceptionError);
  }
  const beforeInventory = await read(f.game, "marketInventory", [1]);
  const beforeGold = await read(f.game, "balanceOf", [alice]);
  for (const args of [
    [1, 1n, 101n, 1_159n],
    [1, 1n, 100n, 1_300n],
  ]) {
    const failure = await call(f.game, alice, "buyResource", args, 1_160n);
    assert.ok(failure.execResult.exceptionError);
  }
  assert.equal(await read(f.game, "marketInventory", [1]), beforeInventory);
  assert.equal(await read(f.game, "balanceOf", [alice]), beforeGold);
  const reserveFailure = await call(
    f.game,
    alice,
    "sellResource",
    [1, 1n, 1n, 1_300n],
    1_160n,
  );
  assert.ok(
    reserveFailure.execResult.exceptionError,
    "sell cannot create CGOLD when the reserve is empty",
  );
  assert.equal(await read(f.game, "marketInventory", [1]), beforeInventory);
});

const STATE_MACHINE_SEEDS = Object.freeze([
  0x43c0ffee, 0x00000001, 0x12345678, 0xdeadbeef, 0x0badc0de, 0xcafebabe,
  0xfeedface, 0x31415926, 0x27182818, 0x9e3779b9, 0xa5a5a5a5, 0x5a5a5a5a,
  0x01020304, 0x89abcdef, 0xfedcba98, 0xffffffff,
]);
const STATE_MACHINE_STEPS = 32;

async function runAdversarialStateMachine(seed) {
  // This is intentionally a sequence test: an incorrect mutation in any step
  // corrupts independently tracked inventory/supply state for later steps.
  const f = await fixture();
  const at = 2_000n;
  ok(await call(f.game, alice, "registerWallet", [], at));
  ok(await call(f.game, bob, "registerWallet", [], at));
  const aliceStart = await read(f.game, "playerState", [alice], at);
  const bobStart = await read(f.game, "playerState", [bob], at);
  const duplicate = await call(f.game, alice, "registerWallet", [], at);
  assert.ok(
    duplicate.execResult.exceptionError,
    "duplicate registration reverts",
  );
  assert.deepEqual(
    await read(f.game, "playerState", [bob], at),
    bobStart,
    "alice's failed registration cannot mutate bob",
  );

  await configureMarket(f, 0, 100n, 40n, 2_100n, `0x${"43".repeat(32)}`);
  await seedGoldForMarketTest(f, alice, 100_000n);
  await seedGoldForMarketTest(f, f.game.address.toString(), 100_000n);
  await setGoldTotalSupplyForMarketTest(f, 200_000n);
  let expectedInventory = 40n;
  let expectedWood = aliceStart[3].wood;
  let expectedAliceGold = 100_000n;
  let expectedReserve = 100_000n;
  let state = seed;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  for (let step = 0; step < STATE_MACHINE_STEPS; step += 1) {
    const amount = BigInt((next() % 3) + 1);
    const cost = (amount * 100n * 10_150n + 9_999n) / 10_000n;
    const proceeds = (amount * 100n * 9_850n) / 10_000n;
    const wantsBuy = ((next() >>> 31) & 1) === 0;
    const buy =
      (wantsBuy || expectedWood < amount || expectedReserve < proceeds) &&
      expectedInventory >= amount &&
      expectedAliceGold >= cost;
    if (buy) {
      ok(
        await call(
          f.game,
          alice,
          "buyResource",
          [0, amount, cost, 3_000n],
          2_160n,
        ),
      );
      expectedInventory -= amount;
      expectedWood += amount;
      expectedAliceGold -= cost;
      expectedReserve += cost;
    } else {
      assert.ok(
        expectedWood >= amount && expectedReserve >= proceeds,
        `seed 0x${seed.toString(16).padStart(8, "0")} has a valid sell at step ${step}`,
      );
      ok(
        await call(
          f.game,
          alice,
          "sellResource",
          [0, amount, proceeds, 3_000n],
          2_160n,
        ),
      );
      expectedInventory += amount;
      expectedWood -= amount;
      expectedAliceGold += proceeds;
      expectedReserve -= proceeds;
    }
    const aliceState = await read(f.game, "playerState", [alice], 2_160n);
    const trace = `seed 0x${seed.toString(16).padStart(8, "0")}, step ${step}`;
    assert.equal(aliceState[3].wood, expectedWood, `wood after ${trace}`);
    assert.equal(await read(f.game, "marketInventory", [0]), expectedInventory);
    assert.equal(await read(f.game, "balanceOf", [alice]), expectedAliceGold);
    assert.equal(await read(f.game, "marketGoldReserve"), expectedReserve);
    assert.equal(
      expectedInventory + aliceState[3].wood,
      40n + aliceStart[3].wood,
      "market trades conserve the configured pool and player stored wood",
    );
    assert.equal(
      expectedAliceGold + expectedReserve,
      await read(f.game, "totalSupply"),
      "market trades cannot create or lose CGOLD",
    );
    assert.deepEqual(
      await read(f.game, "playerState", [bob], 2_160n),
      bobStart,
      "alice's sequence cannot change another wallet's village",
    );
  }
  const earlyClaim = await call(f.game, alice, "claim", [], 2_160n);
  assert.ok(
    earlyClaim.execResult.exceptionError,
    "empty/early claim cannot alter cooldown",
  );
  const afterEarlyClaim = await read(f.game, "playerState", [alice], 2_160n);
  assert.equal(
    afterEarlyClaim[2],
    aliceStart[2],
    "failed claim preserves cooldown",
  );
}

for (const seed of STATE_MACHINE_SEEDS) {
  test(`adversarial state machine (seed 0x${seed.toString(16).padStart(8, "0")}, ${STATE_MACHINE_STEPS} steps) preserves wallet, resource, and CGOLD boundaries`, () =>
    runAdversarialStateMachine(seed));
}

test("pinned Solidity/OZ sources compile deterministically; release optimizer/viaIR implementation is locked and EIP-170 safe", async () => {
  await compile();
  assert.equal(solc.version(), "0.8.30+commit.73712a01.Emscripten.clang");
  assert.deepEqual(SOLIDITY_RELEASE_PROFILE, {
    optimizer: { enabled: true, runs: 10 },
    viaIR: true,
  });
  const game = artifact(
    "contracts/src/CivilizationGame.sol",
    "CivilizationGame",
  );
  assert.ok(
    game.evm.deployedBytecode.object.length / 2 < EIP170_RUNTIME_LIMIT,
    `CivilizationGame runtime must remain below ${EIP170_RUNTIME_LIMIT} bytes`,
  );
  const source = await readFile(
    new URL("../contracts/src/CivilizationGame.sol", import.meta.url),
    "utf8",
  );
  assert.match(source, /constructor\(\)\s*\{\s*_disableInitializers\(\);\s*\}/);
  assert.match(
    source,
    /@custom:storage-location erc7201:civilization\.game\.storage\.v1/,
  );
  assert.doesNotMatch(
    source,
    /assembly\s*\{[^}]*sstore/i,
    "no unsafe storage bypass",
  );
  const erc7201 = (namespace) =>
    toHex(
      BigInt(
        keccak256(
          toHex(BigInt(keccak256(stringToHex(namespace))) - 1n, { size: 32 }),
        ),
      ) & ~0xffn,
      { size: 32 },
    );
  assert.equal(
    erc7201("civilization.game.storage.v1"),
    "0xb9c5fb29a19a4c3e9d391dc26eaefcdaaec2a4fc6362d4bd27f1470fa2592b00",
  );
  assert.equal(
    erc7201("civilization.game.v2.fixture"),
    "0xe51226c242a13dc23b11f15253e6590affe4764d8637efa53dc8d857385adf00",
  );
  assert.match(
    source,
    /GAME_STORAGE_LOCATION\s*=\s*0xb9c5fb29a19a4c3e9d391dc26eaefcdaaec2a4fc6362d4bd27f1470fa2592b00/,
  );
  const fixtureSource = await readFile(
    new URL("../contracts/src/CivilizationGameV2Fixture.sol", import.meta.url),
    "utf8",
  );
  assert.match(
    fixtureSource,
    /V2_STORAGE_LOCATION\s*=\s*0xe51226c242a13dc23b11f15253e6590affe4764d8637efa53dc8d857385adf00/,
  );
  // The manual ERC-7201 namespace is not represented in solc's ordinary
  // storageLayout, so compare compiler AST declarations against a frozen V1
  // schema that includes every nested struct and enum (not source regexes).
  const snapshot = JSON.parse(
    await readFile(
      new URL("../contracts/storage-layout-v1.snapshot.json", import.meta.url),
      "utf8",
    ),
  );
  const ast = output.sources["contracts/src/CivilizationGame.sol"].ast;
  const gameAst = ast.nodes.find(
    (node) =>
      node.nodeType === "ContractDefinition" &&
      node.name === "CivilizationGame",
  );
  const declarations = gameAst.nodes.filter(
    (node) =>
      node.nodeType === "StructDefinition" ||
      node.nodeType === "EnumDefinition",
  );
  const normalized = (value) =>
    value
      .replaceAll("struct CivilizationGame.", "")
      .replaceAll("enum CivilizationGame.", "")
      .replaceAll("contract CivilizationGame.", "")
      .replaceAll("contract IWorldID", "IWorldID");
  const structs = Object.fromEntries(
    declarations
      .filter(
        (node) =>
          node.nodeType === "StructDefinition" &&
          Object.hasOwn(snapshot.structs, node.name),
      )
      .map((node) => [
        node.name,
        node.members.map(
          (member) =>
            `${normalized(member.typeDescriptions.typeString)} ${member.name}`,
        ),
      ]),
  );
  const enums = Object.fromEntries(
    declarations
      .filter((node) => node.nodeType === "EnumDefinition")
      .map((node) => [node.name, node.members.map((member) => member.name)]),
  );
  assert.deepEqual(
    { structs, enums },
    { structs: snapshot.structs, enums: snapshot.enums },
    "candidate V2 inherits the frozen V1 storage schema exactly",
  );
  assert.equal(
    keccak256(toBytes(JSON.stringify(snapshot))),
    "0xf24ad27069323b257641e9e4c83ed2154a1aa6985f4f36f9f8685b216ecce5cb",
    "frozen schema artifact hash is pinned",
  );
});

test("real OZ proxy atomically initializes, locks its implementation, and exposes exact 60-second accrual", async () => {
  const f = await fixture();
  const direct = await call(f.v1, alice, "initialize", [
    init(alice, bob, carol, deployer),
  ]);
  assert.ok(
    direct.execResult.exceptionError,
    "implementation initializer is disabled",
  );
  assert.equal(
    (await read(f.game, "timelock")).toLowerCase(),
    f.timelock.address.toString().toLowerCase(),
  );
  assert.equal(
    (await read(f.admin, "owner")).toLowerCase(),
    f.timelock.address.toString().toLowerCase(),
    "generated OZ ProxyAdmin is owned by timelock",
  );
  assert.equal(
    (await read(f.registry, "owner")).toLowerCase(),
    f.timelock.address.toString().toLowerCase(),
    "release registry is also timelock-owned",
  );
  ok(await call(f.game, alice, "registerWallet", [], 1_000n));
  const before = await read(f.game, "previewAccrual", [alice], 1_060n);
  assert.equal(before[0].wood, 0n);
  assert.equal(before[1].wood, 180_000_000n);
  assert.equal(before[2], 864_000_000n);
  assert.equal(before[3], 1_060n);
  const empty = await call(f.game, alice, "claim", [], 1_060n);
  assert.ok(
    empty.execResult.exceptionError,
    "empty claim must not consume cooldown",
  );
  const claimed = await call(f.game, alice, "claim", [], 4_600n);
  ok(claimed);
  const state = await read(f.game, "playerState", [alice], 4_600n);
  assert.equal(state[3].wood, 92n);
  assert.equal(state[2], 4_660n);
  const cooldown = await call(f.game, alice, "claim", [], 4_659n);
  assert.ok(cooldown.execResult.exceptionError);
});

test("registerWallet is explicitly public: a direct caller needs no WalletAuth or World ID proof", async () => {
  const f = await fixture();
  const before = await read(f.game, "playerState", [bob], 1_000n);
  assert.equal(before[0], false, "unrelated wallet starts unregistered");

  // This local-EVM call supplies only bob as msg.sender. It has no UI session,
  // WalletAuth/SIWE payload, World ID proof, relayer, or backend interaction.
  ok(await call(f.game, bob, "registerWallet", [], 1_000n));
  const after = await read(f.game, "playerState", [bob], 1_000n);
  assert.equal(after[0], true, "the direct caller is registered");

  const duplicate = await call(f.game, bob, "registerWallet", [], 1_000n);
  assert.ok(
    duplicate.execResult.exceptionError,
    "one village per caller is the only registration admission check",
  );
});

test("all buildings use the accepted fixed-point minute curve, upward seconds rounding, and 365-day cap", async () => {
  const f = await fixture();
  const expectedKeyValues = new Map([
    [1, 120n],
    [2, 158n],
    [3, 217n],
    [29, 20_089_560n],
    [30, 31_536_000n],
  ]);
  for (let building = 0; building < 8; building += 1) {
    let previous = 0n;
    for (let level = 1; level <= 30; level += 1) {
      const actual = await read(f.game, "buildDuration", [
        building,
        BigInt(level),
      ]);
      assert.equal(
        actual,
        exactBuildDuration(level),
        `building ${building}, level ${level}`,
      );
      assert.ok(
        actual > previous,
        `building ${building} must be strictly monotonic at level ${level}`,
      );
      previous = actual;
      if (expectedKeyValues.has(level))
        assert.equal(actual, expectedKeyValues.get(level));
    }
  }
  const zeroLevel = await call(
    f.game,
    alice,
    "buildDuration",
    [0, 0n],
    1_000n,
    true,
  );
  const tooHighLevel = await call(
    f.game,
    alice,
    "buildDuration",
    [0, 31n],
    1_000n,
    true,
  );
  assert.ok(
    zeroLevel.execResult.exceptionError,
    "level zero is not a supported duration",
  );
  assert.ok(
    tooHighLevel.execResult.exceptionError,
    "level 31 is not a supported duration",
  );

  const source = await readFile(
    new URL("../contracts/src/CivilizationGame.sol", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /return nextLevel \* 1 days|nextLevel \* 6 hours/,
    "old townhall-day and six-hour-linear durations are removed",
  );
  assert.match(
    source,
    /1\.1 \* 1\.569772144168414\^\(level - 1\) \+ 0\.9/,
    "the accepted minute factor is documented",
  );
  assert.match(
    source,
    /MAX_BUILD_DURATION_SECONDS = 365 days/,
    "the one-year duration cap is explicit",
  );
});

test("upgrade scheduling consumes the shared authoritative construction duration", async () => {
  const f = await fixture();
  ok(await call(f.game, alice, "registerWallet", [], 1_000n));
  ok(await call(f.game, alice, "claim", [], 90_000n));
  ok(await call(f.game, alice, "upgrade", [0], 90_000n));
  const state = await read(f.game, "playerState", [alice], 90_000n);
  assert.equal(state[8].completesAt, 90_000n + exactBuildDuration(1));
});

test("workshop bootstrap waives only CGOLD and later levels retain its normal CGOLD curve", async () => {
  const f = await fixture();
  const at = 10_000n;
  ok(await call(f.game, alice, "registerWallet", [], at));
  await setConstructionTestPlayer(f, alice, {
    stored: { wood: 90n, clay: 110n, stone: 105n, gold: 0n },
    buildings: constructionTestBuildings({
      timber: 2n,
      claypit: 2n,
      quarry: 2n,
      workshop: 0n,
    }),
  });

  ok(await call(f.game, alice, "upgrade", [5], at));
  let state = await read(f.game, "playerState", [alice], at);
  assert.deepEqual(state[3], { wood: 0n, clay: 0n, stone: 0n, gold: 0n });
  assert.equal(
    await read(f.game, "balanceOf", [alice]),
    0n,
    "workshop 0 -> 1 must not require or burn CGOLD",
  );

  const completesAt = state[8].completesAt;
  ok(await call(f.game, alice, "completeUpgrade", [], completesAt));
  await setConstructionTestPlayer(f, alice, {
    stored: { wood: 144n, clay: 176n, stone: 168n, gold: 0n },
    buildings: constructionTestBuildings({
      timber: 2n,
      claypit: 2n,
      quarry: 2n,
      workshop: 1n,
    }),
  });
  await seedGoldForMarketTest(f, alice, 24n * 10n ** 18n);

  ok(await call(f.game, alice, "upgrade", [5], completesAt));
  state = await read(f.game, "playerState", [alice], completesAt);
  assert.deepEqual(state[3], { wood: 0n, clay: 0n, stone: 0n, gold: 0n });
  assert.equal(
    await read(f.game, "balanceOf", [alice]),
    0n,
    "workshop 1 -> 2 keeps the regular 24 CGOLD cost",
  );
});

test("workshop construction capacity is 1, 2, and 3 at levels 1, 11, and 21", async () => {
  for (const [workshop, expectedCapacity] of [
    [1n, 1],
    [11n, 2],
    [21n, 3],
  ]) {
    const f = await fixture();
    const at = 20_000n;
    ok(await call(f.game, alice, "registerWallet", [], at));
    await setConstructionTestPlayer(f, alice, {
      stored: CONSTRUCTION_TEST_RESOURCES,
      buildings: constructionTestBuildings({ workshop }),
    });
    for (let index = 0; index < expectedCapacity; index += 1) {
      ok(await call(f.game, alice, "upgrade", [index + 1], at));
      const job = await read(f.game, "constructionJob", [alice, index], at);
      assert.equal(job & 1n, 1n, `slot ${index} is reserved`);
    }
    const blocked = await call(
      f.game,
      alice,
      "upgrade",
      [expectedCapacity + 1],
      at,
    );
    assert.ok(
      blocked.execResult.exceptionError,
      `workshop ${workshop} rejects a ${expectedCapacity + 1}th job`,
    );
  }
});

test("parallel construction debits resources and jobs can be boosted and completed independently", async () => {
  const f = await fixture();
  const at = 30_000n;
  ok(await call(f.game, alice, "registerWallet", [], at));
  await setConstructionTestPlayer(f, alice, {
    stored: CONSTRUCTION_TEST_RESOURCES,
    buildings: constructionTestBuildings({
      workshop: 11n,
      timber: 20n,
      claypit: 20n,
    }),
  });
  const before = await read(f.game, "playerState", [alice], at);
  ok(await call(f.game, alice, "upgrade", [1], at));
  ok(await call(f.game, alice, "upgrade", [2], at));
  const afterStart = await read(f.game, "playerState", [alice], at);
  assert.ok(afterStart[3].wood < before[3].wood);
  assert.ok(afterStart[3].clay < before[3].clay);
  assert.ok(afterStart[3].stone < before[3].stone);

  const slotZero = await read(f.game, "constructionJob", [alice, 0], at);
  const slotOne = await read(f.game, "constructionJob", [alice, 1], at);
  const slotZeroCompletesAt = slotZero >> 16n;
  const slotOneCompletesAt = slotOne >> 16n;
  assert.ok(slotOneCompletesAt - at >= 3_600n);
  ok(await call(f.token, deployer, "mint", [alice, 10n ** 18n], at));
  ok(
    await call(
      f.token,
      alice,
      "approve",
      [f.game.address.toString(), 10n ** 18n],
      at,
    ),
  );
  ok(await call(f.game, alice, "boostConstruction", [1, 1n], at));
  const boostedSlotZero = await read(f.game, "constructionJob", [alice, 0], at);
  const boostedSlotOne = await read(f.game, "constructionJob", [alice, 1], at);
  assert.equal(boostedSlotZero >> 16n, slotZeroCompletesAt);
  assert.equal(boostedSlotOne >> 16n, slotOneCompletesAt - 3_600n);

  ok(await call(f.game, alice, "completeUpgrade", [1], boostedSlotOne >> 16n));
  assert.equal(
    await read(f.game, "constructionJob", [alice, 1], boostedSlotOne >> 16n),
    0n,
  );
  assert.equal(
    (await read(f.game, "constructionJob", [alice, 0], boostedSlotOne >> 16n)) &
      1n,
    1n,
    "completing slot 1 leaves slot 0 active",
  );
  assert.equal(
    (await read(f.game, "playerState", [alice], boostedSlotOne >> 16n))[5]
      .claypit,
    21n,
  );
});

test("prestige remains blocked while any parallel construction job is active", async () => {
  const f = await fixture();
  const at = 40_000n;
  ok(await call(f.game, alice, "registerWallet", [], at));
  await setConstructionTestPlayer(f, alice, {
    stored: CONSTRUCTION_TEST_RESOURCES,
    buildings: constructionTestBuildings({ townhall: 30n, workshop: 21n }),
  });
  ok(await call(f.game, alice, "upgrade", [1], at));
  ok(await call(f.game, alice, "upgrade", [2], at));
  const slotZero = await read(f.game, "constructionJob", [alice, 0], at);
  ok(await call(f.game, alice, "completeUpgrade", [0], slotZero >> 16n));
  assert.equal(
    (await read(f.game, "constructionJob", [alice, 1], slotZero >> 16n)) & 1n,
    1n,
    "the non-legacy queue job is still active",
  );
  const blocked = await call(f.game, alice, "prestige", [], slotZero >> 16n);
  assert.ok(
    blocked.execResult.exceptionError,
    "prestige must inspect queue jobs as well as legacy construction",
  );
});

test("completeUpgrade discards offline time beyond its shared 24-hour cap", async () => {
  const f = await fixture();
  ok(await call(f.game, alice, "registerWallet", [], 1_000n));
  ok(await call(f.game, alice, "claim", [], 90_000n));
  ok(await call(f.game, alice, "upgrade", [1], 90_000n));
  const scheduled = await read(f.game, "playerState", [alice], 90_000n);
  const completedAt = scheduled[8].completesAt + 2n * 86_400n;
  ok(await call(f.game, alice, "completeUpgrade", [], completedAt));
  const afterCompletion = await read(
    f.game,
    "playerState",
    [alice],
    completedAt,
  );
  assert.equal(
    afterCompletion[1],
    completedAt,
    "the excess offline interval is discarded at completion",
  );
  const immediatePreview = await read(
    f.game,
    "previewAccrual",
    [alice],
    completedAt + 1n,
  );
  assert.equal(
    immediatePreview[0].wood,
    afterCompletion[4].wood,
    "an immediate preflight cannot receive another capped day",
  );
  assert.equal(immediatePreview[0].clay, afterCompletion[4].clay);
  assert.equal(immediatePreview[0].stone, afterCompletion[4].stone);
});

test("V1 to V2 to V1 to V2 upgrades only through timelock and preserve proxy state", async () => {
  const f = await fixture();
  ok(await call(f.game, alice, "registerWallet", [], 1_000n));
  ok(await call(f.game, bob, "registerWallet", [], 1_000n));
  ok(await call(f.game, alice, "claim", [], 90_000n));
  ok(await call(f.game, alice, "upgrade", [0], 90_000n)); // reachable pending construction
  const baseline = await read(f.game, "playerState", [alice], 90_000n);
  const allowance = await call(f.game, alice, "approve", [bob, 7n], 90_000n);
  ok(allowance);
  const v2 = await deploy(
    f.vm,
    artifact(
      "contracts/src/CivilizationGameV2Fixture.sol",
      "CivilizationGameV2Fixture",
    ),
  );
  const proxyAddress = f.proxy.address.toString();
  const directAdmin = await call(
    f.admin,
    deployer,
    "upgradeAndCall",
    [proxyAddress, v2.address.toString(), "0x"],
    90_001n,
  );
  assert.ok(
    directAdmin.execResult.exceptionError,
    "ProxyAdmin accepts only its timelock owner",
  );
  await upgrade(f, v2, 90_001n, `0x${"01".padStart(64, "0")}`);
  const gameV2 = { ...f.game, abi: v2.abi };
  assert.equal(gameV2.address.toString(), proxyAddress);
  assert.equal(await read(gameV2, "releaseVersion"), 2n);
  ok(await call(gameV2, alice, "setV2Marker", [99n], 90_061n));
  assert.deepEqual(
    await read(gameV2, "playerState", [alice], 90_061n),
    baseline,
    "registered player/resources/pending construction survive",
  );
  assert.equal(await read(gameV2, "allowance", [alice, bob]), 7n);
  assert.equal(
    (await read(gameV2, "revenueSplitter")).toLowerCase(),
    f.splitter.address.toString().toLowerCase(),
  );
  await upgrade(f, f.v1, 90_062n, `0x${"02".padStart(64, "0")}`);
  assert.equal(f.proxy.address.toString(), proxyAddress);
  assert.deepEqual(
    await read(f.game, "playerState", [alice], 90_122n),
    baseline,
  );
  await upgrade(f, v2, 90_123n, `0x${"03".padStart(64, "0")}`);
  assert.equal(
    await read(gameV2, "v2Marker"),
    99n,
    "separate V2 ERC-7201 namespace survives rollback",
  );
});

test("V1.1 timelock upgrade keeps V1 state and makes Workshop 0 to 1 reachable without CGOLD", async () => {
  const f = await fixture();
  const v11 = await deploy(
    f.vm,
    artifact(
      "contracts/src/CivilizationGameWorkshopFixV11.sol",
      "CivilizationGameWorkshopFixV11",
    ),
  );
  await upgrade(f, v11, 90_000n, `0x${"11".padStart(64, "0")}`);
  const game = { ...f.game, abi: v11.abi };
  let at = 90_061n;
  ok(await call(game, alice, "registerWallet", [], at));

  for (const building of [1, 2, 3, 0, 0]) {
    at += 86_400n;
    ok(await call(game, alice, "claim", [], at));
    ok(await call(game, alice, "upgrade", [building], at));
    const state = await read(game, "playerState", [alice], at);
    at = state[8].completesAt;
    ok(await call(game, alice, "completeUpgrade", [], at));
  }

  at += 86_400n;
  ok(await call(game, alice, "claim", [], at));
  assert.deepEqual((await read(game, "playerState", [alice], at))[5], {
    townhall: 2n,
    timber: 2n,
    claypit: 2n,
    quarry: 2n,
    warehouse: 1n,
    workshop: 0n,
    goldmine: 0n,
    barracks: 0n,
  });
  assert.equal(
    await read(game, "balanceOf", [alice], at),
    0n,
    "the player has no CGOLD before the bootstrap Workshop upgrade",
  );
  ok(await call(game, alice, "upgrade", [5], at));
  const pending = await read(game, "playerState", [alice], at);
  assert.equal(pending[8].pending, true);
  assert.equal(pending[8].building, 5);
});

test("timelock-configured reward claims mint through the proxy and survive a V1/V2 upgrade", async () => {
  const f = await fixture();
  const distributor = await deploy(
    f.vm,
    artifact(
      "contracts/src/CivilizationRewardDistributor.sol",
      "CivilizationRewardDistributor",
    ),
    [f.game.address.toString(), f.timelock.address.toString()],
  );
  const unauthorized = await call(
    f.game,
    deployer,
    "configureRewardDistributor",
    [distributor.address.toString()],
    1_000n,
  );
  assert.ok(
    unauthorized.execResult.exceptionError,
    "an EOA cannot configure the proxy reward minter",
  );
  await timelockCall(
    f,
    encodeFunctionData({
      abi: f.game.abi,
      functionName: "configureRewardDistributor",
      args: [distributor.address.toString()],
    }),
    1_000n,
    `0x${"03".repeat(32)}`,
  );

  const issuer = privateKeyToAccount(`0x${"11".repeat(32)}`);
  await timelockCall(
    f,
    encodeFunctionData({
      abi: distributor.abi,
      functionName: "configureIssuer",
      args: [issuer.address, 100n, 1_000n, 3_600n],
    }),
    1_061n,
    `0x${"04".repeat(32)}`,
    distributor.address.toString(),
  );

  const v2 = await deploy(
    f.vm,
    artifact(
      "contracts/src/CivilizationGameV2Fixture.sol",
      "CivilizationGameV2Fixture",
    ),
  );
  await upgrade(f, v2, 1_122n, `0x${"05".repeat(32)}`);
  const gameV2 = { ...f.game, abi: v2.abi };
  assert.equal(
    (await read(gameV2, "rewardDistributor")).toLowerCase(),
    distributor.address.toString().toLowerCase(),
    "the V1 ERC-7201 market namespace must remain readable after upgrade",
  );

  const claim = {
    recipient: alice,
    amount: 75n,
    rewardId: `0x${"aa".repeat(32)}`,
    nonce: 9n,
    deadline: 5_000n,
    chainId: 1n,
    verifyingContract: distributor.address.toString(),
  };
  const signature = await issuer.signTypedData({
    domain: {
      name: "Civilization CGOLD Rewards",
      version: "1",
      chainId: 1,
      verifyingContract: distributor.address.toString(),
    },
    types: {
      RewardClaim: [
        { name: "recipient", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "rewardId", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
    },
    primaryType: "RewardClaim",
    message: claim,
  });
  ok(await call(distributor, bob, "claim", [claim, signature], 1_183n));
  assert.equal(await read(gameV2, "balanceOf", [alice]), 75n);
  const replay = await call(
    distributor,
    carol,
    "claim",
    [claim, signature],
    1_184n,
  );
  assert.ok(replay.execResult.exceptionError, "reward IDs are replay-proof");

  await upgrade(f, f.v1, 1_185n, `0x${"06".repeat(32)}`);
  assert.equal(
    (await read(f.game, "rewardDistributor")).toLowerCase(),
    distributor.address.toString().toLowerCase(),
    "reward-minter configuration survives rollback to V1",
  );
  assert.equal(await read(f.game, "balanceOf", [alice]), 75n);
});

test("lowering a current period cap below issued rewards reverts PeriodCapExceeded without an arithmetic panic", async () => {
  const f = await fixture();
  const distributor = await deploy(
    f.vm,
    artifact(
      "contracts/src/CivilizationRewardDistributor.sol",
      "CivilizationRewardDistributor",
    ),
    [f.game.address.toString(), f.timelock.address.toString()],
  );
  const issuer = privateKeyToAccount(`0x${"13".repeat(32)}`);
  const sign = (claim) =>
    issuer.signTypedData({
      domain: {
        name: "Civilization CGOLD Rewards",
        version: "1",
        chainId: 1,
        verifyingContract: distributor.address.toString(),
      },
      types: {
        RewardClaim: [
          { name: "recipient", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "rewardId", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
      },
      primaryType: "RewardClaim",
      message: claim,
    });
  const claim = (amount, rewardId, nonce) => ({
    recipient: alice,
    amount,
    rewardId,
    nonce,
    deadline: 5_000n,
    chainId: 1n,
    verifyingContract: distributor.address.toString(),
  });

  await timelockCall(
    f,
    encodeFunctionData({
      abi: f.game.abi,
      functionName: "configureRewardDistributor",
      args: [distributor.address.toString()],
    }),
    1_000n,
    `0x${"20".repeat(32)}`,
  );
  await timelockCall(
    f,
    encodeFunctionData({
      abi: distributor.abi,
      functionName: "configureIssuer",
      args: [issuer.address, 100n, 100n, 3_600n],
    }),
    1_061n,
    `0x${"21".repeat(32)}`,
    distributor.address.toString(),
  );
  const issuedClaim = claim(60n, `0x${"aa".repeat(32)}`, 1n);
  ok(
    await call(
      distributor,
      bob,
      "claim",
      [issuedClaim, await sign(issuedClaim)],
      1_122n,
    ),
  );

  await timelockCall(
    f,
    encodeFunctionData({
      abi: distributor.abi,
      functionName: "configureIssuer",
      args: [issuer.address, 50n, 50n, 3_600n],
    }),
    1_123n,
    `0x${"22".repeat(32)}`,
    distributor.address.toString(),
  );
  const afterCapReduction = claim(1n, `0x${"bb".repeat(32)}`, 2n);
  const result = await call(
    distributor,
    bob,
    "claim",
    [afterCapReduction, await sign(afterCapReduction)],
    1_184n,
  );
  assert.ok(result.execResult.exceptionError);
  const decodedError = decodeErrorResult({
    abi: distributor.abi,
    data: bytesToHex(result.execResult.returnValue),
  });
  assert.equal(decodedError.errorName, "PeriodCapExceeded");
  assert.deepEqual(decodedError.args, [0n]);
});

test("reward distributor independently enforces signed bounds while pause/revoke leave game issuance and ERC-20 transfers live", async () => {
  const f = await fixture();
  const distributor = await deploy(
    f.vm,
    artifact(
      "contracts/src/CivilizationRewardDistributor.sol",
      "CivilizationRewardDistributor",
    ),
    [f.game.address.toString(), f.timelock.address.toString()],
  );
  const issuer = privateKeyToAccount(`0x${"12".repeat(32)}`);
  const configure = async (name, args, at, salt) =>
    timelockCall(
      f,
      encodeFunctionData({ abi: distributor.abi, functionName: name, args }),
      at,
      salt,
      distributor.address.toString(),
    );
  const sign = (claim) =>
    issuer.signTypedData({
      domain: {
        name: "Civilization CGOLD Rewards",
        version: "1",
        chainId: 1,
        verifyingContract: distributor.address.toString(),
      },
      types: {
        RewardClaim: [
          { name: "recipient", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "rewardId", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
      },
      primaryType: "RewardClaim",
      message: claim,
    });
  const claim = (overrides = {}) => ({
    recipient: alice,
    amount: 60n,
    rewardId: `0x${"01".repeat(32)}`,
    nonce: 1n,
    deadline: 5_000n,
    chainId: 1n,
    verifyingContract: distributor.address.toString(),
    ...overrides,
  });
  const rejected = async (attempt, label) => {
    const result = await attempt;
    assert.ok(result.execResult.exceptionError, label);
  };

  await rejected(
    call(f.game, alice, "mintReward", [alice, 1n], 1_000n),
    "an unconfigured direct mintReward caller is rejected",
  );
  await timelockCall(
    f,
    encodeFunctionData({
      abi: f.game.abi,
      functionName: "configureRewardDistributor",
      args: [distributor.address.toString()],
    }),
    1_000n,
    `0x${"10".repeat(32)}`,
  );
  await rejected(
    call(f.game, alice, "mintReward", [alice, 1n], 1_061n),
    "an EOA remains unable to call configured mintReward",
  );
  await configure(
    "configureIssuer",
    [issuer.address, 100n, 100n, 3_600n],
    1_061n,
    `0x${"11".repeat(32)}`,
  );

  for (const [bad, label] of [
    [claim({ deadline: 1_120n }), "expired claims are rejected"],
    [claim({ chainId: 2n }), "claims for another chain are rejected"],
    [
      claim({ verifyingContract: f.game.address.toString() }),
      "claims for another verifying contract are rejected",
    ],
    [claim({ amount: 101n }), "per-claim cap is enforced"],
  ]) {
    await rejected(
      call(distributor, bob, "claim", [bad, await sign(bad)], 1_122n),
      label,
    );
  }
  const signedForAlice = claim();
  await rejected(
    call(
      distributor,
      carol,
      "claim",
      [{ ...signedForAlice, recipient: bob }, await sign(signedForAlice)],
      1_122n,
    ),
    "changing a signed recipient cannot redirect a mint",
  );
  assert.equal(await read(f.game, "balanceOf", [bob]), 0n);

  ok(
    await call(
      distributor,
      carol,
      "claim",
      [signedForAlice, await sign(signedForAlice)],
      1_122n,
    ),
  );
  const periodOverflow = claim({
    amount: 50n,
    rewardId: `0x${"02".repeat(32)}`,
    nonce: 2n,
  });
  await rejected(
    call(
      distributor,
      bob,
      "claim",
      [periodOverflow, await sign(periodOverflow)],
      1_123n,
    ),
    "the cumulative period cap is enforced",
  );

  await configure("setClaimsPaused", [true], 1_200n, `0x${"12".repeat(32)}`);
  const paused = claim({ rewardId: `0x${"03".repeat(32)}`, nonce: 3n });
  await rejected(
    call(distributor, bob, "claim", [paused, await sign(paused)], 1_261n),
    "pause blocks distributor claims",
  );
  ok(await call(f.game, alice, "transfer", [bob, 10n], 1_261n));
  assert.equal(await read(f.game, "balanceOf", [bob]), 10n);
  await configure("setClaimsPaused", [false], 1_300n, `0x${"13".repeat(32)}`);
  await configure("revokeIssuer", [], 1_400n, `0x${"14".repeat(32)}`);
  const revoked = claim({ rewardId: `0x${"04".repeat(32)}`, nonce: 4n });
  await rejected(
    call(distributor, bob, "claim", [revoked, await sign(revoked)], 1_461n),
    "issuer revocation blocks distributor claims",
  );
  ok(await call(f.game, bob, "transfer", [carol, 1n], 1_461n));

  ok(await call(f.game, carol, "registerWallet", [], 2_000n));
  await setGameplayGoldField(f, carol, 1n);
  const beforeGameplayMints = await read(f.game, "totalSupply");
  ok(await call(f.game, carol, "claim", [], 5_600n));
  const afterFirstGameplayMint = await read(f.game, "totalSupply");
  await setGameplayGoldField(f, carol, 1n);
  ok(await call(f.game, carol, "claim", [], 9_200n));
  assert.ok(afterFirstGameplayMint > beforeGameplayMints);
  assert.ok(
    (await read(f.game, "totalSupply")) > afterFirstGameplayMint,
    "repeated deterministic claims grow supply without a global cap",
  );
});

test("deterministic mint and gameplay burn preserve CGOLD balance and totalSupply accounting", async () => {
  const f = await fixture();
  ok(await call(f.game, alice, "registerWallet", [], 1_000n));
  await setGameplayGoldField(f, alice, 24n);
  ok(await call(f.game, alice, "claim", [], 4_600n));
  const minted = await read(f.game, "balanceOf", [alice]);
  assert.equal(await read(f.game, "totalSupply"), minted);
  assert.ok(minted >= 24n * 10n ** 18n);
  await setConstructionTestPlayer(f, alice, {
    stored: { wood: 144n, clay: 176n, stone: 168n, gold: 0n },
    buildings: constructionTestBuildings({
      timber: 2n,
      claypit: 2n,
      quarry: 2n,
      workshop: 1n,
    }),
  });
  ok(await call(f.game, alice, "upgrade", [5], 8_200n));
  assert.equal(
    await read(f.game, "balanceOf", [alice]),
    minted - 24n * 10n ** 18n,
  );
  assert.equal(
    await read(f.game, "totalSupply"),
    minted - 24n * 10n ** 18n,
    "the executed gameplay burn decreases totalSupply by exactly the player balance decrease",
  );
});

test("RevenueSplitter allocates real token balances, rotates safely, and boost rejects fee-token deltas", async () => {
  const f = await fixture();
  const deadline = await read(f.splitter, "nextPayoutAt");
  ok(
    await call(f.token, deployer, "mint", [
      f.splitter.address.toString(),
      101n,
    ]),
  );
  const earlyAllocate = await call(
    f.splitter,
    alice,
    "allocate",
    [],
    deadline - 1n,
  );
  assert.ok(
    earlyAllocate.execResult.exceptionError,
    "allocate cannot bypass the monthly due time",
  );
  ok(await call(f.splitter, alice, "allocate", [], deadline));
  assert.equal(await read(f.splitter, "claimable", [bob]), 50n);
  assert.equal(
    await read(f.splitter, "claimable", [carol]),
    51n,
    "rounding remainder goes to final recipient",
  );
  ok(await call(f.splitter, alice, "release", [bob]));
  assert.equal(await read(f.token, "balanceOf", [bob]), 50n);
  ok(
    await call(f.token, deployer, "mint", [
      f.splitter.address.toString(),
      100n,
    ]),
  );
  const unauthorised = await call(f.splitter, alice, "setDistribution", [
    [alice, bob],
    [5000, 5000],
  ]);
  assert.ok(unauthorised.execResult.exceptionError);
  const change = encodeFunctionData({
    abi: f.splitter.abi,
    functionName: "setDistribution",
    args: [
      [alice, bob],
      [5000, 5000],
    ],
  });
  ok(
    await call(
      f.timelock,
      deployer,
      "schedule",
      [
        f.splitter.address.toString(),
        0n,
        change,
        zero32(),
        `0x${"04".padStart(64, "0")}`,
        60n,
      ],
      deadline + 1n,
    ),
  );
  ok(
    await call(
      f.timelock,
      deployer,
      "execute",
      [
        f.splitter.address.toString(),
        0n,
        change,
        zero32(),
        `0x${"04".padStart(64, "0")}`,
      ],
      deadline + 61n,
    ),
  );
  assert.equal(
    await read(f.splitter, "claimable", [carol]),
    101n,
    "a removed recipient retains its checkpointed entitlement",
  );
  ok(await call(f.splitter, deployer, "release", [carol]));
  assert.equal(
    await read(f.token, "balanceOf", [carol]),
    101n,
    "removed recipients can still claim their real WLD transfer",
  );
  const invalid = await deployResult(
    f.vm,
    artifact(
      "contracts/src/CivilizationRevenueSplitter.sol",
      "CivilizationRevenueSplitter",
    ),
    [
      f.token.address.toString(),
      f.timelock.address.toString(),
      [bob],
      [10_000],
    ],
  );
  assert.ok(
    invalid.execResult.exceptionError,
    "one-recipient configurations are invalid",
  );
  assert.equal(
    f.splitter.abi.some(
      (item) => item.type === "function" && /rescue|withdraw/i.test(item.name),
    ),
    false,
    "WLD has no rescue path",
  );
  assert.equal(
    await read(f.splitter, "totalClaimable"),
    await read(f.token, "balanceOf", [f.splitter.address.toString()]),
    "splitter accounting remains fully backed",
  );
  // A real level-10 Timber upgrade is longer than an hour; this reaches the
  // token transfer rather than failing the short-construction guard.
  async function startLongUpgrade(gameFixture, start) {
    ok(await call(gameFixture.game, alice, "registerWallet", [], start));
    let at = start + 86_400n;
    // Warehouse upgrades require Townhall 1; construct it through the normal
    // player action first (the initialized village starts at Townhall 0).
    ok(await call(gameFixture.game, alice, "claim", [], at));
    ok(await call(gameFixture.game, alice, "upgrade", [0], at));
    let townhall = await read(gameFixture.game, "playerState", [alice], at);
    at = townhall[8].completesAt;
    ok(await call(gameFixture.game, alice, "completeUpgrade", [], at));
    at += 86_400n;
    for (let i = 0; i < 2; i += 1) {
      ok(await call(gameFixture.game, alice, "claim", [], at));
      ok(await call(gameFixture.game, alice, "upgrade", [4], at));
      const state = await read(gameFixture.game, "playerState", [alice], at);
      at = state[8].completesAt;
      ok(await call(gameFixture.game, alice, "completeUpgrade", [], at));
      at += 86_400n;
    }
    for (let i = 0; i < 9; i += 1) {
      ok(await call(gameFixture.game, alice, "claim", [], at));
      ok(await call(gameFixture.game, alice, "upgrade", [1], at));
      const state = await read(gameFixture.game, "playerState", [alice], at);
      if (i === 8) return { at, completesAt: state[8].completesAt };
      at = state[8].completesAt;
      ok(await call(gameFixture.game, alice, "completeUpgrade", [], at));
      at += 86_400n;
    }
  }
  const normal = await fixture();
  const normalUpgrade = await startLongUpgrade(normal, 1_000n);
  assert.ok(
    normalUpgrade.completesAt - normalUpgrade.at > 3_600n,
    "fixture reaches a valid one-hour boost",
  );
  ok(
    await call(
      normal.token,
      deployer,
      "mint",
      [alice, 10n ** 18n],
      normalUpgrade.at,
    ),
  );
  ok(
    await call(
      normal.token,
      alice,
      "approve",
      [normal.proxy.address.toString(), 10n ** 18n],
      normalUpgrade.at,
    ),
  );
  const normalBefore = await read(
    normal.token,
    "balanceOf",
    [normal.splitter.address.toString()],
    normalUpgrade.at,
  );
  ok(
    await call(normal.game, alice, "boostConstruction", [1n], normalUpgrade.at),
  );
  assert.equal(
    await read(
      normal.token,
      "balanceOf",
      [normal.splitter.address.toString()],
      normalUpgrade.at,
    ),
    normalBefore + 5n * 10n ** 17n,
    "exactly half of normal WLD reaches the splitter",
  );
  assert.equal(
    await read(normal.buybackVault, "pendingWld"),
    5n * 10n ** 17n,
    "the other half is non-claimable vault funding",
  );
  const fee = await fixture();
  const feeUpgrade = await startLongUpgrade(fee, 1_000n);
  ok(
    await call(fee.token, deployer, "mint", [alice, 10n ** 18n], feeUpgrade.at),
  );
  ok(
    await call(
      fee.token,
      alice,
      "approve",
      [fee.proxy.address.toString(), 10n ** 18n],
      feeUpgrade.at,
    ),
  );
  ok(await call(fee.token, deployer, "setFeeBps", [100]));
  const feeBoost = await call(
    fee.game,
    alice,
    "boostConstruction",
    [1n],
    feeUpgrade.at,
  );
  assert.ok(
    feeBoost.execResult.exceptionError,
    "fee-token boost must reject a short splitter delta",
  );
  assert.equal(
    bytesToHex(feeBoost.execResult.returnValue).slice(0, 10),
    keccak256(stringToHex("WorldTokenAmountMismatch()")).slice(0, 10),
    "the reached revert is WorldTokenAmountMismatch",
  );
  assert.equal(
    (await read(fee.game, "playerState", [alice], feeUpgrade.at))[8]
      .completesAt,
    feeUpgrade.completesAt,
    "a failed post-commit transfer rolls back the construction-time update",
  );
});

test("monthly WLD payout is permissionless, pays the active 50/50 split, and no-ops before its deadline", async () => {
  const f = await fixture();
  const deadline = await read(f.splitter, "nextPayoutAt");
  ok(
    await call(f.token, deployer, "mint", [
      f.splitter.address.toString(),
      101n,
    ]),
  );
  ok(await call(f.splitter, alice, "processMonthlyPayout", [], deadline - 1n));
  assert.equal(
    await read(f.token, "balanceOf", [bob]),
    0n,
    "not due does not pay",
  );
  ok(await call(f.splitter, alice, "processMonthlyPayout", [], deadline));
  assert.equal(await read(f.token, "balanceOf", [bob]), 50n);
  assert.equal(await read(f.token, "balanceOf", [carol]), 51n);
  assert.equal(await read(f.splitter, "totalClaimable"), 0n);
  assert.ok(
    (await read(f.splitter, "nextPayoutAt")) > deadline,
    "deadline advances even after payout",
  );
  // A zero-balance due period still advances, avoiding a permanently due endpoint.
  const secondDeadline = await read(f.splitter, "nextPayoutAt");
  ok(await call(f.splitter, bob, "processMonthlyPayout", [], secondDeadline));
  assert.ok((await read(f.splitter, "nextPayoutAt")) > secondDeadline);
  const longInactiveDeadline = await read(f.splitter, "nextPayoutAt");
  const missedPeriods = 100_000n;
  const longInactiveAt =
    longInactiveDeadline + missedPeriods * 30n * 24n * 60n * 60n;
  ok(await call(f.splitter, carol, "processMonthlyPayout", [], longInactiveAt));
  assert.equal(
    await read(f.splitter, "nextPayoutAt"),
    longInactiveDeadline + (missedPeriods + 1n) * 30n * 24n * 60n * 60n,
    "missed periods advance with O(1) arithmetic",
  );
});

test("a successful GAME action settles the due 50/50 WLD payout, but the same action is a no-op before deadline", async () => {
  const f = await fixture();
  const deadline = await read(f.splitter, "nextPayoutAt");
  const amount = 2n * 10n ** 18n;
  ok(
    await call(f.token, deployer, "mint", [
      f.splitter.address.toString(),
      amount,
    ]),
  );
  ok(await call(f.game, alice, "registerWallet", [], deadline - 1n));
  assert.equal(
    await read(f.token, "balanceOf", [bob]),
    0n,
    "a pre-deadline GAME action cannot transfer WLD",
  );
  assert.equal(
    await read(f.token, "balanceOf", [carol]),
    0n,
    "a pre-deadline GAME action cannot transfer WLD",
  );
  ok(await call(f.game, deployer, "registerWallet", [], deadline));
  assert.equal(
    await read(f.token, "balanceOf", [bob]),
    amount / 2n,
    "the due GAME action transfers Bob's current 50/50 WLD share",
  );
  assert.equal(
    await read(f.token, "balanceOf", [carol]),
    amount / 2n,
    "the due GAME action transfers Carol's current 50/50 WLD share",
  );
  assert.equal(
    await read(f.splitter, "totalClaimable"),
    0n,
    "the game-triggered payout transfers instead of leaving only claimable allocation",
  );
});

test("GAME payout call funds all ten permitted recipients and remains best-effort when token transfer fails", async () => {
  const recipients = Array.from(
    { length: 10 },
    (_, i) => `0x${(i + 10).toString(16).padStart(2, "0").repeat(20)}`,
  );
  const f = await fixture(1_000n, recipients, Array(10).fill(1000));
  const deadline = await read(f.splitter, "nextPayoutAt");
  ok(await call(f.game, alice, "registerWallet", [], 1_000n));
  ok(
    await call(f.token, deployer, "mint", [
      f.splitter.address.toString(),
      1_000n,
    ]),
  );
  ok(await call(f.game, alice, "claim", [], deadline));
  for (const recipient of recipients)
    assert.equal(
      await read(f.token, "balanceOf", [recipient]),
      100n,
      `GAME payout must transfer the 10-way share to ${recipient}`,
    );

  const failing = await fixture();
  const failingDeadline = await read(failing.splitter, "nextPayoutAt");
  ok(await call(failing.game, alice, "registerWallet", [], 1_000n));
  ok(
    await call(failing.token, deployer, "mint", [
      failing.splitter.address.toString(),
      100n,
    ]),
  );
  ok(await call(failing.token, deployer, "setTransferFails", [true]));
  ok(
    await call(failing.game, alice, "claim", [], failingDeadline),
    "a failed payout is deferred without reverting the player action",
  );
  assert.equal(await read(failing.token, "balanceOf", [bob]), 0n);
  assert.equal(
    await read(failing.splitter, "nextPayoutAt"),
    failingDeadline,
    "failed best-effort payout remains available to the manual fallback",
  );
  ok(await call(failing.token, deployer, "setTransferFails", [false]));
  ok(
    await call(
      failing.splitter,
      carol,
      "processMonthlyPayout",
      [],
      failingDeadline,
    ),
  );
  assert.equal(
    await read(failing.token, "balanceOf", [bob]),
    50n,
    "permissionless manual fallback transfers deferred WLD",
  );
  assert.equal(
    await read(failing.token, "balanceOf", [carol]),
    50n,
    "permissionless manual fallback transfers deferred WLD",
  );
});

test("buyback route and pause are timelock-only and reject invalid router and pair configurations", async () => {
  const f = await fixture();
  const { pool, router } = await deployBuybackRoute(f, 2_000n);
  const routeArgs = [
    router.address.toString(),
    pool.address.toString(),
    3_000,
    1n,
    100n,
    60,
    0,
  ];
  for (const [name, args] of [
    ["setPaused", [true]],
    ["configureRoute", routeArgs],
  ]) {
    const unauthorized = await call(f.buybackVault, alice, name, args, 2_061n);
    assert.ok(
      unauthorized.execResult.exceptionError,
      `${name} is timelock-only`,
    );
  }
  const invalidRouter = await call(
    f.buybackVault,
    f.timelock.address.toString(),
    "configureRoute",
    [alice, pool.address.toString(), 3_000, 1n, 100n, 60, 0],
    2_061n,
  );
  assert.ok(invalidRouter.execResult.exceptionError, "EOA router is rejected");
  const wrongPair = await deploy(
    f.vm,
    artifact("test/fixtures/MockBuybackV3Pool.sol", "MockBuybackV3Pool"),
    [f.token.address.toString(), f.token.address.toString()],
    2_061n,
  );
  const invalidPair = await call(
    f.buybackVault,
    f.timelock.address.toString(),
    "configureRoute",
    [
      router.address.toString(),
      wrongPair.address.toString(),
      3_000,
      1n,
      100n,
      60,
      0,
    ],
    2_061n,
  );
  assert.ok(
    invalidPair.execResult.exceptionError,
    "non-WLD/CGOLD pool is rejected",
  );
  await timelockCall(
    f,
    encodeFunctionData({
      abi: f.buybackVault.abi,
      functionName: "setPaused",
      args: [true],
    }),
    2_100n,
    `0x${"c".repeat(64)}`,
    f.buybackVault.address.toString(),
  );
  assert.equal(await read(f.buybackVault, "paused"), true);
});

test("buyback only spends credited WLD, quotes positive and negative TWAP ticks, and burns received CGOLD", async () => {
  const f = await fixture();
  const { pool, router } = await deployBuybackRoute(f, 3_000n, 100n);
  const executeAt = 3_061n;
  ok(await call(f.token, deployer, "mint", [alice, 50n], executeAt));
  ok(
    await call(
      f.token,
      alice,
      "transfer",
      [f.buybackVault.address.toString(), 50n],
      executeAt,
    ),
  );
  const directFunding = await call(
    f.buybackVault,
    alice,
    "recordFunding",
    [50n],
    executeAt,
  );
  assert.ok(
    directFunding.execResult.exceptionError,
    "direct WLD is never creditable",
  );
  await creditBuybackVault(f, 100n, executeAt);
  await seedGoldForMarketTest(f, router.address.toString(), 250n);
  await setGoldTotalSupplyForMarketTest(f, 250n);
  ok(await call(router, deployer, "setAmountOut", [150n], executeAt));
  const first = await call(
    f.buybackVault,
    carol,
    "execute",
    [0n, 4_000n],
    executeAt,
  );
  ok(first);
  assert.deepEqual(
    decodeFunctionResult({
      abi: f.buybackVault.abi,
      functionName: "execute",
      data: bytesToHex(first.execResult.returnValue),
    }),
    [true, 150n],
  );
  assert.equal(await read(f.buybackVault, "pendingWld"), 0n);
  assert.equal(
    await read(f.token, "balanceOf", [f.buybackVault.address.toString()]),
    50n,
  );
  assert.equal(
    await read(f.token, "balanceOf", [router.address.toString()]),
    100n,
  );
  assert.equal(await read(f.buybackVault, "cumulativeSpent"), 100n);
  assert.equal(await read(f.buybackVault, "cumulativeCgoldBurned"), 150n);
  assert.equal(
    await read(f.game, "balanceOf", [f.buybackVault.address.toString()]),
    0n,
  );
  assert.equal(await read(f.game, "totalSupply"), 100n);

  await creditBuybackVault(f, 100n, 3_062n);
  ok(await call(pool, deployer, "setObservation", [0n, -6_000n], 3_062n));
  ok(await call(router, deployer, "setAmountOut", [100n], 3_062n));
  const second = await call(
    f.buybackVault,
    carol,
    "execute",
    [100n, 4_000n],
    3_062n,
  );
  ok(second);
  assert.deepEqual(
    decodeFunctionResult({
      abi: f.buybackVault.abi,
      functionName: "execute",
      data: bytesToHex(second.execResult.returnValue),
    }),
    [true, 100n],
    "negative TWAP tick remains a valid constrained route",
  );
  assert.equal(await read(f.buybackVault, "cumulativeSpent"), 200n);
  assert.equal(await read(f.buybackVault, "cumulativeCgoldBurned"), 250n);
  assert.equal(
    await read(f.game, "totalSupply"),
    0n,
    "all router-delivered CGOLD burned immediately",
  );
});

test("buyback observation and router failures defer without losing pending credits", async () => {
  const f = await fixture();
  const { pool, router } = await deployBuybackRoute(f, 5_000n);
  await creditBuybackVault(f, 100n, 5_061n);
  ok(await call(pool, deployer, "setObservationLengths", [2n, 1n], 5_061n));
  const malformedObservation = await call(
    f.buybackVault,
    alice,
    "execute",
    [0n, 6_000n],
    5_061n,
  );
  ok(malformedObservation);
  assert.deepEqual(
    decodeFunctionResult({
      abi: f.buybackVault.abi,
      functionName: "execute",
      data: bytesToHex(malformedObservation.execResult.returnValue),
    }),
    [false, 0n],
    "a malformed secondary observation array defers the buyback",
  );
  assert.equal(await read(f.buybackVault, "pendingWld"), 100n);
  ok(await call(pool, deployer, "setObservationLengths", [2n, 2n], 5_061n));
  ok(await call(pool, deployer, "setObservationFails", [true], 5_061n));
  const observationFailure = await call(
    f.buybackVault,
    alice,
    "execute",
    [0n, 6_000n],
    5_061n,
  );
  ok(observationFailure);
  assert.deepEqual(
    decodeFunctionResult({
      abi: f.buybackVault.abi,
      functionName: "execute",
      data: bytesToHex(observationFailure.execResult.returnValue),
    }),
    [false, 0n],
  );
  assert.equal(await read(f.buybackVault, "pendingWld"), 100n);
  assert.equal(await read(f.buybackVault, "cumulativeSpent"), 0n);

  ok(await call(pool, deployer, "setObservationFails", [false], 5_062n));
  ok(await call(router, deployer, "setRouterFails", [true], 5_062n));
  const routerFailure = await call(
    f.buybackVault,
    alice,
    "execute",
    [0n, 6_000n],
    5_062n,
  );
  ok(routerFailure);
  assert.deepEqual(
    decodeFunctionResult({
      abi: f.buybackVault.abi,
      functionName: "execute",
      data: bytesToHex(routerFailure.execResult.returnValue),
    }),
    [false, 0n],
  );
  assert.equal(await read(f.buybackVault, "pendingWld"), 100n);
  assert.equal(await read(f.buybackVault, "cumulativeSpent"), 0n);
  assert.equal(
    await read(f.token, "balanceOf", [f.buybackVault.address.toString()]),
    100n,
  );
  assert.equal(
    await read(f.token, "allowance", [
      f.buybackVault.address.toString(),
      router.address.toString(),
    ]),
    0n,
    "a caught router failure cannot retain a WLD allowance",
  );
});

test("buyback rejects a router return that disagrees with received CGOLD", async () => {
  const f = await fixture();
  const { router } = await deployBuybackRoute(f, 6_500n);
  await creditBuybackVault(f, 100n, 6_561n);
  await seedGoldForMarketTest(f, router.address.toString(), 100n);
  await setGoldTotalSupplyForMarketTest(f, 100n);
  ok(await call(router, deployer, "setAmountOut", [100n], 6_561n));
  ok(await call(router, deployer, "setReportedAmountOut", [99n], 6_561n));

  const mismatch = await call(
    f.buybackVault,
    alice,
    "execute",
    [0n, 7_000n],
    6_561n,
  );
  assert.ok(
    mismatch.execResult.exceptionError,
    "a reported output must equal the CGOLD balance delta",
  );
  assert.equal(await read(f.buybackVault, "pendingWld"), 100n);
  assert.equal(
    await read(f.token, "balanceOf", [f.buybackVault.address.toString()]),
    100n,
    "a mismatched return rolls back the router WLD transfer",
  );
  assert.equal(await read(f.buybackVault, "cumulativeSpent"), 0n);
  assert.equal(await read(f.buybackVault, "cumulativeCgoldBurned"), 0n);
});

test("buyback defers a zero TWAP quote before approving or calling the router", async () => {
  const f = await fixture();
  const { router } = await deployBuybackRoute(f, 7_000n, -100n);
  await creditBuybackVault(f, 1n, 7_061n);

  const deferred = await call(
    f.buybackVault,
    alice,
    "execute",
    [0n, 8_000n],
    7_061n,
  );
  ok(deferred);
  assert.deepEqual(
    decodeFunctionResult({
      abi: f.buybackVault.abi,
      functionName: "execute",
      data: bytesToHex(deferred.execResult.returnValue),
    }),
    [false, 0n],
  );
  assert.equal(
    await read(router, "exactInputSingleCalls"),
    0n,
    "zero output cannot call the router",
  );
  assert.equal(
    await read(f.token, "allowance", [
      f.buybackVault.address.toString(),
      router.address.toString(),
    ]),
    0n,
    "zero output cannot approve the router",
  );
  assert.equal(await read(f.buybackVault, "pendingWld"), 1n);
  assert.equal(await read(f.buybackVault, "cumulativeSpent"), 0n);
  assert.equal(
    await read(f.token, "balanceOf", [f.buybackVault.address.toString()]),
    1n,
    "zero output cannot spend credited WLD",
  );
});
