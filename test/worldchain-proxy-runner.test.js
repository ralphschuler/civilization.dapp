import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { keccak256 } from "viem";
import {
  assertProxyAdminImmutableReferences,
  assertDeploymentNonce,
  isRecoveredStep,
  normalizeRuntimeBytecode,
  normalizedRuntimeCodehash,
  recoverDeploymentPrefix,
  waitForRuntimeBytecode,
} from "../scripts/worldchain-proxy-runner.mjs";

const immutableArtifact = (
  immutableReferences = { 42: [{ start: 1, length: 4 }] },
) => ({
  evm: {
    deployedBytecode: {
      // The four middle bytes stand in for compiler-declared immutable values.
      object: "60000000000055",
      immutableReferences,
    },
  },
});

test("runtime validation normalizes only compiler-declared immutable ranges", () => {
  const artifact = immutableArtifact();
  const compiled = "0x60000000000055";
  const immutableOnlyChange = "0x60aabbccdd0055";

  assert.equal(
    normalizeRuntimeBytecode({
      artifact,
      runtimeCode: immutableOnlyChange,
      step: "splitter",
    }),
    compiled,
  );
  assert.equal(
    normalizedRuntimeCodehash({
      artifact,
      runtimeCode: immutableOnlyChange,
      step: "splitter",
    }),
    keccak256(compiled),
  );
  assert.notEqual(
    normalizedRuntimeCodehash({
      artifact,
      runtimeCode: "0x60aabbccddff55",
      step: "splitter",
    }),
    keccak256(compiled),
    "a change outside an immutable range must remain visible",
  );
});

test("runtime validation fails closed for malformed bytecode lengths and immutable ranges", () => {
  assert.throws(
    () =>
      normalizeRuntimeBytecode({
        artifact: immutableArtifact(),
        runtimeCode: "0x600000000055",
        step: "splitter",
      }),
    /length does not match the compiled artifact/,
  );
  assert.throws(
    () =>
      normalizeRuntimeBytecode({
        artifact: immutableArtifact({ 42: [{ start: 6, length: 2 }] }),
        runtimeCode: "0x60000000000055",
        step: "splitter",
      }),
    /invalid range/,
  );
  assert.throws(
    () =>
      normalizeRuntimeBytecode({
        artifact: immutableArtifact({
          42: [
            { start: 1, length: 2 },
            { start: 2, length: 2 },
          ],
        }),
        runtimeCode: "0x60000000000055",
        step: "splitter",
      }),
    /overlapping ranges/,
  );
  assert.throws(
    () =>
      normalizeRuntimeBytecode({
        artifact: immutableArtifact({ 42: [] }),
        runtimeCode: "0x60000000000055",
        step: "splitter",
      }),
    /splitter compiler immutableReferences contain an empty group/,
  );
});

test("runtime validation rejects divergence within one immutable-reference group", () => {
  const artifact = immutableArtifact({
    42: [
      { start: 1, length: 2 },
      { start: 3, length: 2 },
    ],
  });
  assert.throws(
    () =>
      normalizeRuntimeBytecode({
        artifact,
        runtimeCode: "0x60aabbccdd0055",
        step: "splitter",
      }),
    /immutableReferences group contains differing values/,
  );
});

const proxyImmutableArtifact = () => ({
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
  const runtimeArtifact = {
    evm: {
      deployedBytecode: { object: runtime.slice(2), immutableReferences: {} },
    },
  };
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
    runtimeArtifacts: Object.fromEntries(
      steps.map((step) => [step, runtimeArtifact]),
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

test("resume accepts declared immutable changes but records the real on-chain codehash", async () => {
  const runtime = "0x60aabbccdd0055";
  const artifact = immutableArtifact();
  const address = "0x0000000000000000000000000000000000000001";
  const recovered = await recoverDeploymentPrefix({
    onChainNonce: 11n,
    plannedNonce: 10n,
    steps: ["splitter"],
    addresses: { splitter: address },
    expectedRuntimeCodehashes: { splitter: keccak256("0x60000000000055") },
    runtimeArtifacts: { splitter: artifact },
    getCode: async () => runtime,
  });
  assert.equal(recovered[0].runtimeCodehash, keccak256(runtime));
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
    /resume codehash mismatch for implementation/,
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
  delete fixture.runtimeArtifacts.implementation;
  await assert.rejects(
    recoverDeploymentPrefix({
      ...fixture,
      onChainNonce: 11n,
      plannedNonce: 10n,
      getCode: async ({ address }) =>
        address === fixture.addresses.implementation ? fixture.runtime : "0x",
    }),
    /runtime artifact is absent for recovered implementation/,
  );
});

test("runner source keeps receipt, EIP-1967, ordering, and post-verification guards", async () => {
  const source = await readFile("scripts/worldchain-proxy-runner.mjs", "utf8");
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
    "normalizedRuntimeCodehash",
    "assertProxyAdminImmutableReferences",
    "expectedProxyAdmin",
    "ProxyAdmin.sol",
  ])
    assert.match(
      source,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  assert.doesNotMatch(source, /createWalletClient\(\{ account: p\.deployer/);
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
    /keccak256\(proxyAdminCodeBeforeRegistry\)[\s\S]*runtimeHash\(artifacts\.proxyAdmin\)/,
    "the ProxyAdmin child must use an exact codehash comparison",
  );
  assert.doesNotMatch(
    proxyAdminVerification,
    /normalizedRuntimeCodehash/,
    "ProxyAdmin verification must not normalize future immutable references",
  );
});
