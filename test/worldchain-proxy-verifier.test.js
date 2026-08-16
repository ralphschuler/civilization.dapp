import assert from "node:assert/strict";
import test from "node:test";
import { keccak256 } from "viem";
import {
  createJsonRpc,
  EIP1967_IMPLEMENTATION_SLOT,
  READ_ONLY_RPC_METHODS,
  verifyWorldChainProxy,
} from "../scripts/verify-worldchain-proxy.mjs";

const proxy = "0x0E6689d0649Ad9037465d178231b10F18518D2b0";
const implementation = "0x1111111111111111111111111111111111111111";
const admin = "0x2222222222222222222222222222222222222222";
const owner = "0x3333333333333333333333333333333333333333";
const word = (address) => `0x${address.slice(2).padStart(64, "0")}`;
const code = "0x6001600055";

const fixtureRpc = ({
  chainId = "0x1e0",
  implementationSlot = word(implementation),
  adminSlot = word(admin),
  proxyCode = code,
  ownerResult = word(owner),
  timelockResult = word(admin),
  pausedResult = word("0x0000000000000000000000000000000000000000"),
  pausedRpcError = false,
} = {}) => {
  const calls = [];
  const responseFor = async (method, params) => {
    calls.push({ method, params });
    assert.ok(
      READ_ONLY_RPC_METHODS.includes(method),
      `unexpected RPC method ${method}`,
    );
    if (method === "eth_chainId") return chainId;
    if (method === "eth_getStorageAt")
      return params[1] === EIP1967_IMPLEMENTATION_SLOT
        ? implementationSlot
        : adminSlot;
    if (method === "eth_getCode")
      return params[0].toLowerCase() === proxy.toLowerCase() ? proxyCode : code;
    if (method === "eth_call") {
      const data = params[0].data;
      if (data.startsWith("0x8da5cb5b")) return ownerResult;
      if (data.startsWith("0x5c975abb")) {
        if (pausedRpcError) throw { message: "execution reverted" };
        return pausedResult;
      }
      return timelockResult;
    }
    throw new Error("unexpected method");
  };
  const rpc = createJsonRpc({
    rpcUrl: "https://mocked-worldchain-rpc.invalid",
    fetchImpl: async (_url, request) => {
      const payload = JSON.parse(request.body);
      try {
        const result = await responseFor(payload.method, payload.params);
        return {
          ok: true,
          json: async () => ({ jsonrpc: "2.0", id: payload.id, result }),
        };
      } catch (error) {
        return {
          ok: true,
          json: async () => ({ jsonrpc: "2.0", id: payload.id, error }),
        };
      }
    },
  });
  return { rpc, calls };
};

test("successful fixture reports decoded authority, pause state, and only safe RPC methods", async () => {
  const { rpc, calls } = fixtureRpc();
  const report = await verifyWorldChainProxy({
    rpc,
    proxy,
    expectedChainId: 480,
  });
  assert.equal(report.ok, true);
  assert.equal(report.implementation.address, implementation);
  assert.equal(report.admin.address, admin);
  assert.equal(report.admin.owner, owner);
  assert.equal(report.authority.proxyTimelock, admin);
  assert.equal(report.authority.proxyAdminOwner, owner);
  assert.deepEqual(report.probes.paused, {
    address: proxy,
    abi: "paused()",
    status: "supported",
    value: false,
  });
  assert.equal(report.proxy.code.hash, keccak256(code));
  assert.equal(report.implementation.code.hash, keccak256(code));
  assert.deepEqual(
    new Set(calls.map(({ method }) => method)),
    new Set(READ_ONLY_RPC_METHODS),
  );
  assert.equal(calls.filter(({ method }) => method === "eth_call").length, 3);
  assert.ok(
    calls
      .filter(({ method }) => method === "eth_call")
      .every(({ params }) => params[0].value === undefined),
  );
});

test("paused() reports a supported true result", async () => {
  const { rpc } = fixtureRpc({
    pausedResult: `0x${"00".repeat(31)}01`,
  });
  const report = await verifyWorldChainProxy({
    rpc,
    proxy,
    expectedChainId: 480,
  });
  assert.equal(report.probes.paused.status, "supported");
  assert.equal(report.probes.paused.value, true);
});

test("paused() reports unsupported or reverted without RPC detail", async () => {
  const { rpc } = fixtureRpc({ pausedRpcError: true });
  const report = await verifyWorldChainProxy({
    rpc,
    proxy,
    expectedChainId: 480,
  });
  assert.deepEqual(report.probes.paused, {
    address: proxy,
    abi: "paused()",
    status: "unsupported_or_reverted",
  });
  assert.doesNotMatch(
    JSON.stringify(report.probes.paused),
    /execution reverted/,
  );
});

test("chain mismatch fails before proxy reads", async () => {
  const { rpc, calls } = fixtureRpc({ chainId: "0x1e1" });
  await assert.rejects(
    verifyWorldChainProxy({ rpc, proxy, expectedChainId: 480 }),
    /chain id mismatch: expected 480, received 481/,
  );
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["eth_chainId"],
  );
});

test("missing code fails closed", async () => {
  const { rpc } = fixtureRpc({ proxyCode: "0x" });
  await assert.rejects(
    verifyWorldChainProxy({ rpc, proxy, expectedChainId: 480 }),
    /proxy has no runtime bytecode/,
  );
});

test("malformed EIP-1967 slot fails closed", async () => {
  const { rpc } = fixtureRpc({ implementationSlot: `0x01${"00".repeat(31)}` });
  await assert.rejects(
    verifyWorldChainProxy({ rpc, proxy, expectedChainId: 480 }),
    /implementation slot is malformed: non-address high bits are set/,
  );
});

test("malformed EIP-1967 word fails closed", async () => {
  const { rpc } = fixtureRpc({ implementationSlot: "0x1234" });
  await assert.rejects(
    verifyWorldChainProxy({ rpc, proxy, expectedChainId: 480 }),
    /implementation slot is not an exact bytes32 word/,
  );
});

test("malformed EIP-1967 admin slot fails closed", async () => {
  const { rpc } = fixtureRpc({ adminSlot: `0x01${"00".repeat(31)}` });
  await assert.rejects(
    verifyWorldChainProxy({ rpc, proxy, expectedChainId: 480 }),
    /admin slot is malformed: non-address high bits are set/,
  );
});

test("malformed ProxyAdmin owner() result fails closed", async () => {
  const { rpc } = fixtureRpc({ ownerResult: "0x1234" });
  await assert.rejects(
    verifyWorldChainProxy({ rpc, proxy, expectedChainId: 480 }),
    /owner\(\) probe .* returned malformed ABI address data/,
  );
});

test("zero ProxyAdmin owner() result fails closed", async () => {
  const { rpc } = fixtureRpc({
    ownerResult: word("0x0000000000000000000000000000000000000000"),
  });
  await assert.rejects(
    verifyWorldChainProxy({ rpc, proxy, expectedChainId: 480 }),
    /owner\(\) probe .* must be a non-zero EVM address/,
  );
});

test("zero proxy timelock() result fails closed", async () => {
  const { rpc } = fixtureRpc({
    timelockResult: word("0x0000000000000000000000000000000000000000"),
  });
  await assert.rejects(
    verifyWorldChainProxy({ rpc, proxy, expectedChainId: 480 }),
    /timelock\(\) probe .* must be a non-zero EVM address/,
  );
});

test("malformed proxy timelock() result fails closed", async () => {
  const { rpc } = fixtureRpc({ timelockResult: "0x1234" });
  await assert.rejects(
    verifyWorldChainProxy({ rpc, proxy, expectedChainId: 480 }),
    /timelock\(\) probe .* returned malformed ABI address data/,
  );
});

test("each RPC fetch has a bounded abort timeout", async () => {
  const rpc = createJsonRpc({
    rpcUrl: "https://mocked-worldchain-rpc.invalid",
    timeoutMs: 5,
    fetchImpl: async (_url, request) =>
      new Promise((resolve, reject) => {
        void resolve;
        request.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted by test")),
          { once: true },
        );
      }),
  });
  await assert.rejects(rpc("eth_chainId", []), /timed out after 5ms/);
});
