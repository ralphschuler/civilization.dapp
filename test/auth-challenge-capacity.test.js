import assert from "node:assert/strict";
import test from "node:test";
import {
  createWalletAuthChallenge,
  MAX_OUTSTANDING_WALLET_AUTH_CHALLENGES,
  MAX_OUTSTANDING_WALLET_AUTH_CHALLENGES_PER_SOURCE,
} from "../src/lib/auth-challenge.js";

test("challenge creation serializes global and privacy-key source capacity", async () => {
  let call;
  await assert.rejects(
    createWalletAuthChallenge({
      sourceKey: "a".repeat(64),
      query: async (sql, parameters) => {
        call = { sql, parameters };
        return { rowCount: 0, rows: [] };
      },
    }),
    /wallet_auth_challenge_capacity_exhausted/,
  );
  assert.match(call.sql, /pg_advisory_xact_lock/);
  assert.match(call.sql, /consumed_at IS NULL AND expires_at > now\(\)/);
  assert.match(call.sql, /source_key = \$5/);
  assert.match(call.sql, /DELETE FROM wallet_auth_challenges/);
  assert.equal(call.parameters.at(-2), MAX_OUTSTANDING_WALLET_AUTH_CHALLENGES);
  assert.equal(
    call.parameters.at(-1),
    MAX_OUTSTANDING_WALLET_AUTH_CHALLENGES_PER_SOURCE,
  );
});

test("challenge creation rejects a raw or absent source identity", async () => {
  await assert.rejects(
    createWalletAuthChallenge({ query: async () => assert.fail("no query") }),
    /wallet_auth_challenge_source_unavailable/,
  );
  await assert.rejects(
    createWalletAuthChallenge({
      sourceKey: "198.51.100.12",
      query: async () => assert.fail("no query"),
    }),
    /wallet_auth_challenge_source_unavailable/,
  );
});
