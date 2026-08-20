import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupWalletAuthAbuseControls,
  takeWalletAuthRateLimit,
  walletAuthClientSource,
  walletAuthPrivacyKey,
} from "../src/lib/wallet-auth-abuse-controls.js";

const secret = "s".repeat(32);

test("client source trusts forwarded addresses only under an explicit proxy contract", () => {
  const headers = new Headers({
    "x-forwarded-for": "198.51.100.12, 10.0.0.8",
  });
  assert.equal(walletAuthClientSource(headers, 1), "198.51.100.12");
  assert.equal(walletAuthClientSource(headers, 0), "anonymous");
  assert.equal(
    walletAuthClientSource(new Headers({ "x-forwarded-for": "evil" }), 1),
    "anonymous",
  );
  assert.equal(walletAuthClientSource(new Headers(), 1), "anonymous");
});

test("persisted client identities are keyed, not raw source addresses", () => {
  const key = walletAuthPrivacyKey("198.51.100.12", secret);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.notEqual(key, "198.51.100.12");
  assert.notEqual(key, walletAuthPrivacyKey("198.51.100.13", secret));
  assert.throws(() => walletAuthPrivacyKey("source", "short"));
});

test("shared client and global budgets return a stable positive retry interval", async () => {
  const calls = [];
  const values = [
    { count: 9, expires_at_epoch: 120, now_epoch: 61 },
    { count: 1, expires_at_epoch: 120, now_epoch: 61 },
  ];
  const result = await takeWalletAuthRateLimit(
    "nonce",
    "198.51.100.12",
    secret,
    {
      query: async (sql, parameters) => {
        calls.push({ sql, parameters });
        return { rows: [values.shift()] };
      },
    },
  );
  assert.deepEqual(result, { allowed: false, retryAfter: 59 });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ sql }) => sql.includes("ON CONFLICT")));
  assert.ok(
    calls.every(({ parameters }) => !parameters.includes("198.51.100.12")),
  );
  assert.ok(calls.some(({ parameters }) => parameters[0] === "nonce:global"));
});

test("abuse-control retention deletes expired counter and metric rows", async () => {
  const calls = [];
  await cleanupWalletAuthAbuseControls({
    query: async (sql, parameters) => {
      calls.push({ sql, parameters });
      return { rows: [], rowCount: 0 };
    },
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /wallet_auth_rate_limits/);
  assert.match(calls[1].sql, /wallet_auth_metrics/);
  assert.deepEqual(
    calls.map(({ parameters }) => parameters),
    [[86400], [86400]],
  );
});
