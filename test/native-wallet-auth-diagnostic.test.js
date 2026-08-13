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

test('Stage 5 diagnostic uses persistent challenge, one native call, then same-origin verification', async () => {
  const [component, page, nonceRoute, verifyRoute, verifyCore, challenge] = await Promise.all([
    readFile(new URL('../src/components/NativeWalletAuthDiagnostic/index.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/wallet-auth/nonce/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/wallet-auth/verify/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/wallet-auth-verify-core.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/auth-challenge.js', import.meta.url), 'utf8'),
  ]);

  assert.match(component, /await fetch\('\/api\/wallet-auth\/nonce', \{\s*cache: 'no-store',\s*credentials: 'same-origin',\s*\}\)/);
  assert.ok(component.indexOf("fetch('/api/wallet-auth/nonce'") < component.indexOf('MiniKit.walletAuth('));
  assert.match(component, /if \(!response\.ok\) throw new Error\('Nonce konnte nicht geladen werden\.'\);/);
  assert.match(component, /const challenge: unknown = await response\.json\(\);/);
  assert.match(component, /typeof issuedNonce !== 'string'\s*\|\| !\/\^\[A-Za-z0-9\]\{8,\}\$\/.test\(issuedNonce\)\s*\|\| typeof expires_at !== 'number'\s*\|\| !Number\.isFinite\(expires_at\)\s*\|\| expires_at <= Date\.now\(\)/);
  assert.match(component, /nonce = issuedNonce;/);
  assert.match(component, /const expirationTime = new Date\(expires_at\);/);
  assert.match(component, /await MiniKit\.walletAuth\(\{ nonce, statement, expirationTime \}\)/);
  assert.match(component, /result\.executedWith !== 'minikit'/);
  assert.doesNotMatch(component, /payload as \{ status\?: unknown \}/);
  assert.match(component, /typeof \(payload as \{ address\?: unknown \}\)\.address !== 'string'/);
  assert.match(component, /await fetch\('\/api\/wallet-auth\/verify', \{\s*method: 'POST',\s*credentials: 'same-origin',\s*cache: 'no-store',\s*headers: \{ 'Content-Type': 'application\/json', 'Cache-Control': 'no-store' \},\s*body: JSON\.stringify\(\{ nonce, payload: result\.data \}\),/);
  assert.ok(component.indexOf('MiniKit.walletAuth(') < component.indexOf("fetch('/api/wallet-auth/verify'"));
  assert.match(component, /setDiagnostic\(\{ nonce, result: nativeResult, verification: verificationResult \}\);/);
  assert.equal((component.match(/MiniKit\.walletAuth\(/g) ?? []).length, 1);
  assert.doesNotMatch(component, /generateNativeWalletAuthNonce/);
  assert.doesNotMatch(component, /Date\.now\(\) \+ 5 \* 60_000/);
  assert.doesNotMatch(component, /\b(notBefore|requestId|fallback)\b/);
  assert.doesNotMatch(component, /XMLHttpRequest|axios|\bsignIn\s*\(|\bredirect\s*\(|location\.assign\s*\(|\/api\/auth\/|\b(useSession|AuthButton)\b|\bauth\s*\(/);
  assert.doesNotMatch(component, /\b(cookie|cookies|session|localStorage|sessionStorage|analytics|track)\b|World\s*ID|\b(transaction|sendTransaction)\b/);
  assert.doesNotMatch(component, /MiniKit\.(install|isInstalled|isInWorldApp)|isCommandAvailable|useMiniKit|\b(readiness|ready|commandVersion|versionCheck)\b/);
  assert.doesNotMatch(component, /console\.(log|warn|error)/);
  assert.doesNotMatch(component, /setTimeout\s*\(/);
  assert.match(page, /<NativeWalletAuthDiagnostic \/>/);
  assert.doesNotMatch(page, /AuthButton|\bauth\s*\(|\bredirect\s*\(/);

  assert.match(nonceRoute, /createLegacyWalletAuthChallenge/);
  assert.match(nonceRoute, /export const runtime = 'nodejs';/);
  assert.match(nonceRoute, /export const dynamic = 'force-dynamic';/);
  assert.match(nonceRoute, /export async function GET\(\)/);
  assert.match(nonceRoute, /Response\.json\(\{ nonce: challenge\.nonce, expires_at \}, \{ headers: noStoreHeaders \}\)/);
  assert.match(nonceRoute, /const noStoreHeaders = \{ 'Cache-Control': 'no-store' \};/);
  assert.match(nonceRoute, /wallet_auth_unavailable/);
  assert.doesNotMatch(nonceRoute, /randomBytes|createHmac|HMAC|requestId|session|cookie|redirect|proof|transaction|Map/);

  assert.match(challenge, /LEGACY_WALLET_AUTH_STATEMENT = 'Bestätige deine World-Wallet für den Civilization-Spielzugang\.'/);
  assert.match(challenge, /LEGACY_WALLET_AUTH_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(challenge, /crypto\.randomBytes\(32\)\.toString\('hex'\)/);
  assert.match(challenge, /nonce_hash/);
  assert.match(challenge, /nonceHash\(nonce\)/);
  assert.match(challenge, /UPDATE wallet_auth_challenges SET consumed_at = now\(\) WHERE nonce_hash = \$1 AND statement = \$2 AND consumed_at IS NULL AND expires_at > now\(\) RETURNING statement, expires_at/);
  assert.doesNotMatch(challenge, /nonce[^\n]*INSERT INTO/);

  assert.match(verifyRoute, /export const runtime = 'nodejs';/);
  assert.match(verifyRoute, /export const dynamic = 'force-dynamic';/);
  assert.match(verifyRoute, /invalid_wallet_auth_request/);
  assert.match(verifyRoute, /wallet_auth_request_too_large/);
  assert.match(verifyRoute, /invalid_or_expired_nonce/);
  assert.match(verifyRoute, /wallet_auth_verification_failed/);
  assert.match(verifyRoute, /Response\.json\(\{ isValid: true, address: result\.address \}/);
  assert.match(verifyRoute, /verifyWalletAuthRequest/);
  assert.match(verifyRoute, /readWalletAuthJson/);
  assert.ok(verifyCore.indexOf('await take(nonce)') < verifyCore.indexOf('await verify(candidate.payload, nonce, challenge.statement)'));
  assert.doesNotMatch(verifyRoute, /console\.|requestId|notBefore|session|cookie|redirect|proof|transaction|signIn|\/game/);
});
