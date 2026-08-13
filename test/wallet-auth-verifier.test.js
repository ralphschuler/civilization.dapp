import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSiweMessage } from '@worldcoin/minikit-js/siwe';
import { getAddress } from 'viem';
import {
  verifyLegacyWalletAuthPayload,
} from '../src/lib/wallet-auth-verifier.js';
import { LEGACY_WALLET_AUTH_STATEMENT } from '../src/lib/auth-challenge.js';
import {
  MAX_WALLET_AUTH_BODY_BYTES,
  readWalletAuthJson,
  verifyWalletAuthRequest,
} from '../src/lib/wallet-auth-verify-core.js';

const nonce = 'aBcD1234efGH5678';
const lowerAddress = '0x52908400098527886e0f7030069857d2e4169ee7';
const checksumAddress = getAddress(lowerAddress);
const authUrl = 'https://civilization.nyphon.de';
const payload = {
  address: lowerAddress,
  message: 'signed SIWE message',
  signature: '0x1234',
};

const validSiweBinding = {
  domain: 'https://civilization.nyphon.de',
  uri: 'https://civilization.nyphon.de/',
  version: '1',
  chain_id: '480',
};

function verifiedPayload(overrides = {}) {
  return {
    isValid: true,
    siweMessageData: { address: lowerAddress, ...validSiweBinding, ...overrides },
  };
}

test('legacy verifier passes exact nonce and German statement and returns checksum address', async () => {
  const calls = [];
  const address = await verifyLegacyWalletAuthPayload(payload, nonce, LEGACY_WALLET_AUTH_STATEMENT, async (...args) => {
    calls.push(args);
    return verifiedPayload();
  }, authUrl);

  assert.equal(address, checksumAddress);
  assert.deepEqual(calls, [[payload, nonce, LEGACY_WALLET_AUTH_STATEMENT]]);
});

test('legacy verifier rejects a valid signature whose SIWE address differs from callback address', async () => {
  const address = await verifyLegacyWalletAuthPayload(payload, nonce, LEGACY_WALLET_AUTH_STATEMENT, async () => (
    verifiedPayload({ address: '0x0000000000000000000000000000000000000001' })
  ), authUrl);
  assert.equal(address, null);
});

test('legacy verifier accepts MiniKit parser binding and documented host/numeric binding', async () => {
  const parsed = parseSiweMessage([
    'https://civilization.nyphon.de wants you to sign in with your Ethereum account:',
    lowerAddress,
    '',
    LEGACY_WALLET_AUTH_STATEMENT,
    '',
    'URI: https://civilization.nyphon.de/',
    'Version: 1',
    'Chain ID: 480',
    `Nonce: ${nonce}`,
    'Issued At: 2026-08-13T20:00:00.000Z',
  ].join('\n'));
  assert.equal(await verifyLegacyWalletAuthPayload(payload, nonce, LEGACY_WALLET_AUTH_STATEMENT, async () => ({
    isValid: true,
    siweMessageData: parsed,
  }), authUrl), checksumAddress);
  assert.equal(await verifyLegacyWalletAuthPayload(payload, nonce, LEGACY_WALLET_AUTH_STATEMENT, async () => (
    verifiedPayload({ domain: 'civilization.nyphon.de', uri: 'https://civilization.nyphon.de/game', chain_id: 480 })
  ), authUrl), checksumAddress);
});

test('legacy verifier rejects every invalid SIWE application binding', async () => {
  const invalidBindings = [
    { domain: undefined },
    { domain: 'evil.civilization.nyphon.de' },
    { domain: 'civilization.nyphon.de.evil.example' },
    { uri: undefined },
    { uri: 'http://civilization.nyphon.de/' },
    { uri: 'https://civilization.nyphon.de:444/' },
    { uri: 'https://evil.example/' },
    { version: '2' },
    { version: undefined },
    { chain_id: 481 },
    { chain_id: '481' },
    { chain_id: '0480' },
    { chain_id: undefined },
  ];

  for (const binding of invalidBindings) {
    assert.equal(await verifyLegacyWalletAuthPayload(payload, nonce, LEGACY_WALLET_AUTH_STATEMENT, async () => (
      verifiedPayload(binding)
    ), authUrl), null, JSON.stringify(binding));
  }

  for (const invalidAuthUrl of [null, 'not a URL', 'http://civilization.nyphon.de']) {
    await assert.rejects(
      verifyLegacyWalletAuthPayload(payload, nonce, LEGACY_WALLET_AUTH_STATEMENT, async () => verifiedPayload(), invalidAuthUrl),
      /wallet_auth_configuration_unavailable/,
    );
  }
});

test('legacy verifier rejects malformed and oversized callback fields before invoking verifier', async () => {
  let calls = 0;
  const verifier = async () => { calls += 1; return verifiedPayload(); };
  for (const invalid of [
    null,
    [],
    { ...payload, address: 'not-an-address' },
    { ...payload, message: '' },
    { ...payload, message: 'x'.repeat(16_385) },
    { ...payload, signature: 'x'.repeat(1_025) },
  ]) {
    assert.equal(await verifyLegacyWalletAuthPayload(invalid, nonce, LEGACY_WALLET_AUTH_STATEMENT, verifier, authUrl), null);
  }
  assert.equal(calls, 0);
});

test('verification core burns a shared challenge before verification and rejects replay', async () => {
  let taken = false;
  let verifyCalls = 0;
  const dependencies = {
    takeChallenge: async () => {
      if (taken) return null;
      taken = true;
      return { statement: LEGACY_WALLET_AUTH_STATEMENT, expiresAt: new Date() };
    },
    verifyPayload: async () => {
      verifyCalls += 1;
      return null;
    },
  };
  const request = { nonce, payload };
  assert.deepEqual(await verifyWalletAuthRequest(request, dependencies), { kind: 'verification_failed' });
  assert.deepEqual(await verifyWalletAuthRequest(request, dependencies), { kind: 'invalid_nonce' });
  assert.equal(verifyCalls, 1);
});

test('verification core burns its challenge before a verifier configuration failure', async () => {
  let taken = false;
  const dependencies = {
    takeChallenge: async () => {
      if (taken) return null;
      taken = true;
      return { statement: LEGACY_WALLET_AUTH_STATEMENT, expiresAt: new Date() };
    },
    verifyPayload: async () => { throw new Error('wallet_auth_configuration_unavailable'); },
  };
  const request = { nonce, payload };
  await assert.rejects(verifyWalletAuthRequest(request, dependencies), /wallet_auth_configuration_unavailable/);
  assert.deepEqual(await verifyWalletAuthRequest(request, dependencies), { kind: 'invalid_nonce' });
});

test('verification JSON reader enforces content type and byte limit while streaming', async () => {
  const valid = new Request('https://civilization.example/api/wallet-auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ nonce, payload }),
  });
  assert.deepEqual(await readWalletAuthJson(valid), {
    kind: 'json',
    value: { nonce, payload },
  });

  const wrongType = new Request('https://civilization.example/api/wallet-auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '{}',
  });
  assert.deepEqual(await readWalletAuthJson(wrongType), { kind: 'malformed' });

  const oversized = new Request('https://civilization.example/api/wallet-auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: `{"value":"${'x'.repeat(MAX_WALLET_AUTH_BODY_BYTES)}"}`,
  });
  assert.deepEqual(await readWalletAuthJson(oversized), { kind: 'too_large' });
});
