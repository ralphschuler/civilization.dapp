import assert from "node:assert/strict";
import test from "node:test";
import { parseSiweMessage } from "@worldcoin/minikit-js/siwe";
import { getAddress } from "viem";
import { hasValidSiweBinding } from "../src/auth/siwe-binding.js";
import { WALLET_AUTH_STATEMENT } from "../src/lib/auth-challenge.js";
import {
  readWalletAuthJson,
  verifyWalletAuthRequest,
} from "../src/lib/wallet-auth-verify-core.js";
import * as verifierExports from "../src/lib/wallet-auth-verifier.js";
import {
  isWalletAuthNonce,
  verifyWalletAuthPayload,
} from "../src/lib/wallet-auth-verifier.js";

const authUrl = "https://civilization.example.invalid";
const address = getAddress("0x52908400098527886e0f7030069857d2e4169ee7");
const nonce = "aBcD1234efGH5678";
const payload = {
  address,
  message: "signed SIWE message",
  signature: "0xsigned",
};
const binding = (overrides = {}) => ({
  domain: "civilization.example.invalid",
  uri: "https://civilization.example.invalid/",
  version: "1",
  chainId: 480,
  ...overrides,
});

test("verifier passes the exact stored nonce and statement to MiniKit SIWE", async () => {
  let received;
  const result = await verifyWalletAuthPayload(
    payload,
    nonce,
    WALLET_AUTH_STATEMENT,
    async (...args) => {
      received = args;
      return {
        isValid: true,
        siweMessageData: { address, ...binding(), chain_id: 480 },
      };
    },
    authUrl,
  );

  assert.equal(result, address);
  assert.deepEqual(received, [payload, nonce, WALLET_AUTH_STATEMENT]);
  assert.equal(
    await verifyWalletAuthPayload(
      payload,
      nonce,
      "different statement",
      async () => {
        throw new Error("must not verify");
      },
      authUrl,
    ),
    null,
  );
});

test("verifier rejects a callback address different from the SIWE signer", async () => {
  const result = await verifyWalletAuthPayload(
    payload,
    nonce,
    WALLET_AUTH_STATEMENT,
    async () => ({
      isValid: true,
      siweMessageData: {
        address: "0x1111111111111111111111111111111111111111",
        ...binding(),
        chain_id: 480,
      },
    }),
    authUrl,
  );
  assert.equal(result, null);
});

test("SIWE binding accepts MiniKit parser domain and numeric or string World Chain ID", () => {
  const parsed = parseSiweMessage(
    [
      "https://civilization.example.invalid wants you to sign in with your Ethereum account:",
      address,
      "",
      WALLET_AUTH_STATEMENT,
      "",
      "URI: https://civilization.example.invalid/",
      "Version: 1",
      "Chain ID: 480",
      `Nonce: ${nonce}`,
      "Issued At: 2026-08-11T23:21:00.000Z",
    ].join("\n"),
  );
  assert.equal(parsed.domain, authUrl);
  assert.equal(parsed.chain_id, "480");
  assert.equal(
    hasValidSiweBinding(
      {
        domain: parsed.domain,
        uri: parsed.uri,
        version: parsed.version,
        chainId: parsed.chain_id,
      },
      authUrl,
    ),
    true,
  );
  assert.equal(hasValidSiweBinding(binding({ chainId: 480 }), authUrl), true);
});

test("SIWE binding rejects every mismatched origin, URI, version, and chain binding", () => {
  for (const invalid of [
    { domain: "https://civilization.example.invalid/" },
    { domain: "http://civilization.example.invalid" },
    { domain: "civilization.example.invalid:443" },
    { domain: "evil.civilization.example.invalid" },
    { uri: "http://civilization.example.invalid/" },
    { uri: "https://civilization.example.invalid:444/" },
    { uri: "https://evil.example.invalid/" },
    { uri: "not a URI" },
    { version: "01" },
    { version: 1 },
    { chainId: 1 },
    { chainId: "1" },
    { chainId: "0480" },
    { chainId: 480n },
  ]) {
    assert.equal(hasValidSiweBinding(binding(invalid), authUrl), false);
  }
});

test("malformed and oversized JSON stop before challenge lookup or verifier", async () => {
  let takes = 0;
  let verifies = 0;
  const dependencies = {
    takeChallenge: async () => {
      takes += 1;
      return { statement: WALLET_AUTH_STATEMENT };
    },
    verifyPayload: async () => {
      verifies += 1;
      return address;
    },
  };
  assert.deepEqual(await verifyWalletAuthRequest({}, dependencies), {
    kind: "malformed",
  });
  assert.deepEqual(
    await verifyWalletAuthRequest({ nonce: "bad", payload }, dependencies),
    { kind: "malformed" },
  );
  assert.equal(takes, 0);
  assert.equal(verifies, 0);

  const oversized = new Request("https://example.invalid", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(16_384) }),
  });
  assert.deepEqual(await readWalletAuthJson(oversized), { kind: "too_large" });
  assert.equal(verifies, 0);
});

test("JSON content type and content-length limits are enforced before verification", async () => {
  const wrongContentType = new Request("https://example.invalid", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  assert.deepEqual(await readWalletAuthJson(wrongContentType), {
    kind: "malformed",
  });

  const declaredOversized = new Request("https://example.invalid", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "16385" },
    body: "{}",
  });
  assert.deepEqual(await readWalletAuthJson(declaredOversized), {
    kind: "too_large",
  });
});

test("a challenge is consumed before a failed verification and cannot be replayed", async () => {
  let available = true;
  let takes = 0;
  const dependencies = {
    takeChallenge: async (requestedNonce) => {
      takes += 1;
      assert.equal(requestedNonce, nonce);
      if (!available) return null;
      available = false;
      return { statement: WALLET_AUTH_STATEMENT };
    },
    verifyPayload: async () => null,
  };
  const request = { nonce, payload };
  assert.deepEqual(await verifyWalletAuthRequest(request, dependencies), {
    kind: "verification_failed",
  });
  assert.deepEqual(await verifyWalletAuthRequest(request, dependencies), {
    kind: "invalid_nonce",
  });
  assert.equal(takes, 2);
});

test("active verifier exposes only the WalletAuth-named API", () => {
  assert.equal(isWalletAuthNonce(nonce), true);
  assert.equal(isWalletAuthNonce("bad"), false);
  assert.deepEqual(Object.keys(verifierExports).sort(), [
    "isWalletAuthNonce",
    "verifyWalletAuthPayload",
  ]);
});
