import assert from "node:assert/strict";
import test from "node:test";
import { getAddress } from "viem";
import { verifyWalletForDirectGame } from "../src/lib/direct-wallet-game-flow.js";

const address = getAddress("0x52908400098527886e0f7030069857d2e4169ee7");

test("WalletAuth requests a fresh nonce through the mutating no-store endpoint", async () => {
  const calls = [];
  const result = await verifyWalletForDirectGame({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/nonce"))
        return new Response(
          JSON.stringify({
            nonce: "aBcD1234efGH5678",
            expires_at: Date.now() + 60_000,
          }),
          { status: 200 },
        );
      return new Response(JSON.stringify({ isValid: true, address }), {
        status: 200,
      });
    },
    walletAuth: async () => ({
      executedWith: "minikit",
      data: { address, message: "message", signature: "signature" },
    }),
  });
  assert.equal(result, address);
  assert.equal(calls[0].url, "/api/wallet-auth/nonce");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.cache, "no-store");
});
