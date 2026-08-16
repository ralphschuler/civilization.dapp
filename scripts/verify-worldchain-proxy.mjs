#!/usr/bin/env node
// Read-only World Chain proxy verifier. It never constructs transactions and
// limits JSON-RPC traffic to the methods listed in READ_ONLY_RPC_METHODS.
import { encodeFunctionData, getAddress, isAddress, keccak256 } from "viem";

export const VERIFIER_VERSION = "1.1.0";
export const RPC_FETCH_TIMEOUT_MS = 10_000;
export const READ_ONLY_RPC_METHODS = Object.freeze([
  "eth_chainId",
  "eth_getStorageAt",
  "eth_getCode",
  "eth_call",
]);
export const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
export const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

const TIMLOCK_ABI = Object.freeze([
  {
    type: "function",
    name: "timelock",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
]);
const PROXY_ADMIN_ABI = Object.freeze([
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
]);
const PAUSED_ABI = Object.freeze([
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
]);
const HEX_WORD = /^0x[0-9a-fA-F]{64}$/;
const HEX_DATA = /^0x(?:[0-9a-fA-F]{2})*$/;

class RpcMethodError extends Error {
  constructor(method) {
    super(`RPC ${method} returned an error response`);
    this.name = "RpcMethodError";
  }
}

const fail = (message) => {
  throw new Error(`World Chain proxy verification failed: ${message}`);
};

const validateAddress = (value, label) => {
  if (typeof value !== "string" || !isAddress(value) || /^0x0{40}$/i.test(value))
    fail(`${label} must be a non-zero EVM address`);
  return getAddress(value);
};

const validateExpectedChainId = (value) => {
  if (!/^[1-9]\d*$/.test(String(value)))
    fail("expected chain id must be a positive decimal integer");
  return BigInt(value);
};

const parseChainId = (value) => {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value))
    fail("RPC returned a malformed eth_chainId result");
  return BigInt(value);
};

export const addressFromEip1967Word = (word, label) => {
  if (typeof word !== "string" || !HEX_WORD.test(word))
    fail(`${label} slot is not an exact bytes32 word`);
  if (!/^0x0{24}[0-9a-fA-F]{40}$/.test(word))
    fail(`${label} slot is malformed: non-address high bits are set`);
  return validateAddress(`0x${word.slice(-40)}`, `${label} slot`);
};

const assertCode = (code, label) => {
  if (typeof code !== "string" || !HEX_DATA.test(code))
    fail(`${label} returned malformed bytecode`);
  if (code === "0x") fail(`${label} has no runtime bytecode`);
  return { bytes: (code.length - 2) / 2, hash: keccak256(code) };
};

const encodeTimelockProbe = () =>
  encodeFunctionData({ abi: TIMLOCK_ABI, functionName: "timelock" });

const encodeOwnerProbe = () =>
  encodeFunctionData({ abi: PROXY_ADMIN_ABI, functionName: "owner" });

const encodePausedProbe = () =>
  encodeFunctionData({ abi: PAUSED_ABI, functionName: "paused" });

const decodeAddressProbe = (result, label) => {
  if (typeof result !== "string" || !HEX_WORD.test(result))
    fail(`${label} returned malformed ABI address data`);
  if (!/^0x0{24}[0-9a-fA-F]{40}$/.test(result))
    fail(`${label} returned an ABI address with non-zero high bits`);
  return validateAddress(`0x${result.slice(-40)}`, label);
};

const decodePausedProbe = (result) => {
  if (typeof result !== "string" || !HEX_WORD.test(result))
    fail("eth_call paused() probe at proxy returned malformed ABI boolean data");
  if (!/^0x0{63}[01]$/.test(result))
    fail("eth_call paused() probe at proxy returned an invalid ABI boolean value");
  return result.endsWith("1");
};

export const createJsonRpc = ({
  rpcUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = RPC_FETCH_TIMEOUT_MS,
}) => {
  if (typeof rpcUrl !== "string" || !/^https:\/\//i.test(rpcUrl))
    fail("RPC URL must be an explicit HTTPS URL");
  if (typeof fetchImpl !== "function") fail("a fetch implementation is required");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    fail("RPC fetch timeout must be a positive safe integer in milliseconds");
  let id = 0;
  return async (method, params) => {
    if (!READ_ONLY_RPC_METHODS.includes(method))
      fail(`refusing non-read-only RPC method ${method}`);
    let response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted)
        fail(`RPC request for ${method} timed out after ${timeoutMs}ms`);
      fail(`RPC request for ${method} could not be completed`);
    } finally {
      clearTimeout(timeout);
    }
    if (!response || !response.ok)
      fail(`RPC request for ${method} returned HTTP failure`);
    let payload;
    try {
      payload = await response.json();
    } catch {
      fail(`RPC request for ${method} returned invalid JSON`);
    }
    if (payload?.error) throw new RpcMethodError(method);
    if (!("result" in (payload || {}))) fail(`RPC ${method} response omitted result`);
    return payload.result;
  };
};

/**
 * Verify an already-deployed EIP-1967 proxy using only read-only JSON-RPC.
 * rpc may be injected by tests; production callers normally supply rpcUrl.
 */
export const verifyWorldChainProxy = async ({
  rpcUrl,
  proxy,
  expectedChainId,
  rpc = rpcUrl ? createJsonRpc({ rpcUrl }) : undefined,
}) => {
  const proxyAddress = validateAddress(proxy, "proxy");
  const expected = validateExpectedChainId(expectedChainId);
  if (typeof rpc !== "function")
    fail("an RPC client or explicit RPC URL is required");
  const chainId = parseChainId(await rpc("eth_chainId", []));
  if (chainId !== expected)
    fail(`chain id mismatch: expected ${expected.toString()}, received ${chainId.toString()}`);

  const [implementationWord, adminWord, proxyCode] = await Promise.all([
    rpc("eth_getStorageAt", [proxyAddress, EIP1967_IMPLEMENTATION_SLOT, "latest"]),
    rpc("eth_getStorageAt", [proxyAddress, EIP1967_ADMIN_SLOT, "latest"]),
    rpc("eth_getCode", [proxyAddress, "latest"]),
  ]);
  const implementation = addressFromEip1967Word(implementationWord, "implementation");
  const admin = addressFromEip1967Word(adminWord, "admin");
  const [implementationCode, adminCode] = await Promise.all([
    rpc("eth_getCode", [implementation, "latest"]),
    rpc("eth_getCode", [admin, "latest"]),
  ]);
  // Refuse missing or malformed runtime code before issuing optional ABI probes.
  const proxyCodeReport = assertCode(proxyCode, "proxy");
  const implementationCodeReport = assertCode(implementationCode, "implementation");
  const adminCodeReport = assertCode(adminCode, "admin");
  const [timelockResult, ownerResult] = await Promise.all([
    rpc("eth_call", [{ to: proxyAddress, data: encodeTimelockProbe() }, "latest"]),
    rpc("eth_call", [{ to: admin, data: encodeOwnerProbe() }, "latest"]),
  ]);
  const timelock = decodeAddressProbe(
    timelockResult,
    `eth_call timelock() probe at ${proxyAddress}`,
  );
  const owner = decodeAddressProbe(
    ownerResult,
    `eth_call owner() probe at ProxyAdmin ${admin}`,
  );
  let paused;
  try {
    paused = {
      status: "supported",
      value: decodePausedProbe(
        await rpc("eth_call", [{ to: proxyAddress, data: encodePausedProbe() }, "latest"]),
      ),
    };
  } catch (error) {
    if (!(error instanceof RpcMethodError)) throw error;
    paused = { status: "unsupported_or_reverted" };
  }

  return {
    ok: true,
    verifierVersion: VERIFIER_VERSION,
    chainId: chainId.toString(),
    expectedChainId: expected.toString(),
    proxy: { address: proxyAddress, code: proxyCodeReport },
    implementation: {
      address: implementation,
      slot: implementationWord.toLowerCase(),
      code: implementationCodeReport,
    },
    admin: {
      address: admin,
      slot: adminWord.toLowerCase(),
      code: adminCodeReport,
      owner,
    },
    authority: { proxyTimelock: timelock, proxyAdminOwner: owner },
    probes: {
      timelock: { address: proxyAddress, abi: "timelock()", value: timelock },
      owner: { address: admin, abi: "owner()", value: owner },
      paused: { address: proxyAddress, abi: "paused()", ...paused },
    },
  };
};

const cliArguments = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!/^--(?:rpc-url|proxy|expected-chain-id)$/.test(flag) || value === undefined)
      fail(
        "usage: --rpc-url <https-url> --proxy <address> --expected-chain-id <decimal>",
      );
    const key = flag
      .slice(2)
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (options[key] !== undefined) fail(`duplicate argument ${flag}`);
    options[key] = value;
  }
  return options;
};

export const main = async (argv = process.argv.slice(2)) => {
  try {
    const options = cliArguments(argv);
    const report = await verifyWorldChainProxy(options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report;
  } catch (error) {
    const report = {
      ok: false,
      verifierVersion: VERIFIER_VERSION,
      error: error.message,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
    return report;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) await main();
