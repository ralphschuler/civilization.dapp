import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData } from "viem";
import {
  INVENTORY,
  MARKET,
  PROXY,
  RESERVE,
  assertMarketConstants,
  createTimelockOperations,
  main,
} from "../scripts/plan-worldchain-market-v2.mjs";

const timelock = "0x1111111111111111111111111111111111111111";
const admin = "0x2222222222222222222222222222222222222222";
const implementation = "0x3333333333333333333333333333333333333333";

test("V2 economics are locked to reviewed prices, inventory, and reserve", () => {
  assert.doesNotThrow(() => assertMarketConstants());
  assert.throws(
    () => assertMarketConstants([{ ...MARKET[0] }]),
    /exactly Wood/,
  );
  assert.throws(
    () => assertMarketConstants(MARKET, INVENTORY + 1n),
    /inventory or reserve/,
  );
  assert.throws(
    () =>
      assertMarketConstants([
        { ...MARKET[0], priceWeiPerUnit: 1n },
        ...MARKET.slice(1),
      ]),
    /reviewed V2 economics/,
  );
});

test("V2 bundle encodes upgrade, all three configurations, and exact reserve", () => {
  const actions = createTimelockOperations({
    timelock,
    admin,
    implementation,
    minDelay: 259200n,
  });
  assert.equal(actions.length, 5);
  assert.equal(actions[0].target, admin);
  assert.equal(actions[0].delay, 259200n);
  assert.match(actions[0].schedule.data, /^0x[0-9a-f]+$/);
  const expected = MARKET.map((entry) => [
    entry.id,
    entry.priceWeiPerUnit,
    INVENTORY,
  ]);
  for (const [index, tuple] of expected.entries()) {
    const decoded = decodeFunctionData({
      abi: [
        {
          type: "function",
          name: "configureMarket",
          inputs: [{ type: "uint8" }, { type: "uint256" }, { type: "uint256" }],
        },
      ],
      data: actions[index + 1].data,
    });
    assert.deepEqual(decoded.args, tuple);
  }
  const reserve = decodeFunctionData({
    abi: [
      {
        type: "function",
        name: "transfer",
        inputs: [{ type: "address" }, { type: "uint256" }],
      },
    ],
    data: actions[4].data,
  });
  assert.equal(
    actions[4].target,
    PROXY,
    "CGOLD reserve transfer must target the CivilizationGame proxy",
  );
  assert.deepEqual(reserve.args, [
    "0x0E6689d0649Ad9037465d178231b10F18518D2b0",
    RESERVE,
  ]);
});

test("planner refuses live-send flags before parsing RPC or signer inputs", async () => {
  const originalWrite = process.stdout.write;
  const originalExitCode = process.exitCode;
  let output = "";
  process.stdout.write = (chunk) => {
    output += chunk;
    return true;
  };
  try {
    const result = await main(["--send"]);
    assert.equal(result, undefined);
    assert.equal(process.exitCode, 1);
    assert.match(output, /never sends or executes transactions/);
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = originalExitCode;
  }
});
