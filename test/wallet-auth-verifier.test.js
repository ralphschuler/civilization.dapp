import test from 'node:test';
import assert from 'node:assert/strict';
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
const payload = {
  address: lowerAddress,
  message: 'signed SIWE message',
  signature: '0x1234',
};

test('legacy verifier passes exact nonce and German statement and returns checksum address', async () => {
  const calls = [];
  const address = await verifyLegacyWalletAuthPayload(payload, nonce, LEGACY_WALLET_AUTH_STATEMENT, async (...args) => {
    calls.push(args);
    return { isValid: true, siweMessageData: { address: lowerAddress } };
  });

  assert.equal(address, checksumAddress);
  assert.deepEqual(calls, [[payload, nonce, LEGACY_WALLET_AUTH_STATEMENT]]);
});

test('legacy verifier rejects a valid signature whose SIWE address differs from callback address', async () => {
  const address = await verifyLegacyWalletAuthPayload(payload, nonce, LEGACY_WALLET_AUTH_STATEMENT, async () => ({
    isValid: true,
    siweMessageData: { address: '0x0000000000000000000000000000000000000001' },
  }));
  assert.equal(address, null);
});

test('legacy verifier rejects malformed and oversized callback fields before invoking verifier', async () => {
  let calls = 0;
  const verifier = async () => { calls += 1; return { isValid: true, siweMessageData: { address: lowerAddress } }; };
  for (const invalid of [
    null,
    [],
    { ...payload, address: 'not-an-address' },
    { ...payload, message: '' },
    { ...payload, message: 'x'.repeat(16_385) },
    { ...payload, signature: 'x'.repeat(1_025) },
  ]) {
    assert.equal(await verifyLegacyWalletAuthPayload(invalid, nonce, LEGACY_WALLET_AUTH_STATEMENT, verifier), null);
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
