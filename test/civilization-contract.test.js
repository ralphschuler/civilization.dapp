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
import {
  concatHex,
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
  for (const f of ["MockWorldToken.sol", "MockWorldIdVerifier.sol"])
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
          optimizer: { enabled: true, runs: 200 },
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
  const vm = await createVM();
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
  return {
    vm,
    v1,
    verifier,
    token,
    timelock,
    registry,
    splitter,
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

test("pinned Solidity/OZ sources compile deterministically; implementation is locked and EIP-170 safe", async () => {
  await compile();
  assert.equal(solc.version(), "0.8.30+commit.73712a01.Emscripten.clang");
  const game = artifact(
    "contracts/src/CivilizationGame.sol",
    "CivilizationGame",
  );
  assert.ok(game.evm.deployedBytecode.object.length / 2 < 24_576);
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
    normalBefore + 10n ** 18n,
    "normal WLD reaches the splitter exactly",
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
