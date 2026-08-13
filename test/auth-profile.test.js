import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Credentials provider consumes only the opaque ticket and creates an empty-profile wallet session', async () => {
  const source = await readFile(new URL('../src/auth/index.ts', import.meta.url), 'utf8');
  assert.match(source, /ticket: \{ label: 'Login ticket', type: 'text' \}/);
  assert.match(source, /await consumeWalletLoginTicket\(ticket\)/);
  assert.match(source, /loginId: walletLogin\.loginId/);
  assert.match(source, /token\.loginId = user\.loginId/);
  assert.match(source, /session\.user\.loginId = token\.loginId as string/);
  assert.match(source, /session: \{ strategy: 'jwt', maxAge: 3600 \}/);
  assert.match(source, /walletAddress,/);
  assert.match(source, /username: ''/);
  assert.match(source, /profilePictureUrl: ''/);
  assert.doesNotMatch(source, /signedNonce|finalPayloadJson|verifySiweMessage|consumeAuthChallenge|MiniKit\.getUserInfo/);
});
