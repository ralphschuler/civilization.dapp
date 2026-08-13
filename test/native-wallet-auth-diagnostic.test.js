import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeNativeWalletAuthError,
  normalizeNativeWalletAuthResult,
} from '../src/lib/native-wallet-auth-diagnostic.js';

test('native Wallet Auth diagnostic errors retain useful primitive fields without stack traces', () => {
  assert.deepEqual(normalizeNativeWalletAuthError({
    name: 'WalletAuthError',
    message: 'Rejected',
    code: 'user_rejected',
    reason: 'cancelled',
    details: 'User closed the prompt',
    stack: 'private stack trace',
  }), {
    name: 'WalletAuthError',
    message: 'Rejected',
    code: 'user_rejected',
    reason: 'cancelled',
    details: 'User closed the prompt',
  });
  assert.deepEqual(normalizeNativeWalletAuthError('bridge unavailable'), {
    name: 'Error', message: 'bridge unavailable',
  });
  assert.deepEqual(normalizeNativeWalletAuthError(new Error('bridge unavailable')), {
    name: 'Error', message: 'bridge unavailable',
  });
  assert.deepEqual(normalizeNativeWalletAuthError({ details: { private: true }, stack: 'secret' }), {
    name: 'Error', message: 'Unknown error',
  });
  let getterCalls = 0;
  assert.deepEqual(normalizeNativeWalletAuthError(Object.defineProperty({}, 'message', {
    get() { getterCalls += 1; return 'must not be read'; },
  })), { name: 'Error', message: 'Unknown error' });
  assert.equal(getterCalls, 0);
});

test('native Wallet Auth result keeps documented callback fields without invoking getters', () => {
  let getterCalls = 0;
  const result = {
    executedWith: 'minikit',
    data: Object.defineProperties({}, {
      address: { value: '0xabc', enumerable: true },
      message: { value: 'signed message', enumerable: true },
      signature: { value: '0xsig', enumerable: true },
      version: { value: 2, enumerable: true },
      futureField: { get() { getterCalls += 1; return 'must not be read'; }, enumerable: true },
    }),
  };
  assert.deepEqual(normalizeNativeWalletAuthResult(result), {
    executedWith: 'minikit',
    data: { version: 2, address: '0xabc', message: 'signed message', signature: '0xsig' },
  });
  assert.equal(getterCalls, 0);
});

test('native Wallet Auth diagnostic fetches and validates the server nonce before its one native call', async () => {
  const [component, page, route] = await Promise.all([
    readFile(new URL('../src/components/NativeWalletAuthDiagnostic/index.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/wallet-auth/nonce/route.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(component, /await fetch\('\/api\/wallet-auth\/nonce', \{\s*cache: 'no-store',\s*credentials: 'same-origin',\s*\}\)/);
  assert.ok(component.indexOf("fetch('/api/wallet-auth/nonce'") < component.indexOf('MiniKit.walletAuth('));
  assert.match(component, /if \(!response\.ok\) throw new Error\('Nonce konnte nicht geladen werden\.'\);/);
  assert.match(component, /const challenge: unknown = await response\.json\(\);/);
  assert.match(component, /typeof issuedNonce !== 'string'\s*\|\| !\/\^\[A-Za-z0-9\]\{8,\}\$\/.test\(issuedNonce\)\s*\|\| typeof expires_at !== 'number'\s*\|\| !Number\.isFinite\(expires_at\)\s*\|\| expires_at <= Date\.now\(\)/);
  assert.match(component, /nonce = issuedNonce;/);
  assert.match(component, /const expirationTime = new Date\(expires_at\);/);
  assert.match(component, /await MiniKit\.walletAuth\(\{ nonce, statement: "Bestätige deine World-Wallet für den Civilization-Spielzugang\.", expirationTime \}\)/);
  assert.match(component, /setDiagnostic\(\{ \.\.\.\(nonce \? \{ nonce \} : \{\}\), error: normalizeNativeWalletAuthError\(error\) \}\);/);
  assert.equal((component.match(/MiniKit\.walletAuth\(/g) ?? []).length, 1);
  assert.doesNotMatch(component, /generateNativeWalletAuthNonce/);
  assert.doesNotMatch(component, /Date\.now\(\) \+ 5 \* 60_000/);
  assert.doesNotMatch(component, /\b(notBefore|requestId|fallback)\b/);
  assert.doesNotMatch(component, /XMLHttpRequest|axios|\bsignIn\s*\(|\bverify\w*\s*\(|\bredirect\s*\(|location\.assign\s*\(|\/api\/auth\/|\b(useSession|AuthButton)\b|\bauth\s*\(/);
  assert.doesNotMatch(component, /\b(cookie|cookies|session|localStorage|sessionStorage|analytics|track)\b|World\s*ID|\b(transaction|sendTransaction)\b/);
  assert.doesNotMatch(component, /MiniKit\.(install|isInstalled|isInWorldApp)|isCommandAvailable|useMiniKit|\b(readiness|ready|commandVersion|versionCheck)\b/);
  assert.doesNotMatch(component, /console\.(log|warn|error)/);
  assert.doesNotMatch(component, /setTimeout\s*\(/);
  assert.match(page, /<NativeWalletAuthDiagnostic \/>/);
  assert.doesNotMatch(page, /AuthButton|\bauth\s*\(|\bredirect\s*\(/);

  assert.match(route, /import \{ randomBytes \} from 'node:crypto';/);
  assert.match(route, /export const runtime = 'nodejs';/);
  assert.match(route, /export const dynamic = 'force-dynamic';/);
  assert.match(route, /export function GET\(\)/);
  assert.doesNotMatch(route, /export (async )?function (POST|PUT|PATCH|DELETE)/);
  assert.match(route, /randomBytes\(32\)\.toString\('hex'\)/);
  assert.match(route, /const expires_at = issuedAt \+ 5 \* 60_000;/);
  assert.match(route, /Response\.json\(\{ nonce, expires_at \}, \{ headers: noStoreHeaders \}\)/);
  assert.match(route, /const noStoreHeaders = \{ 'Cache-Control': 'no-store' \};/);
  assert.match(route, /Response\.json\(\{ error: 'wallet_auth_unavailable' \}, \{\s*status: 503,\s*headers: noStoreHeaders,/);
  assert.doesNotMatch(route, /createAuthChallenge|createHmac|HMAC|requestId|auth\b|session|cookie|redirect|proof|transaction|Map/);
});
