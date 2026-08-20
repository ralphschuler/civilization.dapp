import assert from "node:assert/strict";
import test from "node:test";
import { getAddress } from "viem";
import {
  WALLET_AUTH_SESSION_COOKIE,
  createWalletAuthSession,
  expiredWalletAuthSessionCookie,
  invalidateWalletAuthSession,
  readWalletAuthSession,
  walletAuthSessionCookie,
  walletAuthSessionTokenFromCookie,
} from "../src/lib/wallet-auth-session.js";

const address = getAddress("0x52908400098527886e0f7030069857d2e4169ee7");

test("a verified checksum wallet creates an opaque, secure short-lived session", async () => {
  let call;
  const session = await createWalletAuthSession(address, {
    query: async (sql, parameters) => {
      call = { sql, parameters };
      return { rowCount: 1, rows: [] };
    },
  });

  assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(session.address, address);
  assert.match(call.sql, /INSERT INTO wallet_auth_sessions/);
  assert.match(call.sql, /DELETE FROM wallet_auth_sessions/);
  assert.notEqual(call.parameters[0], session.token);
  assert.equal(call.parameters[1], address);
  const cookie = walletAuthSessionCookie(session.token, session.expiresAt);
  assert.match(cookie, new RegExp(`^${WALLET_AUTH_SESSION_COOKIE}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=900/);
  assert.doesNotMatch(cookie, /0x529084|signature|secret/i);
});

test("tampered cookie and non-checksum database address fail closed", async () => {
  let queries = 0;
  assert.equal(
    await readWalletAuthSession(`${WALLET_AUTH_SESSION_COOKIE}=tampered`, {
      query: async () => {
        queries += 1;
        return { rowCount: 1, rows: [{ wallet_address: address }] };
      },
    }),
    null,
  );
  assert.equal(queries, 0);

  const token = "a".repeat(43);
  assert.equal(
    await readWalletAuthSession(`${WALLET_AUTH_SESSION_COOKIE}=${token}`, {
      query: async () => ({
        rowCount: 1,
        rows: [{ wallet_address: address.toLowerCase() }],
      }),
    }),
    null,
  );
  assert.match(expiredWalletAuthSessionCookie(), /Max-Age=0/);
});

test("logout deletes the server record and accepts only the named cookie", async () => {
  const token = "b".repeat(43);
  let parameters;
  assert.equal(
    await invalidateWalletAuthSession(
      `other=value; ${WALLET_AUTH_SESSION_COOKIE}=${token}`,
      {
        query: async (sql, values) => {
          assert.match(sql, /^DELETE FROM wallet_auth_sessions/);
          parameters = values;
          return { rowCount: 1, rows: [] };
        },
      },
    ),
    true,
  );
  assert.equal(parameters.length, 1);
  assert.notEqual(parameters[0], token);
  assert.equal(walletAuthSessionTokenFromCookie("other=value"), null);
});
