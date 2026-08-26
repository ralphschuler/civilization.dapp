import test from "node:test";
import assert from "node:assert/strict";
import {
  collectCompletionReadyNotices,
  completionNotificationKey,
  completionNotificationsEnabled,
  retainCompletionReadyNotices,
  setCompletionNotificationsEnabled,
} from "../src/world-game/completion-notifications.js";

const identity = {
  walletAddress: "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa",
  contractAddress: "0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb",
};

function storage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
  };
}

function snapshot({
  pending = true,
  completesAt = 1_000,
  slot = 0,
  chainTimestamp = 1_000,
} = {}) {
  return {
    chainTimestamp,
    constructions: [{ pending, completesAt, slot, buildingId: "timber" }],
  };
}

test("completion notices require a pending construction due by the chain timestamp", () => {
  const store = storage();
  setCompletionNotificationsEnabled(identity, true, store);
  assert.deepEqual(
    collectCompletionReadyNotices(
      identity,
      snapshot({ chainTimestamp: 999 }),
      store,
    ),
    [],
  );
  assert.deepEqual(
    collectCompletionReadyNotices(
      identity,
      snapshot({ pending: false }),
      store,
    ),
    [],
  );
  assert.equal(
    collectCompletionReadyNotices(identity, snapshot(), store).length,
    1,
  );
});

test("completion notices de-duplicate repeated fresh snapshots", () => {
  const store = storage();
  setCompletionNotificationsEnabled(identity, true, store);
  assert.equal(
    collectCompletionReadyNotices(identity, snapshot(), store).length,
    1,
  );
  assert.deepEqual(
    collectCompletionReadyNotices(identity, snapshot(), store),
    [],
  );
});

test("a visible due notice vanishes on a fresh pending-but-not-due snapshot", () => {
  const store = storage();
  setCompletionNotificationsEnabled(identity, true, store);
  const due = collectCompletionReadyNotices(identity, snapshot(), store);
  assert.equal(due.length, 1);
  assert.deepEqual(
    retainCompletionReadyNotices(
      due,
      snapshot({ chainTimestamp: 999 }),
    ),
    [],
  );
  assert.deepEqual(
    retainCompletionReadyNotices(due, snapshot({ chainTimestamp: null })),
    [],
  );
});

test("dedupe keys are independent for wallet, contract, slot, and completion time", () => {
  const base = { ...identity, slot: 0, completesAt: 1_000 };
  const keys = new Set([
    completionNotificationKey(base),
    completionNotificationKey({ ...base, walletAddress: "0xCc" }),
    completionNotificationKey({ ...base, contractAddress: "0xDd" }),
    completionNotificationKey({ ...base, slot: 1 }),
    completionNotificationKey({ ...base, completesAt: 1_001 }),
  ]);
  assert.equal(keys.size, 5);
});

test("opt-out clears notification state and unavailable or corrupt storage fails closed", () => {
  const store = storage();
  setCompletionNotificationsEnabled(identity, true, store);
  collectCompletionReadyNotices(identity, snapshot(), store);
  assert.equal(
    setCompletionNotificationsEnabled(identity, false, store),
    false,
  );
  assert.equal(completionNotificationsEnabled(identity, store), false);
  setCompletionNotificationsEnabled(identity, true, store);
  assert.equal(
    collectCompletionReadyNotices(identity, snapshot(), store).length,
    1,
  );

  const broken = {
    getItem() {
      throw new Error("storage_unavailable");
    },
    setItem() {
      throw new Error("storage_unavailable");
    },
  };
  assert.equal(completionNotificationsEnabled(identity, broken), false);
  assert.deepEqual(
    collectCompletionReadyNotices(identity, snapshot(), broken),
    [],
  );
});

test("a completion or reorg-like snapshot cannot claim an upgrade completed", () => {
  const store = storage();
  setCompletionNotificationsEnabled(identity, true, store);
  const completed = { chainTimestamp: 2_000, constructions: [] };
  const reverted = snapshot({ pending: false, chainTimestamp: 2_000 });
  assert.deepEqual(
    collectCompletionReadyNotices(identity, completed, store),
    [],
  );
  assert.deepEqual(
    collectCompletionReadyNotices(identity, reverted, store),
    [],
  );
});
