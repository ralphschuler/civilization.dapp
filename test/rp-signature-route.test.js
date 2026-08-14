import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isRpSigningConfigured, validateRpSignatureRequest } from '../src/lib/rp-signature-core.js';
import { MAX_WALLET_AUTH_BODY_BYTES, readWalletAuthJson } from '../src/lib/wallet-auth-verify-core.js';

const wallet = '0x52908400098527886E0F7030069857D2E4169EE7';
const key = `0x${'a'.repeat(64)}`;

test('public RP request accepts only fixed play action and checksum-normalizable wallet signals', () => {
  assert.deepEqual(validateRpSignatureRequest({ action: 'play', signal: wallet.toLowerCase() }, { action: 'play' }), { kind: 'success', signal: wallet });
  assert.deepEqual(validateRpSignatureRequest({ action: 'other', signal: wallet }, { action: 'play' }), { kind: 'invalid_action' });
  for (const body of [null, [], 'bad', { action: 'play' }, { action: 'play', signal: 'not-an-address' }]) {
    assert.notEqual(validateRpSignatureRequest(body, { action: 'play' }).kind, 'success');
  }
});

test('public RP configuration fails closed', () => {
  assert.equal(isRpSigningConfigured({ signingKey: key, rpId: 'rp_a84548cb908798cf', liveRpId: 'rp_a84548cb908798cf' }), true);
  assert.equal(isRpSigningConfigured({ signingKey: '', rpId: 'rp_a84548cb908798cf', liveRpId: 'rp_a84548cb908798cf' }), false);
  assert.equal(isRpSigningConfigured({ signingKey: key, rpId: 'rp_wrong', liveRpId: 'rp_a84548cb908798cf' }), false);
});

test('public RP route uses a bounded JSON reader and has no Auth.js, cookies, logs, or mutable signing context', async () => {
  const [route, contract] = await Promise.all([
    readFile(new URL('../src/app/api/rp-signature/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../contracts/src/CivilizationGame.sol', import.meta.url), 'utf8'),
  ]);
  assert.match(route, /readWalletAuthJson\(req\)/);
  assert.match(route, /LIVE_WORLD_ID_ACTION/);
  assert.match(route, /signRequest\(\{ action: LIVE_WORLD_ID_ACTION, signingKeyHex: SIGNING_KEY! \}\)/);
  assert.match(route, /'Cache-Control': 'no-store'/);
  assert.doesNotMatch(route, /from '\@\/auth'|\bauth\s*\(|req\.json\(\)|console\.|Set-Cookie|cookie|ticket|wallet-auth\/verify/);
  assert.match(contract, /signalHash != _hashToField\(abi\.encodePacked\(msg\.sender\)\)/);
  assert.match(contract, /function registerWorldId\(/);
  assert.match(contract, /modifier onlyRegistered/);
});

test('bounded reader rejects an oversized public RP body without request.json buffering', async () => {
  const request = new Request('https://example.test/api/rp-signature', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: `{"action":"play","signal":"${'x'.repeat(MAX_WALLET_AUTH_BODY_BYTES)}"}`,
  });
  assert.deepEqual(await readWalletAuthJson(request), { kind: 'too_large' });
});
