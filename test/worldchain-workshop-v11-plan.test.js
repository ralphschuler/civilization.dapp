import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData } from "viem";
import {
  PROXY,
  REQUIRED_TIMELOCK_DELAY_SECONDS,
  createWorkshopV11Operation,
} from "../scripts/plan-worldchain-workshop-v11.mjs";

test("Workshop V1.1 bundle schedules exactly one empty-data ProxyAdmin upgrade", () => {
  const operation = createWorkshopV11Operation({
    timelock: "0x1111111111111111111111111111111111111111",
    admin: "0x2222222222222222222222222222222222222222",
    implementation: "0x3333333333333333333333333333333333333333",
    minDelay: REQUIRED_TIMELOCK_DELAY_SECONDS,
  });
  assert.equal(operation.label, "upgrade proxy to Workshop V1.1 only");
  assert.equal(operation.delay, REQUIRED_TIMELOCK_DELAY_SECONDS);
  assert.equal(operation.target, "0x2222222222222222222222222222222222222222");
  const decoded = decodeFunctionData({
    abi: [
      {
        type: "function",
        name: "upgradeAndCall",
        inputs: [{ type: "address" }, { type: "address" }, { type: "bytes" }],
      },
    ],
    data: operation.data,
  });
  assert.deepEqual(decoded.args, [
    PROXY,
    "0x3333333333333333333333333333333333333333",
    "0x",
  ]);
  assert.equal(
    operation.schedule.to,
    "0x1111111111111111111111111111111111111111",
  );
  assert.equal(
    operation.execute.to,
    "0x1111111111111111111111111111111111111111",
  );
});
