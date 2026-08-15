import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { keccak256 } from "viem";
import {
  assertCompilerAbiPreflight,
  assertAddressStorageWord,
  compileWorldchainArtifacts,
  assertProxyAdminImmutableReferences,
  assertDeploymentNonce,
  assertRegistryRecord,
  assertWorldIdPlanBounds,
  isRecoveredStep,
  materializeRuntimeBytecode,
  materializedRuntimeCodehash,
  resolveImmutableReferenceNames,
  readWorldIdStorageSnapshot,
  recoverDeploymentPrefix,
  waitForRuntimeBytecode,
} from "../scripts/worldchain-proxy-runner.mjs";

const registryRecord = () => ({
  proxy: "0x0000000000000000000000000000000000000001",
  version: 1n,
  implementation: "0x0000000000000000000000000000000000000002",
  implementationCodehash: `0x${"aa".repeat(32)}`,
  sourceCommit: `0x${"bb".repeat(32)}`,
  storageLayoutHash: `0x${"cc".repeat(32)}`,
});

test("named registry record verification accepts all six expected fields", () => {
  const expected = registryRecord();
  assert.doesNotThrow(() => assertRegistryRecord({ ...expected }, expected));
});

test("named registry record verification fails closed for missing or wrong fields", () => {
  const expected = registryRecord();
  for (const field of Object.keys(expected)) {
    const missing = { ...expected };
    delete missing[field];
    assert.throws(
      () => assertRegistryRecord(missing, expected),
      new RegExp(`registry record ${field} is missing`),
    );

    const wrong = {
      ...expected,
      [field]: field === "version" ? 2n : "wrong",
    };
    assert.throws(
      () => assertRegistryRecord(wrong, expected),
      new RegExp(`registry record ${field}`),
    );
  }
  assert.throws(
    () => assertRegistryRecord([], expected),
    /registry record must be a named object/,
  );
});

const worldIdSnapshot = {
  slot: "0xb9c5fb29a19a4c3e9d391dc26eaefcdaaec2a4fc6362d4bd27f1470fa2592b00",
  structs: {
    GameStorage: [
      "uint256 totalSupply",
      "mapping(address => uint256) balanceOf",
      "mapping(address => mapping(address => uint256)) allowance",
      "IWorldIDVerifier worldIdVerifier",
      "uint256 worldIdAction",
      "uint64 worldIdRpId",
      "uint64 worldIdIssuerSchemaId",
      "uint256 worldIdCredentialGenesisIssuedAtMin",
    ],
  },
};

const word = (value) => `0x${value.toString(16).padStart(64, "0")}`;

test("World ID storage helper unpacks the frozen V1 packed fields", async () => {
  const rpId = 42n;
  const issuerSchemaId = 73n;
  const credentialGenesisIssuedAtMin = 123_456_789n;
  const requestedSlots = [];
  const values = await readWorldIdStorageSnapshot({
    snapshot: worldIdSnapshot,
    address: "0x0000000000000000000000000000000000000001",
    getStorageAt: async ({ slot }) => {
      requestedSlots.push(slot);
      return slot.endsWith("05")
        ? word(rpId | (issuerSchemaId << 64n))
        : word(credentialGenesisIssuedAtMin);
    },
  });
  assert.deepEqual(values, {
    rpId,
    issuerSchemaId,
    credentialGenesisIssuedAtMin,
  });
  const base = BigInt(worldIdSnapshot.slot);
  assert.deepEqual(requestedSlots, [
    `0x${(base + 5n).toString(16).padStart(64, "0")}`,
    `0x${(base + 6n).toString(16).padStart(64, "0")}`,
  ]);
});

test("World ID storage helper accepts uint64 packing boundaries only", async () => {
  const base = BigInt(worldIdSnapshot.slot);
  for (const [rpId, issuerSchemaId] of [
    [0n, (1n << 64n) - 1n],
    [(1n << 64n) - 1n, 0n],
  ]) {
    const values = await readWorldIdStorageSnapshot({
      snapshot: worldIdSnapshot,
      address: "0x0000000000000000000000000000000000000001",
      getStorageAt: async ({ slot }) =>
        slot === `0x${(base + 5n).toString(16).padStart(64, "0")}`
          ? word(rpId | (issuerSchemaId << 64n))
          : word(0n),
    });
    assert.equal(values.rpId, rpId);
    assert.equal(values.issuerSchemaId, issuerSchemaId);
  }
});

test("World ID storage helper rejects reordered snapshots and missing storage", async () => {
  for (let index = 0; index < 8; index += 1) {
    const reordered = structuredClone(worldIdSnapshot);
    reordered.structs.GameStorage[index] = "uint256 incompatiblePrefixField";
    await assert.rejects(
      readWorldIdStorageSnapshot({
        snapshot: reordered,
        address: "0x0000000000000000000000000000000000000001",
        getStorageAt: async () => word(0n),
      }),
      /frozen GameStorage World ID field ordering/,
    );
  }
  await assert.rejects(
    readWorldIdStorageSnapshot({
      snapshot: worldIdSnapshot,
      address: "0x0000000000000000000000000000000000000001",
      getStorageAt: async ({ slot }) =>
        slot.endsWith("05") ? word(1n << 128n) : word(0n),
    }),
    /storage has dirty upper bits/,
  );
  await assert.rejects(
    readWorldIdStorageSnapshot({
      snapshot: worldIdSnapshot,
      address: "0x0000000000000000000000000000000000000001",
      getStorageAt: async () => undefined,
    }),
    /storage is missing or malformed/,
  );
});

const compilerAbiFixture = () => {
  const functions = (names) =>
    names.map((name) => ({ type: "function", name, inputs: [], outputs: [] }));
  return {
    game: {
      abi: functions([
        "initialize",
        "revenueSplitter",
        "timelock",
        "CLAIM_COOLDOWN",
        "worldIdVerifier",
        "worldIdLegacyRouter",
        "worldToken",
        "worldIdAction",
        "worldIdRpId",
        "worldIdLegacyExternalNullifier",
        "MAX_OFFLINE_SECONDS",
        "prestigeMultiplierBps",
      ]),
    },
    splitter: {
      abi: functions([
        "token",
        "timelock",
        "recipients",
        "PAYOUT_PERIOD",
        "sharesBps",
      ]),
    },
    registry: { abi: functions(["owner", "releaseCount", "releaseAt"]) },
    timelock: { abi: functions(["hasRole"]) },
    proxyAdmin: { abi: functions(["owner"]) },
  };
};

test("compiler ABI preflight accepts every required compiler ABI function entry", () => {
  assert.doesNotThrow(() => assertCompilerAbiPreflight(compilerAbiFixture()));
});

test("compiler ABI preflight rejects a missing function before deployment", () => {
  const artifacts = compilerAbiFixture();
  artifacts.game.abi = artifacts.game.abi.filter(
    ({ name }) => name !== "initialize",
  );
  assert.throws(
    () => assertCompilerAbiPreflight(artifacts),
    /game\.initialize function entry is missing/,
  );
});

test("World ID plan bounds are uint64/uint256 fail-closed", () => {
  assert.doesNotThrow(() =>
    assertWorldIdPlanBounds({
      rpId: (1n << 64n) - 1n,
      issuerSchemaId: (1n << 64n) - 1n,
      credentialGenesisIssuedAtMin: (1n << 256n) - 1n,
    }),
  );
  assert.throws(
    () =>
      assertWorldIdPlanBounds({
        rpId: 1n << 64n,
        issuerSchemaId: 1n,
        credentialGenesisIssuedAtMin: 1n,
      }),
    /world\.rpId must fit in uint64/,
  );
  assert.throws(
    () =>
      assertWorldIdPlanBounds({
        rpId: 1n,
        issuerSchemaId: 1n << 64n,
        credentialGenesisIssuedAtMin: 1n,
      }),
    /world\.issuerSchemaId must fit in uint64/,
  );
  assert.throws(
    () =>
      assertWorldIdPlanBounds({
        rpId: 1n,
        issuerSchemaId: 1n,
        credentialGenesisIssuedAtMin: 1n << 256n,
      }),
    /world\.credentialGenesisIssuedAtMin must fit in uint256/,
  );
});

const immutableArtifact = (
  immutableReferences = { 42: [{ start: 1, length: 4 }] },
) => ({
  immutableReferenceNames: Object.fromEntries(
    Object.keys(immutableReferences).map((id) => [id, "token"]),
  ),
  evm: {
    deployedBytecode: {
      // The four middle bytes stand in for compiler-declared immutable values.
      object: "60000000000055",
      immutableReferences,
    },
  },
});

test("runtime materialization writes the expected immutable into every occurrence", () => {
  const artifact = immutableArtifact({
    42: [
      { start: 1, length: 2 },
      { start: 3, length: 2 },
    ],
  });
  const compiled = "0x60000000000055";
  assert.equal(
    materializeRuntimeBytecode({
      artifact,
      expectedImmutables: { token: "aabb" },
      step: "splitter",
    }),
    "0x60aabbaabb0055",
  );
  assert.equal(
    materializedRuntimeCodehash({
      artifact,
      expectedImmutables: { token: "aabb" },
      step: "splitter",
    }),
    keccak256("0x60aabbaabb0055"),
  );
  assert.notEqual(compiled, "0x60aabbaabb0055");
});

test("runtime validation fails closed for malformed bytecode lengths and immutable ranges", () => {
  assert.throws(
    () =>
      materializeRuntimeBytecode({
        artifact: immutableArtifact(),
        expectedImmutables: { token: "aabb" },
        step: "splitter",
      }),
    /wrong hex width/,
  );
  assert.throws(
    () =>
      materializeRuntimeBytecode({
        artifact: immutableArtifact({ 42: [{ start: 6, length: 2 }] }),
        expectedImmutables: { token: "0000" },
        step: "splitter",
      }),
    /invalid range/,
  );
  assert.throws(
    () =>
      materializeRuntimeBytecode({
        artifact: immutableArtifact({
          42: [
            { start: 1, length: 2 },
            { start: 2, length: 2 },
          ],
        }),
        expectedImmutables: { token: "0000" },
        step: "splitter",
      }),
    /overlapping ranges/,
  );
  assert.throws(
    () =>
      materializeRuntimeBytecode({
        artifact: immutableArtifact({ 42: [] }),
        expectedImmutables: { token: "" },
        step: "splitter",
      }),
    /splitter compiler immutableReferences contain an empty group/,
  );
});

test("runtime materialization rejects missing, extra, and non-reference immutable names", () => {
  const artifact = immutableArtifact();
  assert.throws(
    () =>
      materializeRuntimeBytecode({
        artifact,
        expectedImmutables: {},
        step: "splitter",
      }),
    /do not exactly match/,
  );
  assert.throws(
    () =>
      materializeRuntimeBytecode({
        artifact,
        expectedImmutables: { token: "aabbccdd", extra: "00" },
        step: "splitter",
      }),
    /do not exactly match/,
  );
});

const proxyImmutableArtifact = () => ({
  immutableReferenceNames: { 7: "_admin" },
  evm: {
    deployedBytecode: {
      object: `60${"00".repeat(32)}55`,
      immutableReferences: { 7: [{ start: 1, length: 32 }] },
    },
  },
});
const proxyRuntimeWithAdmin = (admin) =>
  `0x60${admin.slice(2).padStart(64, "0")}55`;

test("proxy immutable reference must bind the expected first ProxyAdmin child", () => {
  const expected = "0x00000000000000000000000000000000000000a1";
  const elsewhere = "0x00000000000000000000000000000000000000b2";
  const artifact = proxyImmutableArtifact();
  assert.throws(
    () =>
      assertProxyAdminImmutableReferences({
        artifact,
        runtimeCode: proxyRuntimeWithAdmin(elsewhere),
        expectedProxyAdmin: expected,
      }),
    /proxy immutable ProxyAdmin reference/,
  );
  assert.doesNotThrow(() =>
    assertProxyAdminImmutableReferences({
      artifact,
      runtimeCode: proxyRuntimeWithAdmin(expected),
      expectedProxyAdmin: expected,
    }),
  );
});

test("immutable AST resolution is dynamic and fails closed on unknown, non-immutable, or duplicate IDs", () => {
  const artifact = immutableArtifact({ 17: [{ start: 1, length: 4 }] });
  const immutable = {
    nodeType: "VariableDeclaration",
    id: 17,
    name: "token",
    mutability: "immutable",
  };
  assert.deepEqual(
    resolveImmutableReferenceNames({
      artifact,
      sourceAsts: { one: { ast: immutable } },
      step: "splitter",
    }),
    { 17: "token" },
  );
  assert.throws(
    () =>
      resolveImmutableReferenceNames({
        artifact,
        sourceAsts: { one: { ast: { ...immutable, id: 99 } } },
        step: "splitter",
      }),
    /ambiguous AST declaration/,
  );
  assert.throws(
    () =>
      resolveImmutableReferenceNames({
        artifact,
        sourceAsts: { one: { ast: { ...immutable, mutability: "mutable" } } },
        step: "splitter",
      }),
    /not a named immutable/,
  );
  assert.throws(
    () =>
      resolveImmutableReferenceNames({
        artifact,
        sourceAsts: { one: { ast: { children: [immutable, immutable] } } },
        step: "splitter",
      }),
    /ambiguous AST declaration/,
  );
});

test("compiler immutable regression checks names and group counts without AST IDs", async () => {
  const artifacts = await compileWorldchainArtifacts();
  const groups = (artifact) => {
    const refs = artifact.evm.deployedBytecode.immutableReferences;
    return Object.fromEntries(
      Object.entries(refs).map(([id, ranges]) => [
        artifact.immutableReferenceNames[id],
        ranges.length,
      ]),
    );
  };
  assert.deepEqual(groups(artifacts.game), {});
  assert.deepEqual(groups(artifacts.timelock), {});
  assert.deepEqual(groups(artifacts.proxyAdmin), {});
  assert.deepEqual(groups(artifacts.splitter), { token: 3, timelock: 2 });
  assert.deepEqual(groups(artifacts.registry), { owner: 2 });
  assert.deepEqual(groups(artifacts.proxy), { _admin: 1 });
});

test("EIP-1967 address slots require the complete padded word", () => {
  const expected = "0x00000000000000000000000000000000000000a1";
  const correct = `0x${expected.slice(2).padStart(64, "0")}`;
  assert.doesNotThrow(() =>
    assertAddressStorageWord(correct, expected, "admin slot"),
  );
  assert.throws(
    () =>
      assertAddressStorageWord(
        `0x01${correct.slice(4)}`,
        expected,
        "admin slot",
      ),
    /admin slot/,
  );
  assert.throws(
    () => assertAddressStorageWord("0x00", expected, "implementation slot"),
    /malformed/,
  );
});

const run = (args, env = {}) =>
  execFileSync("node", args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

test("World Chain runner defaults to a deterministic redacted dry-run manifest", () => {
  const manifest = JSON.parse(run(["scripts/deploy-worldchain-testnet.mjs"]));
  assert.equal(manifest.mode, "DRY_RUN");
  assert.equal(manifest.chainId, 4801);
  assert.deepEqual(manifest.deploymentOrder, [
    "implementation",
    "timelock",
    "splitter",
    "proxy",
    "registry",
  ]);
  assert.equal(manifest.transactions.length, 0);
  assert.match(manifest.protectedKeyReferenceDigest, /^0x[0-9a-f]{64}$/);
  assert.equal(
    JSON.stringify(manifest).includes("kms://"),
    false,
    "manifest must not reveal protected-key references",
  );
});

test("World Chain runner permits OpenZeppelin's open executor sentinel only for executors", async () => {
  const plan = JSON.parse(
    await readFile(
      "contracts/worldchain-proxy-release-plan.testnet.example.json",
      "utf8",
    ),
  );
  assert.deepEqual(plan.governance.executors, [
    "0x0000000000000000000000000000000000000000",
  ]);
  const directory = await mkdtemp(
    join(tmpdir(), "civilization-open-executor-"),
  );
  const planFile = join(directory, "plan.json");
  const zero = "0x0000000000000000000000000000000000000000";
  const invalidAddresses = [
    [
      "deployer",
      (candidate) => {
        candidate.deployer = zero;
      },
    ],
    [
      "timelock admin",
      (candidate) => {
        candidate.governance.timelockAdmin = zero;
      },
    ],
    [
      "proposer",
      (candidate) => {
        candidate.governance.proposers[0] = zero;
      },
    ],
    [
      "World verifier",
      (candidate) => {
        candidate.world.verifier = zero;
      },
    ],
    [
      "World legacy router",
      (candidate) => {
        candidate.world.legacyRouter = zero;
      },
    ],
    [
      "World token",
      (candidate) => {
        candidate.world.token = zero;
      },
    ],
    [
      "first revenue recipient",
      (candidate) => {
        candidate.revenueDistribution.recipients[0] = zero;
      },
    ],
    [
      "second revenue recipient",
      (candidate) => {
        candidate.revenueDistribution.recipients[1] = zero;
      },
    ],
  ];
  try {
    for (const [name, mutate] of invalidAddresses) {
      const candidate = structuredClone(plan);
      mutate(candidate);
      await writeFile(planFile, JSON.stringify(candidate));
      assert.throws(
        () =>
          run(["scripts/deploy-worldchain-testnet.mjs"], {
            CIVILIZATION_PROXY_PLAN_FILE: planFile,
          }),
        (error) => /must be an explicit non-zero address/.test(error.stderr),
        `${name} must reject the zero address`,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("World Chain runner rejects --send before it can contact an RPC", () => {
  assert.throws(
    () => run(["scripts/deploy-worldchain-testnet.mjs", "--send"]),
    /--send requires exact CONFIRM_TESTNET_DEPLOY=yes/,
  );
});

test("runtime bytecode polling tolerates temporary empty RPC responses", async () => {
  const runtime = "0x6001600055";
  const responses = ["0x", "0x", runtime];
  const intervals = [];
  const code = await waitForRuntimeBytecode({
    getCode: async () => responses.shift(),
    address: "0x0000000000000000000000000000000000000001",
    step: "implementation",
    attempts: 3,
    intervalMs: 7,
    sleep: async (milliseconds) => intervals.push(milliseconds),
  });
  assert.equal(code, runtime);
  assert.deepEqual(intervals, [7, 7]);
});

test("runtime bytecode polling fails after its bounded timeout", async () => {
  await assert.rejects(
    waitForRuntimeBytecode({
      getCode: async () => "0x",
      address: "0x0000000000000000000000000000000000000001",
      step: "implementation",
      attempts: 2,
      sleep: async () => {},
    }),
    /timed out after 2 checks/,
  );
});

test("default send nonce guard rejects drift before any send", () => {
  assert.throws(
    () =>
      assertDeploymentNonce({
        onChainNonce: 11n,
        plannedNonce: 10n,
        resuming: false,
      }),
    /nonce 11 does not match reviewed nonce 10; no transaction submitted/,
  );
});

const recoveryFixture = () => {
  const runtime = "0x6001600055";
  const steps = ["implementation", "timelock", "splitter"];
  const addresses = Object.fromEntries(
    steps.map((step, index) => [
      step,
      `0x${String(index + 1).padStart(40, "0")}`,
    ]),
  );
  return {
    runtime,
    steps,
    addresses,
    expectedRuntimeCodehashes: Object.fromEntries(
      steps.map((step) => [step, keccak256(runtime)]),
    ),
    expectedRuntimeCodes: Object.fromEntries(
      steps.map((step) => [step, runtime]),
    ),
  };
};

test("resume accepts exactly one verified implementation and never re-sends it", async () => {
  const fixture = recoveryFixture();
  const recovered = await recoverDeploymentPrefix({
    ...fixture,
    onChainNonce: 11n,
    plannedNonce: 10n,
    getCode: async ({ address }) =>
      address === fixture.addresses.implementation ? fixture.runtime : "0x",
  });
  assert.deepEqual(recovered, [
    {
      step: "implementation",
      address: fixture.addresses.implementation,
      runtimeCodehash: keccak256(fixture.runtime),
      recovered: true,
    },
  ]);
  assert.equal(isRecoveredStep(recovered, "implementation"), true);
  assert.equal(isRecoveredStep(recovered, "timelock"), false);
});

test("resume accepts only the materialized immutable value and rejects a consistent wrong one", async () => {
  const runtime = "0x60aabbccdd0055";
  const address = "0x0000000000000000000000000000000000000001";
  const recovered = await recoverDeploymentPrefix({
    onChainNonce: 11n,
    plannedNonce: 10n,
    steps: ["splitter"],
    addresses: { splitter: address },
    expectedRuntimeCodehashes: { splitter: keccak256(runtime) },
    expectedRuntimeCodes: { splitter: runtime },
    getCode: async () => runtime,
  });
  assert.equal(recovered[0].runtimeCodehash, keccak256(runtime));
  await assert.rejects(
    recoverDeploymentPrefix({
      onChainNonce: 11n,
      plannedNonce: 10n,
      steps: ["splitter"],
      addresses: { splitter: address },
      expectedRuntimeCodehashes: { splitter: keccak256(runtime) },
      expectedRuntimeCodes: { splitter: runtime },
      getCode: async () => "0x60112233440055",
    }),
    /runtime bytecode mismatch for splitter/,
  );
});

test("resume rejects a single differing immutable occurrence and a non-reference byte", async () => {
  const address = "0x0000000000000000000000000000000000000001";
  const expectedRuntime = "0x60aabbaabb0055";
  const options = {
    onChainNonce: 11n,
    plannedNonce: 10n,
    steps: ["splitter"],
    addresses: { splitter: address },
    expectedRuntimeCodehashes: { splitter: keccak256(expectedRuntime) },
    expectedRuntimeCodes: { splitter: expectedRuntime },
  };
  for (const runtime of ["0x60aabbccdd0055", "0x61aabbaabb0055"]) {
    await assert.rejects(
      recoverDeploymentPrefix({ ...options, getCode: async () => runtime }),
      /runtime bytecode mismatch for splitter/,
    );
  }
});

test("resume rejects a wrong recovered codehash and a later-address gap", async () => {
  const fixture = recoveryFixture();
  await assert.rejects(
    recoverDeploymentPrefix({
      ...fixture,
      onChainNonce: 11n,
      plannedNonce: 10n,
      getCode: async () => "0x6002600055",
    }),
    /runtime bytecode mismatch for implementation/,
  );
  await assert.rejects(
    recoverDeploymentPrefix({
      ...fixture,
      onChainNonce: 11n,
      plannedNonce: 10n,
      getCode: async ({ address }) =>
        address === fixture.addresses.timelock ? fixture.runtime : "0x",
    }),
    /resume gap: consumed implementation nonce has no runtime bytecode/,
  );
  await assert.rejects(
    recoverDeploymentPrefix({
      ...fixture,
      onChainNonce: 11n,
      plannedNonce: 10n,
      getCode: async () => fixture.runtime,
    }),
    /resume gap\/drift: later timelock address/,
  );
});

test("resume fails closed when a recovered runtime artifact is absent", async () => {
  const fixture = recoveryFixture();
  delete fixture.expectedRuntimeCodes.implementation;
  await assert.rejects(
    recoverDeploymentPrefix({
      ...fixture,
      onChainNonce: 11n,
      plannedNonce: 10n,
      getCode: async ({ address }) =>
        address === fixture.addresses.implementation ? fixture.runtime : "0x",
    }),
    /expected runtime bytecode is absent for recovered implementation/,
  );
});

test("runner source keeps receipt, EIP-1967, ordering, and post-verification guards", async () => {
  const source = await readFile("scripts/worldchain-proxy-runner.mjs", "utf8");
  assert.match(source, /assertRegistryRecord\(release, \{/);
  assert.doesNotMatch(
    source,
    /release\s*\[\s*\d+\s*\]/,
    "registry verification must not depend on positional release tuple fields",
  );
  const deploymentStep = (name) => new RegExp(`await send\\(\\s*"${name}"`);
  for (const required of [
    "waitForTransactionReceipt",
    "EIP1967_ADMIN_SLOT",
    "ProxyAdmin owner",
    "post-deploy verification failed",
    "executorAddress",
    "loadProtectedDeployerAccount",
    "CIVILIZATION_DEPLOYER_KEY_REF",
    "WORLDCHAIN_MAINNET_KEY_FILE",
    "privateKeyToAccount",
    "protected deployer key does not match reviewed plan address",
    "const onChainNonce = BigInt(onChainNonceRaw)",
    "evm.deployedBytecode.immutableReferences",
    "materializeRuntimeBytecode",
    "EIP1967_IMPLEMENTATION_SLOT",
    "assertProxyAdminImmutableReferences",
    "expectedProxyAdmin",
    "ProxyAdmin.sol",
  ])
    assert.match(
      source,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  assert.doesNotMatch(source, /createWalletClient\(\{ account: p\.deployer/);
  assert.match(
    source,
    /prestigeMultiplierBps/,
    "post-deploy verification must use the compiled prestige multiplier getter",
  );
  assert.doesNotMatch(
    source,
    /productionMultiplierForPrestige/,
    "post-deploy verification must not use the obsolete prestige multiplier getter",
  );
  const implementation = source.search(deploymentStep("implementation"));
  const timelock = source.search(deploymentStep("timelock"));
  const splitter = source.search(deploymentStep("splitter"));
  const proxy = source.search(deploymentStep("proxy"));
  const registry = source.search(deploymentStep("registry"));
  assert.ok(
    implementation >= 0 &&
      timelock >= 0 &&
      splitter >= 0 &&
      proxy >= 0 &&
      registry >= 0,
  );
  assert.ok(implementation < timelock);
  assert.ok(timelock < splitter);
  assert.ok(splitter < proxy);
  assert.ok(proxy < registry);
  assert.ok(
    source.lastIndexOf("assertProxyAdminImmutableReferences({") > proxy &&
      source.lastIndexOf("assertProxyAdminImmutableReferences({") < registry,
    "the expected ProxyAdmin binding must complete before registry deployment",
  );
  const proxyAdminVerification = source.slice(
    source.indexOf("const proxyAdminCodeBeforeRegistry"),
    source.indexOf('await send(\n    "registry"'),
  );
  assert.match(
    proxyAdminVerification,
    /same\(\s*proxyAdminCodeBeforeRegistry,\s*expectedRuntimeCodes\.proxyAdmin/,
    "the ProxyAdmin child must use an exact runtime comparison",
  );
  assert.doesNotMatch(
    proxyAdminVerification,
    /normalizeRuntimeBytecode|normalizedRuntimeCodehash/,
    "ProxyAdmin verification must not normalize future immutable references",
  );
});

test("runner uses same-run compiler artifacts instead of drift-prone manual ABIs", async () => {
  const source = await readFile("scripts/worldchain-proxy-runner.mjs", "utf8");
  for (const name of [
    "gameAbi",
    "splitterAbi",
    "registryAbi",
    "ownableAbi",
    "timelockAbi",
  ])
    assert.doesNotMatch(source, new RegExp(`const ${name}\\s*=`));
  assert.match(source, /encodeInitializeData\(artifacts\.game, initConfig\)/);
  assert.match(
    source,
    /const artifacts = await compileWorldchainArtifacts\(\);\s+assertCompilerAbiPreflight\(artifacts\);/,
    "the compiler ABI preflight must run immediately after compilation",
  );
  assert.match(source, /abi: gameArtifact\.abi/);
  for (const artifact of [
    "game",
    "splitter",
    "registry",
    "timelock",
    "proxyAdmin",
  ])
    assert.match(source, new RegExp(`artifacts\\.${artifact}\\.abi`));
  assert.doesNotMatch(
    source,
    /read\(addresses\.proxy, artifacts\.game\.abi, "worldIdIssuerSchemaId"/,
    "the private issuer schema field must not be read through an obsolete getter",
  );
});
