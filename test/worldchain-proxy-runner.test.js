import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const run = (args, env = {}) => execFileSync("node", args, {
  cwd: process.cwd(), env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
});

test("World Chain runner defaults to a deterministic redacted dry-run manifest", () => {
  const manifest = JSON.parse(run(["scripts/deploy-worldchain-testnet.mjs"]));
  assert.equal(manifest.mode, "DRY_RUN");
  assert.equal(manifest.chainId, 4801);
  assert.deepEqual(manifest.deploymentOrder, ["implementation", "timelock", "splitter", "proxy", "registry"]);
  assert.equal(manifest.transactions.length, 0);
  assert.match(manifest.protectedKeyReferenceDigest, /^0x[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(manifest).includes("kms://"), false, "manifest must not reveal protected-key references");
});

test("World Chain runner permits OpenZeppelin's open executor sentinel only for executors", async () => {
  const plan = JSON.parse(await readFile("contracts/worldchain-proxy-release-plan.testnet.example.json", "utf8"));
  assert.deepEqual(plan.governance.executors, ["0x0000000000000000000000000000000000000000"]);
  const directory = await mkdtemp(join(tmpdir(), "civilization-open-executor-"));
  const planFile = join(directory, "plan.json");
  const zero = "0x0000000000000000000000000000000000000000";
  const invalidAddresses = [
    ["deployer", candidate => { candidate.deployer = zero; }],
    ["timelock admin", candidate => { candidate.governance.timelockAdmin = zero; }],
    ["proposer", candidate => { candidate.governance.proposers[0] = zero; }],
    ["World verifier", candidate => { candidate.world.verifier = zero; }],
    ["World legacy router", candidate => { candidate.world.legacyRouter = zero; }],
    ["World token", candidate => { candidate.world.token = zero; }],
    ["first revenue recipient", candidate => { candidate.revenueDistribution.recipients[0] = zero; }],
    ["second revenue recipient", candidate => { candidate.revenueDistribution.recipients[1] = zero; }],
  ];
  try {
    for (const [name, mutate] of invalidAddresses) {
      const candidate = structuredClone(plan);
      mutate(candidate);
      await writeFile(planFile, JSON.stringify(candidate));
      assert.throws(
        () => run(["scripts/deploy-worldchain-testnet.mjs"], { CIVILIZATION_PROXY_PLAN_FILE: planFile }),
        error => /must be an explicit non-zero address/.test(error.stderr),
        `${name} must reject the zero address`,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("World Chain runner rejects --send before it can contact an RPC", () => {
  assert.throws(() => run(["scripts/deploy-worldchain-testnet.mjs", "--send"]), /--send requires exact CONFIRM_TESTNET_DEPLOY=yes/);
});

test("runner source keeps receipt, EIP-1967, ordering, and post-verification guards", async () => {
  const source = await readFile("scripts/worldchain-proxy-runner.mjs", "utf8");
  for (const required of ["waitForTransactionReceipt", "EIP1967_ADMIN_SLOT", "ProxyAdmin owner", "post-deploy verification failed", "executorAddress", "await send(\"implementation\"", "await send(\"timelock\"", "await send(\"splitter\"", "await send(\"proxy\"", "await send(\"registry\""]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(source.indexOf('await send("implementation"') < source.indexOf('await send("timelock"'));
  assert.ok(source.indexOf('await send("timelock"') < source.indexOf('await send("splitter"'));
  assert.ok(source.indexOf('await send("splitter"') < source.indexOf('await send("proxy"'));
  assert.ok(source.indexOf('await send("proxy"') < source.indexOf('await send("registry"'));
});
