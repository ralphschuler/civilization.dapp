import assert from "node:assert/strict";
import test from "node:test";
import { encodeErrorResult } from "viem";
import { CIVILIZATION_GAME_ABI } from "../src/abi/CivilizationGame.js";
import { decodeCivilizationRevert } from "../src/world-game/reverts.js";
import { createWorldGameAdapter } from "../src/world-game/adapter.js";
import { requireVerifiedContractRuntime } from "../src/world-game/runtime-gate.js";

for (const [name, code] of [
  ["MissingBuildingRequirement", "contract_missing_building_requirement"],
  ["InsufficientResources", "contract_insufficient_resources"],
  ["ConstructionSlotsFull", "contract_construction_slots_full"],
  ["BuildingMaxLevel", "contract_building_max_level"],
  ["Unregistered", "contract_unregistered"],
])
  test(`decodes ${name} custom error`, () => {
    const data = encodeErrorResult({
      abi: CIVILIZATION_GAME_ABI,
      errorName: name,
      args: name === "ConstructionSlotsFull" ? [3, 3] : [],
    });
    assert.equal(decodeCivilizationRevert({ data }).code, code);
  });

test("malformed or unknown revert data remains safe and preflight sends no transaction", async () => {
  assert.equal(decodeCivilizationRevert({ data: "0x1234" }), null);
  assert.equal(
    decodeCivilizationRevert({ data: `0x${"ff".repeat(32)}` }),
    null,
  );
  let sent = 0;
  const adapter = createWorldGameAdapter({
    walletAddress: "0x1111111111111111111111111111111111111111",
    contractAddress: "0x3333333333333333333333333333333333333333",
    readState: async () => ({ registered: true }),
    preflight: async () => {
      throw {
        data: encodeErrorResult({
          abi: CIVILIZATION_GAME_ABI,
          errorName: "InsufficientResources",
        }),
      };
    },
    pollReceipt: async () => ({ receipt: { status: "success" } }),
    miniKit: {
      sendTransaction: async () => {
        sent += 1;
      },
    },
  });
  await assert.rejects(
    adapter.execute("upgrade", { building: "workshop" }),
    /contract_insufficient_resources/,
  );
  assert.equal(sent, 0);
});

test("runtime status gate reads only the sanitized status endpoint", async () => {
  const requests = [];
  await requireVerifiedContractRuntime(async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      json: async () => ({ runtimeVerification: { status: "verified" } }),
    };
  });
  assert.deepEqual(requests, [
    { url: "/api/contracts/status", options: { cache: "no-store" } },
  ]);
});

for (const [status, error] of [
  ["failed", "contract_runtime_failed"],
  ["mismatched", "contract_runtime_mismatched"],
  ["missing_configuration", "contract_runtime_unavailable"],
])
  for (const [action, payload] of [
    ["upgrade", { building: "workshop" }],
    ["complete_upgrade", { slot: 0 }],
    ["boost", { slot: 0, hours: 1 }],
    ["prestige", {}],
    ["market_buy", { resource: "wood", amount: 1, limit: 1n, deadline: 1 }],
    ["market_sell", { resource: "wood", amount: 1, limit: 1n, deadline: 1 }],
  ])
    test(`runtime ${status} prevents MiniKit dispatch for ${action}`, async () => {
      let sent = 0;
      const adapter = createWorldGameAdapter({
        walletAddress: "0x1111111111111111111111111111111111111111",
        contractAddress: "0x3333333333333333333333333333333333333333",
        worldTokenAddress: "0x4444444444444444444444444444444444444444",
        readState: async () => ({
          registered: true,
          constructions: [
            { slot: 0, pending: true, completesAt: 9_999_999_999_999 },
          ],
          chainTimestamp: 0,
        }),
        runtimeGate: () =>
          requireVerifiedContractRuntime(async () => ({
            ok: true,
            json: async () => ({ runtimeVerification: { status } }),
          })),
        preflight: async () => undefined,
        pollReceipt: async () => ({ receipt: { status: "success" } }),
        miniKit: { sendTransaction: async () => (sent += 1) },
      });
      await assert.rejects(adapter.execute(action, payload), new RegExp(error));
      assert.equal(sent, 0);
    });

test("V1-safe claim and train actions bypass the runtime gate", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  let gateRequests = 0;
  let sends = 0;
  const adapter = createWorldGameAdapter({
    walletAddress: wallet,
    contractAddress: "0x3333333333333333333333333333333333333333",
    readState: async () => ({
      registered: true,
      chainTimestamp: 2_000,
      gatherAvailableAt: 0,
      unclaimed: { wood: 1, clay: 0, stone: 0, gold: 0 },
      resources: { wood: 100, clay: 100, stone: 100, gold: 100 },
      troops: { spear: 0, archer: 0, rider: 0 },
      buildings: { barracks: 1 },
    }),
    runtimeGate: async () => {
      gateRequests += 1;
      throw new Error("contract_runtime_mismatched");
    },
    preflight: async () => undefined,
    pollReceipt: async () => ({ receipt: { status: "success" } }),
    miniKit: {
      sendTransaction: async () => {
        sends += 1;
        return {
          executedWith: "minikit",
          data: {
            status: "success",
            userOpHash: `0x${String(sends).padStart(64, "0")}`,
            from: wallet,
          },
        };
      },
    },
  });
  await adapter.execute("claim");
  await adapter.execute("train", { troop: "spear", amount: 1 });
  assert.equal(gateRequests, 0);
  assert.equal(sends, 2);
});
