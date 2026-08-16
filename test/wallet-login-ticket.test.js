import test from "node:test";
import assert from "node:assert/strict";
import {
  consumeWalletLoginTicket,
  hashWalletLoginTicket,
  WALLET_LOGIN_TICKET_TTL_MS,
} from "../src/lib/wallet-login-ticket.js";
import { verifyAndMintWalletLoginTicket } from "../src/lib/wallet-auth-session-core.js";

test("ticket hashing is deterministic, one-way shaped, and ticket TTL is at most one minute", () => {
  const ticket = "A".repeat(43);
  const hash = hashWalletLoginTicket(ticket);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, ticket);
  assert.equal(hash, hashWalletLoginTicket(ticket));
  assert.ok(
    WALLET_LOGIN_TICKET_TTL_MS > 0 && WALLET_LOGIN_TICKET_TTL_MS <= 60_000,
  );
});

test("a login ticket is minted only after verified SIWE success", async () => {
  let minted = 0;
  const mintWalletLoginTicket = async (address) => {
    minted += 1;
    assert.equal(address, "0x52908400098527886E0F7030069857D2E4169EE7");
    return {
      ticket: "B".repeat(43),
      loginId: "11111111-1111-4111-8111-111111111111",
    };
  };
  const success = await verifyAndMintWalletLoginTicket(
    {},
    {
      verifyWalletAuthRequest: async () => ({
        kind: "success",
        address: "0x52908400098527886E0F7030069857D2E4169EE7",
      }),
      mintWalletLoginTicket,
    },
  );
  assert.deepEqual(success, {
    kind: "success",
    address: "0x52908400098527886E0F7030069857D2E4169EE7",
    ticket: "B".repeat(43),
    loginId: "11111111-1111-4111-8111-111111111111",
  });

  for (const kind of ["malformed", "invalid_nonce", "verification_failed"]) {
    assert.deepEqual(
      await verifyAndMintWalletLoginTicket(
        {},
        {
          verifyWalletAuthRequest: async () => ({ kind }),
          mintWalletLoginTicket,
        },
      ),
      { kind },
    );
  }
  assert.equal(minted, 1);
});

test("malformed ticket does not query the database and a valid row is bound to database wallet and login ID", async () => {
  let calls = 0;
  const query = async () => {
    calls += 1;
    return { rowCount: 0, rows: [] };
  };
  assert.equal(await consumeWalletLoginTicket("not-a-ticket", query), null);
  assert.equal(calls, 0);

  let sql;
  const result = await consumeWalletLoginTicket(
    "C".repeat(43),
    async (issuedSql, params) => {
      sql = issuedSql;
      assert.equal(params.length, 1);
      return {
        rowCount: 1,
        rows: [
          {
            wallet_address: "0x52908400098527886e0f7030069857d2e4169ee7",
            login_id: "11111111-1111-4111-8111-111111111111",
          },
        ],
      };
    },
    "0x0000000000000000000000000000000000000001",
  );
  assert.deepEqual(result, {
    walletAddress: "0x52908400098527886E0F7030069857D2E4169EE7",
    loginId: "11111111-1111-4111-8111-111111111111",
  });
  assert.match(sql, /consumed_at IS NULL/);
  assert.match(sql, /expires_at > now\(\)/);
  assert.match(sql, /RETURNING wallet_address, login_id/);
});

test("expired, replayed, and concurrent ticket takes fail closed and only one atomic take succeeds", async () => {
  const noRow = async () => ({ rowCount: 0, rows: [] });
  assert.equal(await consumeWalletLoginTicket("D".repeat(43), noRow), null);

  let consumed = false;
  const atomicTake = async () => {
    if (consumed) return { rowCount: 0, rows: [] };
    consumed = true;
    return {
      rowCount: 1,
      rows: [
        {
          wallet_address: "0x0000000000000000000000000000000000000001",
          login_id: "22222222-2222-4222-8222-222222222222",
        },
      ],
    };
  };
  const outcomes = await Promise.all([
    consumeWalletLoginTicket("E".repeat(43), atomicTake),
    consumeWalletLoginTicket("E".repeat(43), atomicTake),
  ]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.deepEqual(outcomes.find(Boolean), {
    walletAddress: "0x0000000000000000000000000000000000000001",
    loginId: "22222222-2222-4222-8222-222222222222",
  });
});

test("malformed mint output is rejected without allowing it to override verified identity", async () => {
  await assert.rejects(
    verifyAndMintWalletLoginTicket(
      {},
      {
        verifyWalletAuthRequest: async () => ({
          kind: "success",
          address: "0x52908400098527886E0F7030069857D2E4169EE7",
        }),
        mintWalletLoginTicket: async () => ({
          ticket: "F".repeat(43),
          loginId: "11111111-1111-4111-8111-111111111111",
          address: "0x0000000000000000000000000000000000000001",
        }),
      },
    ),
    /invalid_wallet_login_ticket/,
  );
});
