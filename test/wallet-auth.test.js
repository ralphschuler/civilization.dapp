import test from "node:test";
import assert from "node:assert/strict";
import { WalletAuthNonceStore, WALLET_AUTH_STATEMENT, verifyWalletAuthPayload } from "../server/wallet-auth.js";

const walletAddress = "0x2222222222222222222222222222222222222222";

test("wallet SIWE nonces are short-lived and single-use", () => {
  let now = 1_000;
  const store = new WalletAuthNonceStore({ ttlMs: 100, now: () => now, random: () => "a1b2c3d4e5f6a7b8" });
  const issued = store.issue();
  assert.deepEqual(issued, { nonce: "a1b2c3d4e5f6a7b8", expiresAt: 1_100 });
  assert.ok(store.consume(issued.nonce));
  assert.equal(store.consume(issued.nonce), null, "a replay is rejected");
  const expired = store.issue();
  now = 1_100;
  assert.equal(store.consume(expired.nonce), null, "expired nonce is rejected");
});

test("SIWE verifier requires exact statement and returns the signed address only", async () => {
  const calls = [];
  const address = await verifyWalletAuthPayload({
    nonce: "a1b2c3d4e5f6a7b8",
    payload: { address: walletAddress, message: "signed-message", signature: "0xsigned" },
    verifier: async (...args) => {
      calls.push(args);
      return { isValid: true, siweMessageData: { address: walletAddress } };
    },
  });
  assert.equal(address, walletAddress);
  assert.deepEqual(calls[0].slice(1), ["a1b2c3d4e5f6a7b8", WALLET_AUTH_STATEMENT]);
});

test("SIWE verifier rejects a mismatched signed address", async () => {
  await assert.rejects(() => verifyWalletAuthPayload({
    nonce: "a1b2c3d4e5f6a7b8",
    payload: { address: walletAddress, message: "signed-message", signature: "0xsigned" },
    verifier: async () => ({ isValid: true, siweMessageData: { address: "0x3333333333333333333333333333333333333333" } }),
  }), /wallet_auth_verification_failed/);
});
