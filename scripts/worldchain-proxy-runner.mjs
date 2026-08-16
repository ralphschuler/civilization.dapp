import { readFile, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  concatHex,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeDeployData,
  encodeFunctionData,
  getAddress,
  getContractAddress,
  http,
  isAddress,
  keccak256,
  stringToHex,
  toBytes,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import solc from "solc";

const require = createRequire(import.meta.url);
const ZERO_HASH = `0x${"00".repeat(32)}`;
export const DEPLOYMENT_STEPS = Object.freeze([
  "implementation",
  "timelock",
  "splitter",
  "proxy",
  "registry",
]);
export const RUNTIME_CODE_POLL_ATTEMPTS = 6;
export const RUNTIME_CODE_POLL_INTERVAL_MS = 1_000;
const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const FORMULA = Object.freeze({
  maxOfflineSeconds: 86_400,
  fractionScale: 864_000_000,
  woodPerHour: 300,
  clayPerHour: 270,
  stonePerHour: 240,
  goldPerHour: 12,
  prestigeBonusBps: 1_000,
});
const fail = (message) => {
  throw new Error(`World Chain deployment plan rejected: ${message}`);
};
const address = (value, name) => {
  if (
    typeof value !== "string" ||
    /placeholder|replace|example/i.test(value) ||
    !isAddress(value) ||
    /^0x0{40}$/i.test(value)
  )
    fail(`${name} must be an explicit non-zero address`);
  return getAddress(value);
};
// OpenZeppelin TimelockController treats EXECUTOR_ROLE granted to address(0) as
// permissionless execution. This exception is intentionally limited to the
// executor role list; every other reviewed address remains non-zero.
const executorAddress = (value, name) => {
  if (
    typeof value !== "string" ||
    /placeholder|replace|example/i.test(value) ||
    !isAddress(value)
  )
    fail(`${name} must be an explicit address`);
  return getAddress(value);
};
const text = (value, name) => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    /placeholder|replace|example/i.test(value)
  )
    fail(`${name} must be explicit and non-placeholder`);
  return value;
};
const uint = (value, name) => {
  if (value === undefined || value === null || !/^\d+$/.test(String(value)))
    fail(`${name} must be a non-negative integer`);
  return BigInt(value);
};
const hash = (value, name) => {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-f]{64}$/i.test(value) ||
    value.toLowerCase() === ZERO_HASH
  )
    fail(`${name} must be an exact non-zero bytes32`);
  return value.toLowerCase();
};
const same = (actual, expected, name) => {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase())
    throw new Error(`post-deploy verification failed: ${name}`);
};
const REGISTRY_RECORD_FIELDS = Object.freeze([
  "proxy",
  "version",
  "implementation",
  "implementationCodehash",
  "sourceCommit",
  "storageLayoutHash",
]);
const json = (value) =>
  JSON.stringify(value, (_, item) =>
    typeof item === "bigint" ? item.toString() : item,
  );

const GAME_STORAGE_PREFIX_FIELDS = Object.freeze([
  "uint256 totalSupply",
  "mapping(address => uint256) balanceOf",
  "mapping(address => mapping(address => uint256)) allowance",
  "IWorldIDVerifier worldIdVerifier",
  "uint256 worldIdAction",
  "uint64 worldIdRpId",
  "uint64 worldIdIssuerSchemaId",
  "uint256 worldIdCredentialGenesisIssuedAtMin",
]);
const UINT64_MAX = (1n << 64n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;

const REQUIRED_COMPILER_ABI_FUNCTIONS = Object.freeze({
  game: Object.freeze([
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
  splitter: Object.freeze([
    "token",
    "timelock",
    "recipients",
    "PAYOUT_PERIOD",
    "sharesBps",
  ]),
  registry: Object.freeze(["owner", "releaseCount", "releaseAt"]),
  timelock: Object.freeze(["hasRole"]),
  proxyAdmin: Object.freeze(["owner"]),
});

export function assertWorldIdPlanBounds({
  rpId,
  issuerSchemaId,
  credentialGenesisIssuedAtMin,
}) {
  const boundedUint = (value, name, maximum, bits) => {
    const parsed = uint(value, name);
    if (parsed > maximum) fail(`${name} must fit in uint${bits}`);
    return parsed;
  };
  return {
    rpId: boundedUint(rpId, "world.rpId", UINT64_MAX, 64),
    issuerSchemaId: boundedUint(
      issuerSchemaId,
      "world.issuerSchemaId",
      UINT64_MAX,
      64,
    ),
    credentialGenesisIssuedAtMin: boundedUint(
      credentialGenesisIssuedAtMin,
      "world.credentialGenesisIssuedAtMin",
      UINT256_MAX,
      256,
    ),
  };
}

const storageWord = (value, name) => {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value))
    throw new Error(
      `post-deploy verification failed: ${name} is missing or malformed`,
    );
  return BigInt(value);
};

/**
 * Read the private V1 World ID fields directly from the frozen GameStorage
 * layout. The explicit ordering check prevents a later snapshot from silently
 * changing the meaning of these offsets.
 */
export async function readWorldIdStorageSnapshot({
  snapshot,
  address,
  getStorageAt,
}) {
  const fields = snapshot?.structs?.GameStorage;
  if (
    !Array.isArray(fields) ||
    fields.length < 8 ||
    fields
      .slice(0, GAME_STORAGE_PREFIX_FIELDS.length)
      .some((field, index) => field !== GAME_STORAGE_PREFIX_FIELDS[index])
  )
    throw new Error(
      "post-deploy verification failed: frozen GameStorage World ID field ordering",
    );
  if (
    typeof snapshot.slot !== "string" ||
    !/^0x[0-9a-f]{64}$/i.test(snapshot.slot)
  )
    throw new Error(
      "post-deploy verification failed: frozen GameStorage slot is malformed",
    );
  if (typeof getStorageAt !== "function")
    throw new Error(
      "post-deploy verification failed: storage reader is missing",
    );

  const slot = BigInt(snapshot.slot);
  const [packedWorldId, credentialGenesisIssuedAtMin] = await Promise.all([
    getStorageAt({ address, slot: toHex(slot + 5n, { size: 32 }) }),
    getStorageAt({ address, slot: toHex(slot + 6n, { size: 32 }) }),
  ]);
  const packed = storageWord(packedWorldId, "World ID RP/schema storage");
  if (packed >> 128n !== 0n)
    throw new Error(
      "post-deploy verification failed: World ID RP/schema storage has dirty upper bits",
    );
  return {
    rpId: packed & UINT64_MAX,
    issuerSchemaId: (packed >> 64n) & UINT64_MAX,
    credentialGenesisIssuedAtMin: storageWord(
      credentialGenesisIssuedAtMin,
      "World ID credential genesis storage",
    ),
  };
}

export const encodeInitializeData = (gameArtifact, initConfig) =>
  encodeFunctionData({
    abi: gameArtifact.abi,
    functionName: "initialize",
    args: [initConfig],
  });

/**
 * Fail before any account, nonce, or transaction work if compiler output lacks
 * a function entry needed for initialization or post-deployment verification.
 */
export function assertCompilerAbiPreflight(artifacts) {
  for (const [artifactName, functionNames] of Object.entries(
    REQUIRED_COMPILER_ABI_FUNCTIONS,
  )) {
    const abi = artifacts?.[artifactName]?.abi;
    if (!Array.isArray(abi))
      throw new Error(
        `compiler ABI preflight failed: ${artifactName} ABI is missing or malformed`,
      );
    for (const functionName of functionNames) {
      if (
        !abi.some(
          (entry) => entry?.type === "function" && entry.name === functionName,
        )
      )
        throw new Error(
          `compiler ABI preflight failed: ${artifactName}.${functionName} function entry is missing`,
        );
    }
  }
}

/**
 * Verify the compiler ABI's named Release record without accepting tuple
 * positions. A malformed decoder result must fail closed before a resume can
 * be reported as successfully verified.
 */
export function assertRegistryRecord(record, expected) {
  if (!record || typeof record !== "object" || Array.isArray(record))
    throw new Error(
      "post-deploy verification failed: registry record must be a named object",
    );
  for (const field of REGISTRY_RECORD_FIELDS) {
    if (!Object.hasOwn(record, field))
      throw new Error(
        `post-deploy verification failed: registry record ${field} is missing`,
      );
    same(record[field], expected[field], `registry record ${field}`);
  }
}

const hasRuntimeCode = (code) => typeof code === "string" && code !== "0x";
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const runtimeBytecode = (value, name) => {
  if (typeof value !== "string" || !/^0x(?:[0-9a-f]{2})*$/i.test(value))
    throw new Error(`${name} must be even-length hexadecimal runtime bytecode`);
  return value.toLowerCase();
};

/**
 * Return compiler-declared immutable-reference groups, rejecting malformed
 * compiler metadata rather than risking a comparison that masks arbitrary
 * bytecode. Solidity uses one group for each immutable: every occurrence in a
 * group must carry the same value in deployed code.
 */
const immutableRuntimeGroups = (artifact, compiledRuntimeCode, step) => {
  const references = artifact?.evm?.deployedBytecode?.immutableReferences;
  if (
    !references ||
    typeof references !== "object" ||
    Array.isArray(references)
  )
    throw new Error(`${step} compiler immutableReferences are malformed`);
  const runtimeLength = (compiledRuntimeCode.length - 2) / 2;
  const groups = [];
  const ranges = [];
  const names = artifact?.immutableReferenceNames;
  if (!names || typeof names !== "object" || Array.isArray(names))
    throw new Error(`${step} compiler immutable AST names are malformed`);
  const referenceIds = Object.keys(references);
  if (
    Object.keys(names).length !== referenceIds.length ||
    referenceIds.some((id) => typeof names[id] !== "string" || !names[id])
  )
    throw new Error(
      `${step} compiler immutable AST names do not match references`,
    );
  for (const [id, offsets] of Object.entries(references)) {
    if (!Array.isArray(offsets))
      throw new Error(`${step} compiler immutableReferences are malformed`);
    const group = [];
    for (const range of offsets) {
      if (
        !range ||
        !Number.isSafeInteger(range.start) ||
        !Number.isSafeInteger(range.length) ||
        range.start < 0 ||
        range.length < 1 ||
        range.start + range.length > runtimeLength
      )
        throw new Error(
          `${step} compiler immutableReferences contain an invalid range`,
        );
      group.push(range);
      ranges.push(range);
    }
    if (group.length === 0)
      throw new Error(
        `${step} compiler immutableReferences contain an empty group`,
      );
    if (group.some((range) => range.length !== group[0]?.length))
      throw new Error(
        `${step} compiler immutableReferences group contains differing lengths`,
      );
    groups.push({ id, name: names[id], ranges: group });
  }
  ranges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < ranges.length; index += 1) {
    if (
      ranges[index - 1].start + ranges[index - 1].length >
      ranges[index].start
    )
      throw new Error(
        `${step} compiler immutableReferences contain overlapping ranges`,
      );
  }
  return groups;
};

const immutableRangeValue = (runtimeCode, { start, length }) =>
  runtimeCode.slice(2 + start * 2, 2 + (start + length) * 2);

/**
 * TransparentUpgradeableProxy creates its ProxyAdmin as its first child
 * creation. Its single immutable is the child address, repeated in runtime.
 */
export function assertProxyAdminImmutableReferences({
  artifact,
  runtimeCode,
  expectedProxyAdmin,
}) {
  const compiledRuntimeCode = runtimeBytecode(
    `0x${artifact?.evm?.deployedBytecode?.object ?? ""}`,
    "proxy compiled runtime bytecode",
  );
  const actualRuntimeCode = runtimeBytecode(
    runtimeCode,
    "proxy runtime bytecode",
  );
  if (actualRuntimeCode.length !== compiledRuntimeCode.length)
    throw new Error(
      "proxy runtime bytecode length does not match the compiled artifact",
    );
  const groups = immutableRuntimeGroups(artifact, compiledRuntimeCode, "proxy");
  if (
    groups.length !== 1 ||
    groups[0].name !== "_admin" ||
    groups[0].ranges.length === 0
  )
    throw new Error(
      "proxy compiler immutableReferences must contain exactly one nonempty group",
    );
  const expected = getAddress(expectedProxyAdmin)
    .slice(2)
    .padStart(64, "0")
    .toLowerCase();
  for (const range of groups[0].ranges) {
    if (
      range.length !== 32 ||
      immutableRangeValue(actualRuntimeCode, range) !== expected
    )
      throw new Error(
        "post-deploy verification failed: proxy immutable ProxyAdmin reference",
      );
  }
}

/** Resolve compiler immutable-reference IDs through source ASTs, never IDs. */
export function resolveImmutableReferenceNames({ artifact, sourceAsts, step }) {
  const references = artifact?.evm?.deployedBytecode?.immutableReferences;
  if (
    !references ||
    typeof references !== "object" ||
    Array.isArray(references)
  )
    throw new Error(`${step} compiler immutableReferences are malformed`);
  const declarations = new Map();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.nodeType === "VariableDeclaration" && Number.isInteger(node.id)) {
      const existing = declarations.get(String(node.id)) ?? [];
      existing.push(node);
      declarations.set(String(node.id), existing);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  if (!sourceAsts || typeof sourceAsts !== "object")
    throw new Error(`${step} compiler source ASTs are malformed`);
  Object.values(sourceAsts).forEach((source) => visit(source?.ast ?? source));
  return Object.fromEntries(
    Object.keys(references).map((id) => {
      const matches = declarations.get(id) ?? [];
      if (matches.length !== 1)
        throw new Error(
          `${step} immutable reference ${id} has ambiguous AST declaration`,
        );
      const declaration = matches[0];
      if (
        declaration.mutability !== "immutable" ||
        typeof declaration.name !== "string" ||
        !declaration.name
      )
        throw new Error(
          `${step} immutable reference ${id} is not a named immutable VariableDeclaration`,
        );
      return [id, declaration.name];
    }),
  );
}

/**
 * Materialize compiler runtime bytecode using precisely the reviewed immutable
 * values. This intentionally does not inspect on-chain code: callers compare
 * that code byte-for-byte with this expected result.
 */
export function materializeRuntimeBytecode({
  artifact,
  expectedImmutables,
  step,
}) {
  const compiledRuntimeCode = runtimeBytecode(
    `0x${artifact?.evm?.deployedBytecode?.object ?? ""}`,
    `${step} compiled runtime bytecode`,
  );
  const groups = immutableRuntimeGroups(artifact, compiledRuntimeCode, step);
  if (
    !expectedImmutables ||
    typeof expectedImmutables !== "object" ||
    Array.isArray(expectedImmutables)
  )
    throw new Error(`${step} expected immutables are malformed`);
  const expectedNames = groups.map(({ name }) => name).sort();
  if (new Set(expectedNames).size !== expectedNames.length)
    throw new Error(`${step} compiler immutable AST names are ambiguous`);
  const suppliedNames = Object.keys(expectedImmutables).sort();
  if (expectedNames.join("\0") !== suppliedNames.join("\0"))
    throw new Error(
      `${step} expected immutable names do not exactly match compiler references`,
    );
  let materialized = compiledRuntimeCode;
  for (const group of groups) {
    const expected = expectedImmutables[group.name];
    if (
      !/^[0-9a-f]*$/i.test(expected ?? "") ||
      expected.length !== group.ranges[0].length * 2
    )
      throw new Error(
        `${step} expected immutable ${group.name} has wrong hex width`,
      );
    for (const { start, length } of group.ranges) {
      const offset = 2 + start * 2;
      materialized =
        materialized.slice(0, offset) +
        expected.toLowerCase() +
        materialized.slice(offset + length * 2);
    }
  }
  return materialized;
}

export const materializedRuntimeCodehash = (input) =>
  keccak256(materializeRuntimeBytecode(input));

const assertExactRuntimeBytecode = ({
  actual,
  expected,
  step,
  address: address_,
}) => {
  const actualCode = runtimeBytecode(actual, `${step} runtime bytecode`);
  const expectedCode = runtimeBytecode(
    expected,
    `${step} expected runtime bytecode`,
  );
  if (actualCode !== expectedCode)
    throw new Error(
      `runtime bytecode mismatch for ${step} at ${address_}: expected ${keccak256(expectedCode)}, got ${keccak256(actualCode)}`,
    );
};

const addressWord = (value) =>
  getAddress(value).slice(2).padStart(64, "0").toLowerCase();
export const assertAddressStorageWord = (value, expected, name) => {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value))
    throw new Error(
      `post-deploy verification failed: ${name} is missing or malformed`,
    );
  same(value, `0x${addressWord(expected)}`, name);
};

/**
 * Some RPC replicas briefly report empty code immediately after a successful
 * creation receipt. Poll only a small, bounded number of times before failing.
 */
export async function waitForRuntimeBytecode({
  getCode,
  address: address_,
  step,
  attempts = RUNTIME_CODE_POLL_ATTEMPTS,
  intervalMs = RUNTIME_CODE_POLL_INTERVAL_MS,
  sleep = delay,
}) {
  if (!Number.isInteger(attempts) || attempts < 1)
    throw new Error(
      "runtime bytecode polling attempts must be a positive integer",
    );
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const code = await getCode({ address: address_ });
    if (hasRuntimeCode(code)) return code;
    if (attempt < attempts) await sleep(intervalMs);
  }
  throw new Error(
    `${step} has no runtime bytecode after successful receipt (timed out after ${attempts} checks)`,
  );
}

/**
 * A resume can consume only the exact nonce-derived prefix. Each consumed
 * address must contain the reviewed runtime, and every later planned address
 * must still be empty so an unrelated nonce or a deployment gap cannot pass.
 */
export async function recoverDeploymentPrefix({
  onChainNonce,
  plannedNonce,
  addresses,
  expectedRuntimeCodehashes,
  expectedRuntimeCodes,
  getCode,
  steps = DEPLOYMENT_STEPS,
}) {
  const recoveredCount = BigInt(onChainNonce) - BigInt(plannedNonce);
  if (recoveredCount < 1n || recoveredCount > BigInt(steps.length))
    throw new Error(
      `resume nonce drift: current nonce ${onChainNonce} does not describe a recoverable prefix after reviewed nonce ${plannedNonce}`,
    );
  const prefixLength = Number(recoveredCount);
  const recovered = [];
  for (const [index, step] of steps.entries()) {
    const code = await getCode({ address: addresses[step] });
    if (index < prefixLength) {
      if (!hasRuntimeCode(code))
        throw new Error(
          `resume gap: consumed ${step} nonce has no runtime bytecode at ${addresses[step]}`,
        );
      const actualCodehash = keccak256(code);
      const expectedCodehash = expectedRuntimeCodehashes?.[step];
      const expectedRuntimeCode = expectedRuntimeCodes?.[step];
      if (!expectedRuntimeCode)
        throw new Error(
          `resume expected runtime bytecode is absent for recovered ${step}`,
        );
      assertExactRuntimeBytecode({
        actual: code,
        expected: expectedRuntimeCode,
        step,
        address: addresses[step],
      });
      if (
        !expectedCodehash ||
        expectedCodehash.toLowerCase() !==
          keccak256(expectedRuntimeCode).toLowerCase()
      )
        throw new Error(
          `resume expected runtime codehash is absent or inconsistent for ${step}`,
        );
      recovered.push({
        step,
        address: addresses[step],
        runtimeCodehash: actualCodehash,
        recovered: true,
      });
    } else if (hasRuntimeCode(code)) {
      throw new Error(
        `resume gap/drift: later ${step} address ${addresses[step]} already has runtime bytecode`,
      );
    }
  }
  return recovered;
}

export function assertDeploymentNonce({
  onChainNonce,
  plannedNonce,
  resuming,
}) {
  if (!resuming && BigInt(onChainNonce) !== BigInt(plannedNonce))
    throw new Error(
      `deployer nonce ${onChainNonce} does not match reviewed nonce ${plannedNonce}; no transaction submitted`,
    );
}

export const isRecoveredStep = (transactions, step) =>
  transactions.some(
    (transaction) =>
      transaction.step === step && transaction.recovered === true,
  );

async function loadProtectedDeployerAccount(
  network,
  environment,
  expectedAddress,
  expectedReference,
) {
  if (environment.CIVILIZATION_DEPLOYER_KEY_REF !== expectedReference)
    throw new Error(
      "--send requires CIVILIZATION_DEPLOYER_KEY_REF to exactly match the reviewed protectedKeyRef; raw private keys are never accepted",
    );
  const keyFile =
    environment[
      network === "mainnet"
        ? "WORLDCHAIN_MAINNET_KEY_FILE"
        : "WORLDCHAIN_TESTNET_KEY_FILE"
    ];
  if (!keyFile)
    throw new Error(
      "--send requires the protected World Chain key-file reference",
    );
  const info = await stat(keyFile);
  if ((info.mode & 0o077) !== 0)
    throw new Error(
      "protected World Chain key file must not be group/world-readable",
    );
  const parsed = JSON.parse(await readFile(keyFile, "utf8"));
  if (
    typeof parsed.receiverPrivateKey !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(parsed.receiverPrivateKey)
  )
    throw new Error("protected World Chain key file has no valid deployer key");
  const account = privateKeyToAccount(parsed.receiverPrivateKey);
  if (account.address.toLowerCase() !== expectedAddress.toLowerCase())
    throw new Error(
      "protected deployer key does not match reviewed plan address",
    );
  return account;
}

export async function compileWorldchainArtifacts() {
  const names = (
    await readdir(new URL("../contracts/src/", import.meta.url))
  ).filter((name) => name.endsWith(".sol"));
  const sources = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        `contracts/src/${name}`,
        {
          content: await readFile(
            new URL(`../contracts/src/${name}`, import.meta.url),
            "utf8",
          ),
        },
      ]),
    ),
  );
  sources["contracts/DeploymentImports.sol"] = {
    content:
      "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\nimport {TimelockController} from '@openzeppelin/contracts/governance/TimelockController.sol';\nimport {ProxyAdmin} from '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol';\nimport {TransparentUpgradeableProxy} from '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol';",
  };
  const result = JSON.parse(
    solc.compile(
      json({
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
                "evm.deployedBytecode.immutableReferences",
              ],
            },
          },
        },
      }),
      {
        import: (path) => {
          try {
            return {
              contents: require("node:fs").readFileSync(
                require.resolve(path),
                "utf8",
              ),
            };
          } catch {
            return { error: `unresolved Solidity/OZ import: ${path}` };
          }
        },
      },
    ),
  );
  const errors = (result.errors ?? []).filter(
    (entry) => entry.severity === "error",
  );
  if (errors.length)
    throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
  const artifact = (file, name) => {
    const found = result.contracts?.[file]?.[name];
    if (!found?.evm?.bytecode?.object)
      throw new Error(`compiler did not produce ${file}:${name}`);
    return {
      ...found,
      immutableReferenceNames: resolveImmutableReferenceNames({
        artifact: found,
        sourceAsts: result.sources,
        step: name,
      }),
    };
  };
  return {
    game: artifact("contracts/src/CivilizationGame.sol", "CivilizationGame"),
    splitter: artifact(
      "contracts/src/CivilizationRevenueSplitter.sol",
      "CivilizationRevenueSplitter",
    ),
    registry: artifact(
      "contracts/src/CivilizationReleaseRegistry.sol",
      "CivilizationReleaseRegistry",
    ),
    timelock: artifact(
      "@openzeppelin/contracts/governance/TimelockController.sol",
      "TimelockController",
    ),
    proxy: artifact(
      "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol",
      "TransparentUpgradeableProxy",
    ),
    proxyAdmin: artifact(
      "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
      "ProxyAdmin",
    ),
  };
}

async function loadPlan(network) {
  const planFile =
    process.env.CIVILIZATION_PROXY_PLAN_FILE ??
    new URL(
      `../contracts/worldchain-proxy-release-plan.${network}.example.json`,
      import.meta.url,
    );
  const plan = JSON.parse(await readFile(planFile, "utf8"));
  if (
    plan.network !== network ||
    Number(plan.chainId) !== (network === "mainnet" ? 480 : 4801)
  )
    fail("network and chainId must match this entry point");
  const governance = plan.governance;
  if (
    !governance ||
    !Array.isArray(governance.proposers) ||
    !Array.isArray(governance.executors) ||
    governance.proposers.length === 0 ||
    governance.executors.length === 0
  )
    fail("governance role model requires non-empty proposers and executors");
  const worldIdFields = assertWorldIdPlanBounds({
    rpId: plan.world?.rpId,
    issuerSchemaId: plan.world?.issuerSchemaId,
    credentialGenesisIssuedAtMin: plan.world?.credentialGenesisIssuedAtMin,
  });
  const normalized = {
    ...plan,
    deployer: address(plan.deployer, "deployer"),
    sourceCommit: hash(plan.sourceCommit, "sourceCommit"),
    protectedKeyRef: text(plan.protectedKeyRef, "protectedKeyRef"),
    deployerNonce: uint(plan.deployerNonce, "deployerNonce"),
    governance: {
      timelockAdmin: address(
        governance.timelockAdmin,
        "governance.timelockAdmin",
      ),
      proposers: governance.proposers.map((v, i) =>
        address(v, `governance.proposers[${i}]`),
      ),
      executors: governance.executors.map((v, i) =>
        executorAddress(v, `governance.executors[${i}]`),
      ),
      minDelaySeconds: uint(
        governance.minDelaySeconds,
        "governance.minDelaySeconds",
      ),
    },
    world: {
      verifier: address(plan.world?.verifier, "world.verifier"),
      actionId: text(plan.world?.actionId, "world.actionId"),
      rpId: worldIdFields.rpId,
      issuerSchemaId: worldIdFields.issuerSchemaId,
      credentialGenesisIssuedAtMin: worldIdFields.credentialGenesisIssuedAtMin,
      legacyRouter: address(plan.world?.legacyRouter, "world.legacyRouter"),
      legacyAppId: text(plan.world?.legacyAppId, "world.legacyAppId"),
      legacyActionId: text(plan.world?.legacyActionId, "world.legacyActionId"),
      token: address(plan.world?.token, "world.token"),
    },
  };
  if (normalized.world.rpId === 0n || normalized.world.issuerSchemaId === 0n)
    fail("World RP and issuer schema IDs must be non-zero");
  const distribution = plan.revenueDistribution;
  if (
    !distribution ||
    !Array.isArray(distribution.recipients) ||
    distribution.recipients.length !== 2 ||
    !Array.isArray(distribution.bps) ||
    distribution.bps.length !== 2 ||
    distribution.bps[0] !== 5000 ||
    distribution.bps[1] !== 5000
  )
    fail("revenueDistribution must be exactly two 50/50 recipients");
  normalized.revenueDistribution = {
    recipients: distribution.recipients.map((v, i) =>
      address(v, `revenueDistribution.recipients[${i}]`),
    ),
    bps: distribution.bps.map((v, i) => {
      if (!Number.isInteger(v) || v < 1 || v > 10_000)
        fail(`revenueDistribution.bps[${i}] is invalid`);
      return v;
    }),
  };
  if (
    normalized.revenueDistribution.recipients[0] ===
    normalized.revenueDistribution.recipients[1]
  )
    fail("revenue recipients must differ");
  if (json(plan.claimFormula) !== json(FORMULA))
    fail("claimFormula must exactly attest the V1 formula");
  if (uint(plan.claimCooldownSeconds, "claimCooldownSeconds") !== 60n)
    fail("claimCooldownSeconds must be 60 for V1");
  return { plan, normalized, planFile: String(planFile) };
}

export async function runWorldChainDeployment(
  network,
  argv = process.argv,
  environment = process.env,
) {
  const sending = argv.includes("--send");
  const resuming = argv.includes("--resume");
  if (resuming && !sending)
    throw new Error("--resume is only allowed together with --send");
  const confirmation =
    network === "mainnet" ? "CONFIRM_MAINNET_DEPLOY" : "CONFIRM_TESTNET_DEPLOY";
  if (sending && environment[confirmation] !== "yes")
    throw new Error(`--send requires exact ${confirmation}=yes`);
  const { plan, normalized: p } = await loadPlan(network);
  const snapshot = JSON.parse(
    await readFile(
      new URL("../contracts/storage-layout-v1.snapshot.json", import.meta.url),
      "utf8",
    ),
  );
  const storageLayoutHash = keccak256(toBytes(JSON.stringify(snapshot)));
  if (hash(plan.storageLayoutHash, "storageLayoutHash") !== storageLayoutHash)
    fail(`storageLayoutHash must match frozen V1 schema ${storageLayoutHash}`);
  const artifacts = await compileWorldchainArtifacts();
  assertCompilerAbiPreflight(artifacts);
  const bytecode = (artifact) => `0x${artifact.evm.bytecode.object}`;
  const addresses = Object.fromEntries(
    DEPLOYMENT_STEPS.map((name, index) => [
      name,
      getContractAddress({
        from: p.deployer,
        nonce: p.deployerNonce + BigInt(index),
      }),
    ]),
  );
  const expectedProxyAdmin = getContractAddress({
    from: addresses.proxy,
    nonce: 1n,
  });
  const runtimeArtifacts = {
    implementation: artifacts.game,
    timelock: artifacts.timelock,
    splitter: artifacts.splitter,
    proxy: artifacts.proxy,
    registry: artifacts.registry,
    proxyAdmin: artifacts.proxyAdmin,
  };
  const expectedImmutables = {
    implementation: {},
    timelock: {},
    splitter: {
      token: addressWord(p.world.token),
      timelock: addressWord(addresses.timelock),
    },
    proxy: { _admin: addressWord(expectedProxyAdmin) },
    registry: { owner: addressWord(addresses.timelock) },
    proxyAdmin: {},
  };
  const expectedRuntimeCodes = Object.fromEntries(
    Object.entries(runtimeArtifacts).map(([step, artifact]) => [
      step,
      materializeRuntimeBytecode({
        artifact,
        expectedImmutables: expectedImmutables[step],
        step,
      }),
    ]),
  );
  const expectedRuntimeCodehashes = Object.fromEntries(
    Object.entries(expectedRuntimeCodes).map(([step, code]) => [
      step,
      keccak256(code),
    ]),
  );
  const initConfig = {
    worldIdVerifier: p.world.verifier,
    worldActionId: p.world.actionId,
    worldRpId: p.world.rpId,
    worldIssuerSchemaId: p.world.issuerSchemaId,
    credentialGenesisIssuedAtMin: p.world.credentialGenesisIssuedAtMin,
    worldIdLegacyRouter: p.world.legacyRouter,
    worldIdLegacyAppId: p.world.legacyAppId,
    worldIdLegacyActionId: p.world.legacyActionId,
    worldToken: p.world.token,
    revenueSplitter: addresses.splitter,
    timelock: addresses.timelock,
  };
  const initializeData = encodeInitializeData(artifacts.game, initConfig);
  const manifest = {
    mode: sending ? "SEND" : "DRY_RUN",
    chain: network,
    chainId: network === "mainnet" ? 480 : 4801,
    sourceCommit: p.sourceCommit,
    storageLayoutHash,
    planDigest: keccak256(toBytes(json(plan))),
    protectedKeyReferenceDigest: keccak256(toBytes(p.protectedKeyRef)),
    deployer: p.deployer,
    deployerNonce: p.deployerNonce,
    addresses,
    expectedRuntimeCodehashes,
    distribution: p.revenueDistribution,
    claimCooldownSeconds: 60,
    claimFormula: FORMULA,
    deploymentOrder: DEPLOYMENT_STEPS,
    transactions: [],
  };
  if (!sending) {
    console.log(json(manifest));
    return manifest;
  }
  const rpcUrl = environment.CIVILIZATION_WORLDCHAIN_RPC_URL;
  if (!rpcUrl || /placeholder|replace|example/i.test(rpcUrl))
    throw new Error(
      "--send requires a configured CIVILIZATION_WORLDCHAIN_RPC_URL for a protected external signer",
    );
  const chain = defineChain({
    id: manifest.chainId,
    name: `World Chain ${network}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    testnet: network === "testnet",
  });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const [chainId, onChainNonceRaw] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getTransactionCount({
      address: p.deployer,
      blockTag: "pending",
    }),
  ]);
  const onChainNonce = BigInt(onChainNonceRaw);
  if (chainId !== manifest.chainId)
    throw new Error(
      `connected chainId ${chainId} does not match reviewed chainId ${manifest.chainId}`,
    );
  assertDeploymentNonce({
    onChainNonce,
    plannedNonce: p.deployerNonce,
    resuming,
  });
  if (resuming) {
    manifest.transactions.push(
      ...(await recoverDeploymentPrefix({
        onChainNonce,
        plannedNonce: p.deployerNonce,
        addresses,
        expectedRuntimeCodehashes,
        expectedRuntimeCodes,
        getCode: (request) => publicClient.getCode(request),
      })),
    );
  }
  const account = await loadProtectedDeployerAccount(
    network,
    environment,
    p.deployer,
    p.protectedKeyRef,
  );
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
  const send = async (step, data, expectedAddress) => {
    if (isRecoveredStep(manifest.transactions, step)) return;
    const nonce = p.deployerNonce + BigInt(manifest.transactions.length);
    if (getContractAddress({ from: p.deployer, nonce }) !== expectedAddress)
      throw new Error(`predicted address drift before ${step}`);
    const txHash = await walletClient.sendTransaction({ account, data, nonce });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    if (
      receipt.status !== "success" ||
      receipt.contractAddress?.toLowerCase() !== expectedAddress.toLowerCase()
    )
      throw new Error(`${step} receipt did not create its predicted contract`);
    const code = await waitForRuntimeBytecode({
      getCode: (request) => publicClient.getCode(request),
      address: expectedAddress,
      step,
    });
    assertExactRuntimeBytecode({
      actual: code,
      expected: expectedRuntimeCodes[step],
      step,
      address: expectedAddress,
    });
    manifest.transactions.push({
      step,
      hash: txHash,
      address: expectedAddress,
      runtimeCodehash: keccak256(code),
    });
  };
  const read = (address_, abi, functionName, args = []) =>
    publicClient.readContract({ address: address_, abi, functionName, args });
  const constructorData = (artifact, args) =>
    encodeDeployData({ abi: artifact.abi, bytecode: bytecode(artifact), args });
  await send(
    "implementation",
    bytecode(artifacts.game),
    addresses.implementation,
  );
  await send(
    "timelock",
    constructorData(artifacts.timelock, [
      p.governance.minDelaySeconds,
      p.governance.proposers,
      p.governance.executors,
      p.governance.timelockAdmin,
    ]),
    addresses.timelock,
  );
  const proposerRole = keccak256(stringToHex("PROPOSER_ROLE"));
  const executorRole = keccak256(stringToHex("EXECUTOR_ROLE"));
  const timelockChecks = await Promise.all([
    read(addresses.timelock, artifacts.timelock.abi, "hasRole", [
      ZERO_HASH,
      p.governance.timelockAdmin,
    ]),
    ...p.governance.proposers.map((account) =>
      read(addresses.timelock, artifacts.timelock.abi, "hasRole", [
        proposerRole,
        account,
      ]),
    ),
    ...p.governance.executors.map((account) =>
      read(addresses.timelock, artifacts.timelock.abi, "hasRole", [
        executorRole,
        account,
      ]),
    ),
  ]);
  if (timelockChecks.some((value) => !value))
    throw new Error("post-deploy verification failed: timelock role model");
  await send(
    "splitter",
    constructorData(artifacts.splitter, [
      p.world.token,
      addresses.timelock,
      p.revenueDistribution.recipients,
      p.revenueDistribution.bps,
    ]),
    addresses.splitter,
  );
  const splitterBeforeProxy = await Promise.all([
    read(addresses.splitter, artifacts.splitter.abi, "token"),
    read(addresses.splitter, artifacts.splitter.abi, "timelock"),
    read(addresses.splitter, artifacts.splitter.abi, "recipients"),
    read(addresses.splitter, artifacts.splitter.abi, "PAYOUT_PERIOD"),
  ]);
  same(splitterBeforeProxy[0], p.world.token, "splitter token before proxy");
  same(
    splitterBeforeProxy[1],
    addresses.timelock,
    "splitter timelock before proxy",
  );
  if (
    splitterBeforeProxy[2].length !== 2 ||
    splitterBeforeProxy[2].some(
      (recipient, index) =>
        recipient.toLowerCase() !==
        p.revenueDistribution.recipients[index].toLowerCase(),
    ) ||
    splitterBeforeProxy[3] !== 2_592_000n
  )
    throw new Error(
      "post-deploy verification failed: splitter distribution/cadence before proxy",
    );
  await send(
    "proxy",
    constructorData(artifacts.proxy, [
      addresses.implementation,
      addresses.timelock,
      initializeData,
    ]),
    addresses.proxy,
  );
  const proxyBeforeRegistry = await Promise.all([
    read(addresses.proxy, artifacts.game.abi, "revenueSplitter"),
    read(addresses.proxy, artifacts.game.abi, "timelock"),
    read(addresses.proxy, artifacts.game.abi, "CLAIM_COOLDOWN"),
    publicClient.getStorageAt({
      address: addresses.proxy,
      slot: EIP1967_ADMIN_SLOT,
    }),
    publicClient.getStorageAt({
      address: addresses.proxy,
      slot: EIP1967_IMPLEMENTATION_SLOT,
    }),
  ]);
  same(
    proxyBeforeRegistry[0],
    addresses.splitter,
    "proxy splitter before registry",
  );
  same(
    proxyBeforeRegistry[1],
    addresses.timelock,
    "proxy timelock before registry",
  );
  same(proxyBeforeRegistry[2], 60n, "proxy claim cooldown before registry");
  assertAddressStorageWord(
    proxyBeforeRegistry[3],
    expectedProxyAdmin,
    "proxy EIP-1967 admin slot before registry",
  );
  assertAddressStorageWord(
    proxyBeforeRegistry[4],
    addresses.implementation,
    "proxy EIP-1967 implementation slot before registry",
  );
  const proxyCodeBeforeRegistry = await waitForRuntimeBytecode({
    getCode: (request) => publicClient.getCode(request),
    address: addresses.proxy,
    step: "proxy",
  });
  assertProxyAdminImmutableReferences({
    artifact: artifacts.proxy,
    runtimeCode: proxyCodeBeforeRegistry,
    expectedProxyAdmin,
  });
  const proxyAdminCodeBeforeRegistry = await waitForRuntimeBytecode({
    getCode: (request) => publicClient.getCode(request),
    address: expectedProxyAdmin,
    step: "expected ProxyAdmin child",
  });
  same(
    proxyAdminCodeBeforeRegistry,
    expectedRuntimeCodes.proxyAdmin,
    "expected ProxyAdmin runtime bytecode before registry",
  );
  same(
    await read(expectedProxyAdmin, artifacts.proxyAdmin.abi, "owner"),
    addresses.timelock,
    "ProxyAdmin owner before registry",
  );
  await send(
    "registry",
    constructorData(artifacts.registry, [
      addresses.timelock,
      [
        addresses.proxy,
        1n,
        addresses.implementation,
        expectedRuntimeCodehashes.implementation,
        p.sourceCommit,
        storageLayoutHash,
      ],
    ]),
    addresses.registry,
  );
  const action = BigInt(keccak256(stringToHex(p.world.actionId))) >> 8n;
  const legacyApp = BigInt(keccak256(stringToHex(p.world.legacyAppId))) >> 8n;
  const legacyNullifier =
    BigInt(
      keccak256(
        concatHex([
          toHex(legacyApp, { size: 32 }),
          stringToHex(p.world.legacyActionId),
        ]),
      ),
    ) >> 8n;
  const adminSlot = await publicClient.getStorageAt({
    address: addresses.proxy,
    slot: EIP1967_ADMIN_SLOT,
  });
  assertAddressStorageWord(
    adminSlot,
    expectedProxyAdmin,
    "proxy EIP-1967 admin slot",
  );
  const implementationSlot = await publicClient.getStorageAt({
    address: addresses.proxy,
    slot: EIP1967_IMPLEMENTATION_SLOT,
  });
  assertAddressStorageWord(
    implementationSlot,
    addresses.implementation,
    "proxy EIP-1967 implementation slot",
  );
  const proxyAdmin = expectedProxyAdmin;
  const [
    adminOwner,
    registryOwner,
    releaseCount,
    release,
    splitterToken,
    splitterTimelock,
    recipients,
    payoutPeriod,
    verifier,
    legacyRouter,
    token,
    configuredSplitter,
    configuredTimelock,
    configuredAction,
    configuredRp,
    configuredLegacyNullifier,
    cooldown,
    maxOffline,
    multiplier,
    storedWorldId,
  ] = await Promise.all([
    read(proxyAdmin, artifacts.proxyAdmin.abi, "owner"),
    read(addresses.registry, artifacts.registry.abi, "owner"),
    read(addresses.registry, artifacts.registry.abi, "releaseCount"),
    read(addresses.registry, artifacts.registry.abi, "releaseAt", [0n]),
    read(addresses.splitter, artifacts.splitter.abi, "token"),
    read(addresses.splitter, artifacts.splitter.abi, "timelock"),
    read(addresses.splitter, artifacts.splitter.abi, "recipients"),
    read(addresses.splitter, artifacts.splitter.abi, "PAYOUT_PERIOD"),
    read(addresses.proxy, artifacts.game.abi, "worldIdVerifier"),
    read(addresses.proxy, artifacts.game.abi, "worldIdLegacyRouter"),
    read(addresses.proxy, artifacts.game.abi, "worldToken"),
    read(addresses.proxy, artifacts.game.abi, "revenueSplitter"),
    read(addresses.proxy, artifacts.game.abi, "timelock"),
    read(addresses.proxy, artifacts.game.abi, "worldIdAction"),
    read(addresses.proxy, artifacts.game.abi, "worldIdRpId"),
    read(addresses.proxy, artifacts.game.abi, "worldIdLegacyExternalNullifier"),
    read(addresses.proxy, artifacts.game.abi, "CLAIM_COOLDOWN"),
    read(addresses.proxy, artifacts.game.abi, "MAX_OFFLINE_SECONDS"),
    read(addresses.proxy, artifacts.game.abi, "prestigeMultiplierBps", [0n]),
    readWorldIdStorageSnapshot({
      snapshot,
      address: addresses.proxy,
      getStorageAt: (request) => publicClient.getStorageAt(request),
    }),
  ]);
  same(adminOwner, addresses.timelock, "ProxyAdmin owner");
  same(registryOwner, addresses.timelock, "registry owner");
  same(releaseCount, 1n, "registry initial record count");
  assertRegistryRecord(release, {
    proxy: addresses.proxy,
    version: 1n,
    implementation: addresses.implementation,
    implementationCodehash: expectedRuntimeCodehashes.implementation,
    sourceCommit: p.sourceCommit,
    storageLayoutHash,
  });
  [
    splitterToken,
    splitterTimelock,
    verifier,
    legacyRouter,
    token,
    configuredSplitter,
    configuredTimelock,
  ].forEach((actual, index) =>
    same(
      actual,
      [
        p.world.token,
        addresses.timelock,
        p.world.verifier,
        p.world.legacyRouter,
        p.world.token,
        addresses.splitter,
        addresses.timelock,
      ][index],
      `configured address ${index}`,
    ),
  );
  if (recipients.length !== 2)
    throw new Error("post-deploy verification failed: splitter recipients");
  recipients.forEach((recipient, index) =>
    same(
      recipient,
      p.revenueDistribution.recipients[index],
      `splitter recipient ${index}`,
    ),
  );
  const shares = await Promise.all(
    p.revenueDistribution.recipients.map((recipient) =>
      read(addresses.splitter, artifacts.splitter.abi, "sharesBps", [
        recipient,
      ]),
    ),
  );
  shares.forEach((share, index) =>
    same(
      share,
      BigInt(p.revenueDistribution.bps[index]),
      `splitter BPS ${index}`,
    ),
  );
  [
    configuredAction,
    configuredRp,
    configuredLegacyNullifier,
    cooldown,
    maxOffline,
    multiplier,
    payoutPeriod,
  ].forEach((actual, index) =>
    same(
      actual,
      [
        action,
        p.world.rpId,
        legacyNullifier,
        60n,
        86_400n,
        10_000n,
        2_592_000n,
      ][index],
      `formula/config field ${index}`,
    ),
  );
  same(storedWorldId.rpId, configuredRp, "World ID RP storage/public getter");
  same(storedWorldId.rpId, p.world.rpId, "World ID RP storage");
  same(
    storedWorldId.issuerSchemaId,
    p.world.issuerSchemaId,
    "World ID issuer schema storage",
  );
  same(
    storedWorldId.credentialGenesisIssuedAtMin,
    p.world.credentialGenesisIssuedAtMin,
    "World ID credential genesis storage",
  );
  const codes = await Promise.all(
    Object.values(addresses).map((address_) =>
      publicClient.getCode({ address: address_ }),
    ),
  );
  Object.entries(addresses).forEach(([name], index) => {
    if (!codes[index] || codes[index] === "0x")
      throw new Error(
        `post-deploy verification failed: ${name} bytecode missing`,
      );
  });
  manifest.proxyAdmin = proxyAdmin;
  manifest.postVerification = "passed";
  manifest.contractRuntimeCodehashes = Object.fromEntries(
    Object.entries(addresses).map(([name], index) => [
      name,
      keccak256(codes[index]),
    ]),
  );
  console.log(json(manifest));
  return manifest;
}
