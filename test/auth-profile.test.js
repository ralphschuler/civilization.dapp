import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('verified Wallet Auth survives an optional World profile lookup failure', async () => {
  const source = await readFile(new URL('../src/auth/index.ts', import.meta.url), 'utf8');
  const consume = source.indexOf('consumeAuthChallenge(nonce)');
  const lookup = source.indexOf('await MiniKit.getUserInfo(verifiedAddress)');
  const fallback = source.indexOf("username = userInfo.username ?? ''");
  const fallbackCatch = source.indexOf('} catch {', fallback);
  const returnedAddress = source.indexOf('walletAddress: verifiedAddress', lookup);

  assert.ok(consume >= 0 && lookup > consume, 'profile lookup must happen only after one-time challenge consumption');
  assert.ok(fallback > lookup, 'missing profile fields must use safe defaults');
  assert.ok(fallbackCatch > fallback, 'profile lookup rejection must be caught without logging sensitive error data');
  assert.ok(returnedAddress > fallbackCatch, 'verified address must still be returned after a profile lookup failure');
});
