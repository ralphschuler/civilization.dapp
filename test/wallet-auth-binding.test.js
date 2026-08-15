import test from "node:test";
import assert from "node:assert/strict";
import { parseSiweMessage } from "@worldcoin/minikit-js/siwe";
import { hasValidSiweBinding } from "../src/auth/siwe-binding.js";

const authUrl = "https://civilization.nyphon.de";
const binding = (overrides = {}) => ({
  domain: "civilization.nyphon.de",
  uri: "https://civilization.nyphon.de/game",
  version: "1",
  chainId: 480,
  ...overrides,
});

test("SIWE binding accepts only the World Chain numeric and runtime string chain IDs", () => {
  assert.equal(hasValidSiweBinding(binding({ chainId: 480 }), authUrl), true);
  assert.equal(hasValidSiweBinding(binding({ chainId: "480" }), authUrl), true);
});

test("SIWE binding accepts the actual MiniKit 2 parser output", () => {
  const parsed = parseSiweMessage(
    [
      "https://civilization.nyphon.de wants you to sign in with your Ethereum account:",
      "0x2222222222222222222222222222222222222222",
      "",
      "Sign in to Civilization",
      "",
      "URI: https://civilization.nyphon.de/",
      "Version: 1",
      "Chain ID: 480",
      "Nonce: abcdefgh12345678",
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
});

test("SIWE binding accepts configured host or HTTPS origin domains only", () => {
  assert.equal(hasValidSiweBinding(binding(), authUrl), true);
  assert.equal(
    hasValidSiweBinding(binding({ domain: authUrl }), authUrl),
    true,
  );

  for (const invalid of [
    { domain: "https://civilization.nyphon.de/" },
    { domain: "http://civilization.nyphon.de" },
    { domain: "civilization.nyphon.de:443" },
    { domain: "evil.civilization.nyphon.de" },
    { uri: "http://civilization.nyphon.de/game" },
    { uri: "https://civilization.nyphon.de:444/game" },
    { uri: "https://evil.example/game" },
    { version: "01" },
    { chainId: "0480" },
    { chainId: 480n },
  ]) {
    assert.equal(
      hasValidSiweBinding(binding(invalid), authUrl),
      false,
      String(
        invalid.chainId ?? invalid.domain ?? invalid.uri ?? invalid.version,
      ),
    );
  }
});
