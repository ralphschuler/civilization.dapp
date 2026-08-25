import assert from "node:assert/strict";
import test from "node:test";
import { getAddress } from "viem";
import {
  isSiweRejectedError,
  verifyWalletForDirectGame,
} from "../src/lib/direct-wallet-game-flow.js";

const address = getAddress("0x52908400098527886e0f7030069857d2e4169ee7");

test("WalletAuth requests a fresh nonce through the mutating no-store endpoint", async () => {
  const calls = [];
  const result = await verifyWalletForDirectGame({
    isInstalled: () => true,
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

test("MiniKit preflight stops before the nonce request and WalletAuth", async () => {
  let fetches = 0;
  let walletAuthCalls = 0;
  await assert.rejects(
    verifyWalletForDirectGame({
      isInstalled: () => false,
      fetchImpl: async () => {
        fetches += 1;
        return new Response();
      },
      walletAuth: async () => {
        walletAuthCalls += 1;
        return {};
      },
    }),
    /minikit_unavailable/,
  );
  assert.equal(fetches, 0);
  assert.equal(walletAuthCalls, 0);
});

test("a nonce failure stops before WalletAuth and verification", async () => {
  const calls = [];
  let walletAuthCalls = 0;
  await assert.rejects(
    verifyWalletForDirectGame({
      isInstalled: () => true,
      fetchImpl: async (url) => {
        calls.push(url);
        return new Response(null, { status: 503 });
      },
      walletAuth: async () => {
        walletAuthCalls += 1;
        return {};
      },
    }),
    /nonce_unavailable/,
  );
  assert.deepEqual(calls, ["/api/wallet-auth/nonce"]);
  assert.equal(walletAuthCalls, 0);
});

test("WalletAuth cancellation, malformed SDK output, SIWE rejection, and generic verification failures stay distinct at their boundary", async () => {
  const challenge = new Response(
    JSON.stringify({
      nonce: "aBcD1234efGH5678",
      expires_at: Date.now() + 60_000,
    }),
    { status: 200 },
  );
  const base = {
    isInstalled: () => true,
    fetchImpl: async () => challenge.clone(),
  };
  await assert.rejects(
    verifyWalletForDirectGame({
      ...base,
      walletAuth: async () => {
        throw { code: "user_rejected" };
      },
    }),
    (error) => error?.code === "user_rejected",
  );
  await assert.rejects(
    verifyWalletForDirectGame({ ...base, walletAuth: async () => ({}) }),
    /native_wallet_auth_failed/,
  );
  await assert.rejects(
    verifyWalletForDirectGame({
      ...base,
      fetchImpl: async (url) => {
        if (url.endsWith("/nonce")) return challenge.clone();
        return new Response(
          JSON.stringify({
            isValid: false,
            error: "wallet_auth_verification_failed",
          }),
          { status: 400 },
        );
      },
      walletAuth: async () => ({
        executedWith: "minikit",
        data: { address, message: "message", signature: "signature" },
      }),
    }),
    isSiweRejectedError,
  );
  for (const verificationResponse of [
    new Response(
      JSON.stringify({
        isValid: false,
        error: "wallet_auth_verification_failed",
      }),
      { status: 503 },
    ),
    new Response(
      JSON.stringify({ isValid: false, error: "invalid_or_expired_nonce" }),
      { status: 400 },
    ),
  ]) {
    await assert.rejects(
      verifyWalletForDirectGame({
        ...base,
        fetchImpl: async (url) =>
          url.endsWith("/nonce")
            ? challenge.clone()
            : verificationResponse.clone(),
        walletAuth: async () => ({
          executedWith: "minikit",
          data: { address, message: "message", signature: "signature" },
        }),
      }),
      /wallet_auth_verification_failed/,
    );
  }
  await assert.rejects(
    verifyWalletForDirectGame({
      ...base,
      walletAuth: async () => ({
        executedWith: "minikit",
        data: { address, message: "message", signature: "signature" },
      }),
    }),
    /wallet_auth_verification_failed/,
  );
});

test("ordinary errors cannot impersonate the SIWE rejection signal", () => {
  assert.equal(isSiweRejectedError(new Error("siwe_rejected")), false);
});
