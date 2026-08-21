#!/usr/bin/env node
// Read-only planner for the narrowly scoped Workshop V1.1 proxy upgrade.
// It never sends transactions or reads signing material.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
} from "viem";
import solc from "solc";
import { SOLIDITY_RELEASE_PROFILE } from "./solidity-release-profile.mjs";
import {
  createJsonRpc,
  verifyWorldChainProxy,
} from "./verify-worldchain-proxy.mjs";

export const WORLD_CHAIN_ID = 480;
export const PROXY = "0x0E6689d0649Ad9037465d178231b10F18518D2b0";
export const EXPECTED_OLD_IMPLEMENTATION =
  "0x7330C22d7b61CCcDB7794435535aaB349D9aFF79";
export const EXPECTED_OLD_IMPLEMENTATION_CODEHASH =
  "0x0a2ceb5853ae7ba5d020948baf97c08526f7d19ef990c3e3fc61c35ac794b12a";
export const EXPECTED_PROXY_CODEHASH =
  "0x6ef08fd1df9261908a3870c0e7c652b38d4394eb5d5eff6cf86b82fb1b0209f9";
export const EXPECTED_PROXY_ADMIN_CODEHASH =
  "0x596a47f00033112fa6862ce8f8af0ab95443ea529e74be94637d5bab676420d2";
export const REQUIRED_TIMELOCK_DELAY_SECONDS = 72n * 60n * 60n;
export const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const require = createRequire(import.meta.url);
const ROLE = (name) => keccak256(stringToHex(name));
const PROPOSER_ROLE = ROLE("PROPOSER_ROLE");
const EXECUTOR_ROLE = ROLE("EXECUTOR_ROLE");
const TIMELOCK_ABI = [
  {
    type: "function",
    name: "getMinDelay",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }, { type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "schedule",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "target" },
      { type: "uint256", name: "value" },
      { type: "bytes", name: "data" },
      { type: "bytes32", name: "predecessor" },
      { type: "bytes32", name: "salt" },
      { type: "uint256", name: "delay" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { type: "address", name: "target" },
      { type: "uint256", name: "value" },
      { type: "bytes", name: "data" },
      { type: "bytes32", name: "predecessor" },
      { type: "bytes32", name: "salt" },
    ],
    outputs: [],
  },
];
const PROXY_ADMIN_ABI = [
  {
    type: "function",
    name: "upgradeAndCall",
    stateMutability: "payable",
    inputs: [
      { type: "address", name: "proxy" },
      { type: "address", name: "implementation" },
      { type: "bytes", name: "data" },
    ],
    outputs: [],
  },
];

const fail = (message) => {
  throw new Error(`World Chain Workshop V1.1 plan rejected: ${message}`);
};
const json = (value) =>
  JSON.stringify(
    value,
    (_, item) => (typeof item === "bigint" ? item.toString() : item),
    2,
  );
const address = (value, label) => {
  if (
    typeof value !== "string" ||
    !isAddress(value) ||
    /^0x0{40}$/i.test(value)
  )
    fail(`${label} must be a non-zero EVM address`);
  return getAddress(value);
};
const same = (actual, expected, label) => {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase())
    fail(`${label} mismatch`);
};
const decodeWord = (value, label) => {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value))
    fail(`${label} returned malformed ABI data`);
  return value.toLowerCase();
};

export async function compileWorkshopV11() {
  const source = await readFile(
    new URL(
      "../contracts/src/CivilizationGameWorkshopFixV11.sol",
      import.meta.url,
    ),
    "utf8",
  );
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: {
          "contracts/src/CivilizationGameWorkshopFixV11.sol": {
            content: source,
          },
        },
        settings: {
          ...SOLIDITY_RELEASE_PROFILE,
          outputSelection: {
            "*": {
              "*": ["evm.bytecode.object", "evm.deployedBytecode.object"],
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
            return { error: `unresolved import: ${path}` };
          }
        },
      },
    ),
  );
  const errors = (output.errors ?? []).filter(
    (entry) => entry.severity === "error",
  );
  if (errors.length)
    fail(errors.map((entry) => entry.formattedMessage).join("\n"));
  const artifact =
    output.contracts?.["contracts/src/CivilizationGameWorkshopFixV11.sol"]
      ?.CivilizationGameWorkshopFixV11;
  if (!artifact?.evm?.bytecode?.object || !artifact.evm.deployedBytecode.object)
    fail("compiler did not produce Workshop V1.1 bytecode");
  return { artifact, source };
}

export function createWorkshopV11Operation({
  timelock,
  admin,
  implementation,
  minDelay,
}) {
  const delay = BigInt(minDelay);
  const target = address(admin, "ProxyAdmin");
  const candidate = address(implementation, "implementation");
  const upgradeData = encodeFunctionData({
    abi: PROXY_ADMIN_ABI,
    functionName: "upgradeAndCall",
    args: [PROXY, candidate, "0x"],
  });
  const salt = keccak256(
    stringToHex(
      `civilization-workshop-v11-chain-${WORLD_CHAIN_ID}-${candidate.toLowerCase()}`,
    ),
  );
  const operation = {
    label: "upgrade proxy to Workshop V1.1 only",
    target,
    value: 0n,
    data: upgradeData,
    predecessor: ZERO_BYTES32,
    salt,
    delay,
  };
  const args = [
    operation.target,
    operation.value,
    operation.data,
    operation.predecessor,
    operation.salt,
  ];
  return {
    ...operation,
    schedule: {
      to: address(timelock, "timelock"),
      value: "0",
      data: encodeFunctionData({
        abi: TIMELOCK_ABI,
        functionName: "schedule",
        args: [...args, operation.delay],
      }),
      operation: 0,
    },
    execute: {
      to: address(timelock, "timelock"),
      value: "0",
      data: encodeFunctionData({
        abi: TIMELOCK_ABI,
        functionName: "execute",
        args,
      }),
      operation: 0,
    },
  };
}

export async function buildWorkshopV11Plan({ rpc, implementation, safe } = {}) {
  const candidate = address(implementation, "implementation");
  const safeAddress = address(safe, "safe");
  const report = await verifyWorldChainProxy({
    rpc,
    proxy: PROXY,
    expectedChainId: WORLD_CHAIN_ID,
  });
  same(report.proxy.code.hash, EXPECTED_PROXY_CODEHASH, "proxy codehash");
  same(
    report.implementation.address,
    EXPECTED_OLD_IMPLEMENTATION,
    "old implementation",
  );
  same(
    report.implementation.code.hash,
    EXPECTED_OLD_IMPLEMENTATION_CODEHASH,
    "old implementation codehash",
  );
  same(
    report.admin.code.hash,
    EXPECTED_PROXY_ADMIN_CODEHASH,
    "ProxyAdmin codehash",
  );
  same(
    report.authority.proxyTimelock,
    report.admin.owner,
    "timelock authority",
  );
  const timelock = report.authority.proxyTimelock;
  const [
    delayWord,
    safeProposerWord,
    openExecutorWord,
    candidateCode,
    compiled,
  ] = await Promise.all([
    rpc("eth_call", [
      {
        to: timelock,
        data: encodeFunctionData({
          abi: TIMELOCK_ABI,
          functionName: "getMinDelay",
        }),
      },
      "latest",
    ]),
    rpc("eth_call", [
      {
        to: timelock,
        data: encodeFunctionData({
          abi: TIMELOCK_ABI,
          functionName: "hasRole",
          args: [PROPOSER_ROLE, safeAddress],
        }),
      },
      "latest",
    ]),
    rpc("eth_call", [
      {
        to: timelock,
        data: encodeFunctionData({
          abi: TIMELOCK_ABI,
          functionName: "hasRole",
          args: [EXECUTOR_ROLE, ZERO_ADDRESS],
        }),
      },
      "latest",
    ]),
    rpc("eth_getCode", [candidate, "latest"]),
    compileWorkshopV11(),
  ]);
  const delay = BigInt(decodeWord(delayWord, "timelock delay"));
  if (delay < REQUIRED_TIMELOCK_DELAY_SECONDS)
    fail("timelock delay is shorter than 72 hours");
  if (
    decodeWord(safeProposerWord, "Safe proposer role") !==
    `0x${"00".repeat(31)}01`
  )
    fail("Safe lacks PROPOSER_ROLE");
  if (
    decodeWord(openExecutorWord, "open executor role") !==
    `0x${"00".repeat(31)}01`
  )
    fail("timelock executor is not permissionless");
  if (!/^0x(?:[0-9a-f]{2})+$/i.test(candidateCode) || candidateCode === "0x")
    fail("candidate implementation has no runtime bytecode");
  const expectedRuntimeCodehash = keccak256(
    `0x${compiled.artifact.evm.deployedBytecode.object}`,
  );
  same(
    keccak256(candidateCode),
    expectedRuntimeCodehash,
    "candidate implementation codehash",
  );
  const operation = createWorkshopV11Operation({
    timelock,
    admin: report.admin.address,
    implementation: candidate,
    minDelay: delay,
  });
  return {
    ok: true,
    mode: "DRY_RUN_ONLY",
    chainId: WORLD_CHAIN_ID,
    proxy: PROXY,
    compiledSource: {
      file: "contracts/src/CivilizationGameWorkshopFixV11.sol",
      sha256: createHash("sha256").update(compiled.source).digest("hex"),
      creationCodehash: keccak256(`0x${compiled.artifact.evm.bytecode.object}`),
      runtimeCodehash: expectedRuntimeCodehash,
    },
    deployment: {
      action: "deploy this exact implementation before scheduling the upgrade",
      to: null,
      value: "0",
      data: `0x${compiled.artifact.evm.bytecode.object}`,
      expectedRuntimeCodehash,
    },
    preconditions: {
      expectedOldImplementation: EXPECTED_OLD_IMPLEMENTATION,
      expectedOldImplementationCodehash: EXPECTED_OLD_IMPLEMENTATION_CODEHASH,
      verifiedProxy: report.proxy,
      verifiedAdmin: report.admin,
      timelock,
      minDelay: delay,
      safe: safeAddress,
      safeCanPropose: true,
      executorPermissionless: true,
    },
    timelockOperation: operation,
    safeCompatibleBundle: {
      version: "1.0",
      chainId: String(WORLD_CHAIN_ID),
      safeAddress,
      note: "Submit the schedule transaction through the Safe. Execute only after the on-chain 72-hour delay. This bundle has no signatures and does not send.",
      scheduleTransaction: operation.schedule,
      executeTransaction: operation.execute,
    },
  };
}

const parse = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !/^--(?:rpc-url|implementation|safe)$/.test(flag) ||
      value === undefined ||
      options[flag]
    )
      fail(
        "usage: --rpc-url <https-url> --implementation <deployed-v11-address> --safe <timelock-proposer-safe>",
      );
    options[flag] = value;
  }
  return options;
};

export async function main(argv = process.argv.slice(2)) {
  try {
    if (argv.includes("--send") || argv.includes("--execute"))
      fail("this planner never sends or executes transactions");
    const options = parse(argv);
    const plan = await buildWorkshopV11Plan({
      rpc: createJsonRpc({ rpcUrl: options["--rpc-url"] }),
      implementation: options["--implementation"],
      safe: options["--safe"],
    });
    process.stdout.write(`${json(plan)}\n`);
    return plan;
  } catch (error) {
    process.stdout.write(
      `${json({ ok: false, mode: "DRY_RUN_ONLY", error: error.message })}\n`,
    );
    process.exitCode = 1;
    return undefined;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
