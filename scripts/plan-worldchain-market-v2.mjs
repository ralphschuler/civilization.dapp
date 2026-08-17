#!/usr/bin/env node
// Read-only V2 market upgrade planner.  It never sends a transaction; the
// resulting calls must be proposed and executed through the verified timelock.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
} from "viem";
import { compileWorldchainArtifacts } from "./worldchain-proxy-runner.mjs";
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
export const MARKET = Object.freeze([
  { resource: "Wood", id: 0, priceWeiPerUnit: 50_000_000_000_000_000n },
  { resource: "Clay", id: 1, priceWeiPerUnit: 75_000_000_000_000_000n },
  { resource: "Stone", id: 2, priceWeiPerUnit: 100_000_000_000_000_000n },
]);
export const INVENTORY = 5_000n;
export const RESERVE = 1_000_000_000_000_000_000_000n;
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
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
const GAME_ABI = [
  {
    type: "function",
    name: "timelock",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "configureMarket",
    stateMutability: "nonpayable",
    inputs: [
      { type: "uint8", name: "resource" },
      { type: "uint256", name: "priceWeiPerUnit" },
      { type: "uint256", name: "inventory" },
    ],
    outputs: [],
  },
];
const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "to" },
      { type: "uint256", name: "amount" },
    ],
    outputs: [{ type: "bool" }],
  },
];

const fail = (message) => {
  throw new Error(`World Chain V2 market plan rejected: ${message}`);
};
const address = (value, name) => {
  if (
    typeof value !== "string" ||
    !isAddress(value) ||
    /^0x0{40}$/i.test(value)
  )
    fail(`${name} must be a non-zero EVM address`);
  return getAddress(value);
};
const same = (actual, expected, label) => {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase())
    fail(`${label} mismatch`);
};
const json = (value) =>
  JSON.stringify(
    value,
    (_, item) => (typeof item === "bigint" ? item.toString() : item),
    2,
  );

export function assertMarketConstants(
  market = MARKET,
  inventory = INVENTORY,
  reserve = RESERVE,
) {
  if (!Array.isArray(market) || market.length !== 3)
    fail("market must contain exactly Wood, Clay, and Stone");
  for (const [index, item] of market.entries()) {
    const reviewed = MARKET[index];
    if (
      !item ||
      item.id !== reviewed.id ||
      item.resource !== reviewed.resource ||
      BigInt(item.priceWeiPerUnit) !== reviewed.priceWeiPerUnit
    )
      fail("market values differ from the reviewed V2 economics");
  }
  if (BigInt(inventory) !== INVENTORY || BigInt(reserve) !== RESERVE)
    fail("inventory or reserve differs from the reviewed V2 economics");
  return true;
}

export function createTimelockOperations({
  timelock,
  admin,
  implementation,
  minDelay,
}) {
  const upgrade = encodeFunctionData({
    abi: PROXY_ADMIN_ABI,
    functionName: "upgradeAndCall",
    args: [PROXY, implementation, "0x"],
  });
  const actions = [
    {
      label: "upgrade proxy to exact compiled V2 implementation",
      target: admin,
      value: 0n,
      data: upgrade,
    },
  ];
  for (const item of MARKET)
    actions.push({
      label: `configure ${item.resource} market`,
      target: PROXY,
      value: 0n,
      data: encodeFunctionData({
        abi: GAME_ABI,
        functionName: "configureMarket",
        args: [item.id, item.priceWeiPerUnit, INVENTORY],
      }),
    });
  actions.push({
    label: "seed exact CGOLD sell reserve",
    // CGOLD is implemented by CivilizationGame itself, behind this proxy.
    // WLD is unrelated to the market's CGOLD reserve.
    target: PROXY,
    value: 0n,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [PROXY, RESERVE],
    }),
  });
  return actions.map((action, index) => {
    const salt = keccak256(
      stringToHex(
        `civilization-market-v2-chain-${WORLD_CHAIN_ID}-action-${index}`,
      ),
    );
    const args = [action.target, action.value, action.data, ZERO_BYTES32, salt];
    return {
      ...action,
      salt,
      predecessor: ZERO_BYTES32,
      delay: minDelay,
      schedule: {
        to: timelock,
        value: "0",
        data: encodeFunctionData({
          abi: TIMELOCK_ABI,
          functionName: "schedule",
          args: [...args, minDelay],
        }),
        operation: 0,
      },
      execute: {
        to: timelock,
        value: "0",
        data: encodeFunctionData({
          abi: TIMELOCK_ABI,
          functionName: "execute",
          args,
        }),
        operation: 0,
      },
    };
  });
}

export async function sourceDigest() {
  return createHash("sha256")
    .update(
      await readFile(
        new URL("../contracts/src/CivilizationGame.sol", import.meta.url),
      ),
    )
    .digest("hex");
}

export async function buildMarketUpgradePlan({
  rpc,
  implementation,
  safe,
} = {}) {
  assertMarketConstants();
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
    "expected old implementation",
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
    "proxy timelock and ProxyAdmin owner",
  );
  const timelock = report.authority.proxyTimelock;
  const [minDelay, safeProposer, safeExecutor, candidateCode] =
    await Promise.all([
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
            args: [EXECUTOR_ROLE, safeAddress],
          }),
        },
        "latest",
      ]),
      rpc("eth_getCode", [candidate, "latest"]),
    ]);
  if (
    !/^0x[0-9a-f]{64}$/i.test(minDelay) ||
    !/^0x0{63}[01]$/i.test(safeProposer) ||
    !/^0x0{63}[01]$/i.test(safeExecutor)
  )
    fail("timelock role or delay read returned malformed ABI data");
  const delay = BigInt(minDelay);
  if (delay === 0n) fail("timelock delay must be non-zero");
  if (!/^0x(?:[0-9a-f]{2})+$/i.test(candidateCode))
    fail("candidate implementation has no runtime bytecode");
  const artifacts = await compileWorldchainArtifacts();
  const expectedRuntimeCodehash = keccak256(
    `0x${artifacts.game.evm.deployedBytecode.object}`,
  );
  same(
    keccak256(candidateCode),
    expectedRuntimeCodehash,
    "candidate implementation codehash",
  );
  const actions = createTimelockOperations({
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
      file: "contracts/src/CivilizationGame.sol",
      sha256: await sourceDigest(),
      creationCodehash: keccak256(`0x${artifacts.game.evm.bytecode.object}`),
      runtimeCodehash: expectedRuntimeCodehash,
    },
    preconditions: {
      expectedOldImplementation: EXPECTED_OLD_IMPLEMENTATION,
      expectedOldImplementationCodehash: EXPECTED_OLD_IMPLEMENTATION_CODEHASH,
      verifiedProxy: report.proxy,
      verifiedAdmin: report.admin,
      timelock,
      minDelay: delay,
      safe: safeAddress,
      safeCanPropose: safeProposer.endsWith("1"),
      safeCanExecute: safeExecutor.endsWith("1"),
    },
    economics: {
      market: MARKET.map((item) => ({
        ...item,
        priceWeiPerUnit: item.priceWeiPerUnit,
      })),
      inventoryPerResource: INVENTORY,
      cgoldReserve: RESERVE,
      cgoldToken: PROXY,
    },
    deployment: {
      action: "deploy exact creation bytecode before this plan can execute",
      to: null,
      value: "0",
      data: `0x${artifacts.game.evm.bytecode.object}`,
      expectedRuntimeCodehash,
    },
    timelockOperations: actions,
    safeCompatibleBundle: {
      version: "1.0",
      chainId: String(WORLD_CHAIN_ID),
      safeAddress,
      note: "Submit schedule calls first; execute calls only after the on-chain minimum delay. This bundle has no signatures and does not send.",
      scheduleTransactions: actions.map(({ schedule }) => schedule),
      executeTransactions: actions.map(({ execute }) => execute),
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
        "usage: --rpc-url <https-url> --implementation <deployed-v2-address> --safe <timelock-proposer-safe>",
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
    const plan = await buildMarketUpgradePlan({
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
