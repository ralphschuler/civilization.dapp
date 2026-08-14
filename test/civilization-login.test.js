import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createAndConfirmWalletSession,
  safeLoginErrorCode,
  sessionMatchesWalletLogin,
} from '../src/lib/civilization-login-session.js';

const wallet = '0x52908400098527886E0F7030069857D2E4169EE7';
const loginId = '11111111-1111-4111-8111-111111111111';

test('fresh session readback requires the exact checksum-equivalent wallet and login ID', () => {
  assert.equal(sessionMatchesWalletLogin({ user: { walletAddress: wallet.toLowerCase(), loginId } }, wallet, loginId), true);
  assert.equal(sessionMatchesWalletLogin({ user: { walletAddress: wallet, loginId: '22222222-2222-4222-8222-222222222222' } }, wallet, loginId), false);
  assert.equal(sessionMatchesWalletLogin({ user: { walletAddress: '0xabc', loginId } }, wallet, loginId), false);
});

test('credentials failure, failed readback, and identity mismatch fail closed without returning secrets', async () => {
  const input = { getSession: async () => null, signOut: async () => undefined, walletAddress: wallet, loginId, ticket: 'S'.repeat(43) };
  for (const signInResult of [{ ok: true, error: 'CredentialsSignin' }, { ok: false, error: null }]) {
    assert.deepEqual(await createAndConfirmWalletSession({ ...input, signIn: async () => signInResult }), { sessionSuccess: false, error: 'session_creation_failed' });
  }
  assert.deepEqual(await createAndConfirmWalletSession({ ...input, signIn: async () => ({ ok: true }), getSession: async () => { throw new Error('private'); } }), { sessionSuccess: false, error: 'wallet_auth_unavailable' });
  assert.deepEqual(await createAndConfirmWalletSession({ ...input, signIn: async () => ({ ok: true }), getSession: async () => ({ user: { walletAddress: wallet, loginId: '22222222-2222-4222-822222222222' } }) }), { sessionSuccess: false, error: 'session_identity_mismatch' });
  assert.equal(safeLoginErrorCode('private stack'), 'wallet_auth_unavailable');
});

test('Stage 8 login preserves the exact native-to-ticket-to-confirmed-navigation order and blocks regressions', async () => {
  const [component, page, helper, guard, layout, game, rp] = await Promise.all([
    readFile(new URL('../src/components/CivilizationLogin/index.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/civilization-login-session.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/civilization-session-guard.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/(protected)/layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/(protected)/game/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/rp-signature/route.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /getAuthorizedWallet\(await auth\(\)\).*redirect\('\/game'\)/s);
  assert.match(page, /WORLD MINI APP/);
  assert.match(page, /Baue dein Dorf\./);
  assert.match(page, /Melde dich mit deiner World Wallet an und öffne dein geschütztes Reich\./);
  assert.match(page, /townhall\.png/);
  assert.match(page, /width=\{418\} height=\{418\} preload/);
  assert.match(page, /<CivilizationLogin \/>/);
  assert.match(component, /await fetch\('\/api\/wallet-auth\/nonce', \{\s*cache: 'no-store',\s*credentials: 'same-origin',\s*\}\)/);
  assert.match(component, /const expirationTime = new Date\(expires_at\);/);
  assert.match(component, /await MiniKit\.walletAuth\(\{ nonce, statement, expirationTime \}\)/);
  assert.equal((component.match(/MiniKit\.walletAuth\(/g) ?? []).length, 1);
  assert.match(component, /result\.executedWith !== 'minikit'/);
  assert.match(component, /typeof \(payload as \{ address\?: unknown \}\)\.address !== 'string'/);
  assert.match(component, /body: JSON\.stringify\(\{ nonce, payload: result\.data \}\)/);
  assert.ok(component.indexOf("fetch('/api/wallet-auth/nonce'") < component.indexOf('MiniKit.walletAuth('));
  assert.ok(component.indexOf('MiniKit.walletAuth(') < component.indexOf("fetch('/api/wallet-auth/verify'"));
  assert.ok(component.indexOf('createAndConfirmWalletSession') < component.indexOf("window.location.assign('/game')"));
  assert.match(helper, /signIn\('credentials', \{ redirect: false, redirectTo: '\/', ticket \}\)/);
  assert.match(helper, /!signInResult \|\| !signInResult\.ok \|\| signInResult\.error/);
  assert.match(helper, /getSession\(\{ broadcast: false \}\)/);
  assert.match(helper, /sessionMatchesWalletLogin\(session, walletAddress, loginId\)/);
  assert.match(helper, /signOut\(\{ redirect: false \}\)\.catch/);
  assert.match(guard, /isAddress\(walletAddress\).*loginIdPattern\.test\(loginId\)/s);
  for (const source of [layout, game, rp]) assert.match(source, /getAuthorizedWallet/);
  assert.doesNotMatch(component, /\b(proof|profile|transaction|signedNonce|finalPayloadJson|requestId|notBefore)\b/);
  assert.doesNotMatch(component, /MiniKit\.(install|isInstalled|isInWorldApp)|isCommandAvailable|useMiniKit|localStorage|sessionStorage|console\.|setTimeout|AuthButton|wallet\/index/);
  assert.doesNotMatch(component, /<pre|JSON\.stringify\(\s*(data|verification|error|phase)/);
  assert.doesNotMatch(component, /Diagnose|SIWE|Auth\.js|Fehlercode/);
  assert.match(component, /aria-busy=\{pending\}/);
  assert.match(component, /role=\{error \? 'alert' : 'status'\}.*aria-atomic="true"/s);
  assert.doesNotMatch(page, /AuthButton|NativeWalletAuthDiagnostic/);
});
