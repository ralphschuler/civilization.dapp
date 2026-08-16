import test from "node:test";
import assert from "node:assert/strict";
import { validUserOpHash } from "../src/world-game/actions.js";
import { registerWorldIdWithMiniKit } from "../src/lib/world-id-registration.js";

const wallet = "0x1111111111111111111111111111111111111111";
const contract = "0x2222222222222222222222222222222222222222";
const hash = `0x${"a".repeat(64)}`;
const registration = {
  nullifierHash: "1",
  nonce: "2",
  signalHash: "3",
  expiresAtMin: "4",
  issuerSchemaId: "5",
  proof: ["1", "2", "3", "4", "5"],
};

test("World ID registration validates every UserOp hash", async () => {
  assert.equal(validUserOpHash(hash), true);
  assert.equal(validUserOpHash("0x1234"), false);
  await assert.rejects(
    registerWorldIdWithMiniKit({
      walletAddress: wallet,
      contractAddress: contract,
      registration,
      pendingUserOpHash: "0x1234",
      pollReceipt: async () => ({ receipt: { status: "success" } }),
      readState: async () => ({ registered: false }),
    }),
    /invalid_pending_user_op/,
  );
});

test("failed or reverted World ID receipt clears the resumable hash", async () => {
  let pending = hash;
  await assert.rejects(
    registerWorldIdWithMiniKit({
      walletAddress: wallet,
      contractAddress: contract,
      registration,
      pendingUserOpHash: pending,
      onPendingUserOpHash: (value) => {
        pending = value;
      },
      pollReceipt: async () => ({ receipt: { status: "reverted" } }),
      readState: async () => ({ registered: false }),
    }),
    /transaction_failed/,
  );
  assert.equal(pending, null);
});

test("timeout resumes the same World ID UserOp and reads back contract state", async () => {
  let pending = null;
  let sends = 0;
  let polls = 0;
  let reads = 0;
  const options = {
    walletAddress: wallet,
    contractAddress: contract,
    registration,
    onPendingUserOpHash: (value) => {
      pending = value;
    },
    readState: async () => ({ registered: ++reads >= 3 }),
    pollReceipt: async (value) => {
      assert.equal(value, hash);
      polls += 1;
      if (polls === 1) throw new Error("receipt_timeout");
      return { receipt: { status: "success" } };
    },
    miniKit: {
      sendTransaction: async () => {
        sends += 1;
        return {
          executedWith: "minikit",
          data: { status: "success", userOpHash: hash, from: wallet },
        };
      },
    },
  };
  await assert.rejects(registerWorldIdWithMiniKit(options), /receipt_timeout/);
  assert.equal(pending, hash);
  const result = await registerWorldIdWithMiniKit({
    ...options,
    pendingUserOpHash: pending,
  });
  assert.equal(result.state.registered, true);
  assert.equal(pending, null);
  assert.equal(sends, 1);
  assert.equal(
    reads,
    3,
    "each gesture and confirmed receipt read contract state",
  );
});
