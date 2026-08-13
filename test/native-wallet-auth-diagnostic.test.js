import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  generateNativeWalletAuthNonce,
  normalizeNativeWalletAuthError,
  normalizeNativeWalletAuthResult,
} from '../src/lib/native-wallet-auth-diagnostic.js';

test('native Wallet Auth diagnostic nonce is local, alphanumeric, and protocol-length', () => {
  const nonce = generateNativeWalletAuthNonce();
  assert.match(nonce, /^[A-Za-z0-9]{8,}$/);
  assert.equal(nonce.length, 64);
  assert.throws(() => generateNativeWalletAuthNonce(3), /at least 8/);
});

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

test('native Wallet Auth diagnostic contains only the minimal native command call', async () => {
  const [component, helper, page] = await Promise.all([
    readFile(new URL('../src/components/NativeWalletAuthDiagnostic/index.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/native-wallet-auth-diagnostic.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/page.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(component, /const expirationTime = new Date\(Date\.now\(\) \+ 5 \* 60_000\);/);
  assert.match(component, /await MiniKit\.walletAuth\(\{ nonce, statement: "Bestätige deine World-Wallet für den Civilization-Spielzugang\.", expirationTime \}\)/);
  assert.equal((component.match(/MiniKit\.walletAuth\(/g) ?? []).length, 1);
  assert.match(helper, /crypto\.getRandomValues\(values\)/);
  assert.doesNotMatch(component, /\b(notBefore|requestId|fallback)\b/);
  assert.doesNotMatch(component, /\b(fetch|XMLHttpRequest|axios)\b|\bsignIn\s*\(|\bverify\w*\s*\(|\bredirect\s*\(|location\.assign\s*\(|\/api\/auth\/|\b(useSession|AuthButton)\b|\bauth\s*\(/);
  assert.doesNotMatch(component, /\b(cookie|cookies|session|localStorage|sessionStorage|analytics|track)\b|World\s*ID|\b(transaction|sendTransaction)\b/);
  assert.doesNotMatch(component, /MiniKit\.(install|isInstalled|isInWorldApp)|isCommandAvailable|useMiniKit|\b(readiness|ready|commandVersion|versionCheck)\b/);
  assert.doesNotMatch(component, /console\.(log|warn|error)/);
  assert.doesNotMatch(component, /setTimeout\s*\(/);
  assert.match(page, /<NativeWalletAuthDiagnostic \/>/);
  assert.doesNotMatch(page, /AuthButton|\bauth\s*\(|\bredirect\s*\(/);
});
