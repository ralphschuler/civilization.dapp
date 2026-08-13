import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createAndConfirmWalletSession,
  safeDiagnosticErrorCode,
  sessionMatchesWalletLogin,
} from '../src/lib/native-wallet-auth-diagnostic.js';

test('fresh session readback fails when a stale cookie has the same wallet but a different login ID', () => {
  const wallet = '0x52908400098527886E0F7030069857D2E4169EE7';
  assert.equal(sessionMatchesWalletLogin({ user: { walletAddress: wallet, loginId: '11111111-1111-4111-8111-111111111111' } }, wallet, '22222222-2222-4222-8222-222222222222'), false);
  assert.equal(sessionMatchesWalletLogin({ user: { walletAddress: wallet.toLowerCase(), loginId: '11111111-1111-4111-8111-111111111111' } }, wallet, '11111111-1111-4111-8111-111111111111'), true);
});

test('diagnostic Auth.js handling treats HTTP-ok CredentialsSignin and ok:false as failures', async () => {
  const input = { getSession: async () => null, signOut: async () => undefined, walletAddress: '0x52908400098527886E0F7030069857D2E4169EE7', loginId: '11111111-1111-4111-8111-111111111111', ticket: 'A'.repeat(43) };
  for (const signInResult of [{ ok: true, error: 'CredentialsSignin' }, { ok: false, error: null }]) {
    assert.deepEqual(await createAndConfirmWalletSession({ ...input, signIn: async () => signInResult }), { sessionSuccess: false, error: 'session_creation_failed' });
  }
});

test('diagnostic preserves completed SIWE state by returning safe errors after sign-in or readback throws', async () => {
  const input = { signOut: async () => undefined, walletAddress: '0x52908400098527886E0F7030069857D2E4169EE7', loginId: '11111111-1111-4111-8111-111111111111', ticket: 'A'.repeat(43) };
  assert.deepEqual(await createAndConfirmWalletSession({ ...input, signIn: async () => { throw new Error('private'); }, getSession: async () => null }), { sessionSuccess: false, error: 'session_creation_failed' });
  assert.deepEqual(await createAndConfirmWalletSession({ ...input, signIn: async () => ({ ok: true }), getSession: async () => { throw new Error('private'); } }), { sessionSuccess: false, error: 'wallet_auth_unavailable' });
  assert.equal(safeDiagnosticErrorCode('private stack'), 'wallet_auth_unavailable');
});

test('Auth.js diagnostic result never carries marker secrets supplied to its input', async () => {
  const ticketMarker = 'S'.repeat(43);
  const result = await createAndConfirmWalletSession({
    signIn: async () => ({ ok: false }),
    getSession: async () => null,
    signOut: async () => undefined,
    walletAddress: '0x52908400098527886E0F7030069857D2E4169EE7',
    loginId: '11111111-1111-4111-8111-111111111111',
    ticket: ticketMarker,
  });
  const visible = JSON.stringify(result);
  assert.doesNotMatch(visible, new RegExp(ticketMarker));
  assert.doesNotMatch(visible, /52908400098527886E0F7030069857D2E4169EE7/);
  assert.doesNotMatch(visible, /11111111-1111-4111-8111-111111111111/);
});

test('Stage 7 diagnostic preserves SIWE order, then creates and reads an Auth.js session without navigation', async () => {
  const [component, page, nonceRoute, verifyRoute, verifyCore, ticketStore, sessionCore, diagnosticCore] = await Promise.all([
    readFile(new URL('../src/components/NativeWalletAuthDiagnostic/index.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/wallet-auth/nonce/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/wallet-auth/verify/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/wallet-auth-verify-core.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/wallet-login-ticket.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/wallet-auth-session-core.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/native-wallet-auth-diagnostic.js', import.meta.url), 'utf8'),
  ]);

  assert.match(component, /await fetch\('\/api\/wallet-auth\/nonce', \{\s*cache: 'no-store',\s*credentials: 'same-origin',\s*\}\)/);
  assert.ok(component.indexOf("fetch('/api/wallet-auth/nonce'") < component.indexOf('MiniKit.walletAuth('));
  assert.match(component, /if \(!response\.ok\) throw new Error\('Nonce konnte nicht geladen werden\.'\);/);
  assert.match(component, /const challenge: unknown = await response\.json\(\);/);
  assert.match(component, /typeof issuedNonce !== 'string'\s*\|\| !\/\^\[A-Za-z0-9\]\{8,\}\$\/.test\(issuedNonce\)\s*\|\| typeof expires_at !== 'number'\s*\|\| !Number\.isFinite\(expires_at\)\s*\|\| expires_at <= Date\.now\(\)/);
  assert.match(component, /const nonce = issuedNonce;/);
  assert.match(component, /const expirationTime = new Date\(expires_at\);/);
  assert.match(component, /await MiniKit\.walletAuth\(\{ nonce, statement, expirationTime \}\)/);
  assert.match(component, /result\.executedWith !== 'minikit'/);
  assert.doesNotMatch(component, /payload as \{ status\?: unknown \}/);
  assert.match(component, /typeof \(payload as \{ address\?: unknown \}\)\.address !== 'string'/);
  assert.match(component, /await fetch\('\/api\/wallet-auth\/verify', \{\s*method: 'POST',\s*credentials: 'same-origin',\s*cache: 'no-store',\s*headers: \{ 'Content-Type': 'application\/json', 'Cache-Control': 'no-store' \},\s*body: JSON\.stringify\(\{ nonce, payload: result\.data \}\),/);
  assert.ok(component.indexOf('MiniKit.walletAuth(') < component.indexOf("fetch('/api/wallet-auth/verify'"));
  assert.match(component, /let siweVerified = false;/);
  assert.match(component, /siweVerified = true;/);
  assert.match(component, /createAndConfirmWalletSession/);
  assert.match(diagnosticCore, /signIn\('credentials', \{ redirect: false, redirectTo: '\/', ticket \}\)/);
  assert.match(diagnosticCore, /!signInResult \|\| !signInResult\.ok \|\| signInResult\.error/);
  assert.match(diagnosticCore, /getSession\(\{ broadcast: false \}\)/);
  assert.match(diagnosticCore, /sessionMatchesWalletLogin\(session, walletAddress, loginId\)/);
  assert.match(diagnosticCore, /signOut\(\{ redirect: false \}\)\.catch\(\(\) => undefined\)/);
  assert.match(diagnosticCore, /session_identity_mismatch/);
  assert.equal((component.match(/MiniKit\.walletAuth\(/g) ?? []).length, 1);
  assert.doesNotMatch(component, /generateNativeWalletAuthNonce/);
  assert.doesNotMatch(component, /Date\.now\(\) \+ 5 \* 60_000/);
  assert.doesNotMatch(component, /\b(notBefore|requestId|fallback)\b/);
  assert.doesNotMatch(component, /XMLHttpRequest|axios|location\.assign\s*\(|\/game|\b(useSession|AuthButton)\b/);
  assert.doesNotMatch(component, /localStorage|sessionStorage|analytics|track|console\.(log|warn|error)/);
  assert.doesNotMatch(component, /JSON\.stringify\(diagnostic|<pre/);
  assert.doesNotMatch(component, /MiniKit\.(install|isInstalled|isInWorldApp)|isCommandAvailable|useMiniKit|\b(readiness|ready|commandVersion|versionCheck)\b/);
  assert.doesNotMatch(component, /type Diagnostic \{[^}]*\b(nonce|ticket|address|message|signature|cookie)\b/);
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

  assert.match(ticketStore, /WALLET_LOGIN_TICKET_TTL_MS = 60_000/);
  assert.match(ticketStore, /crypto\.randomBytes\(32\)\.toString\('base64url'\)/);
  assert.match(ticketStore, /ticket_hash text PRIMARY KEY/);
  assert.match(ticketStore, /hashWalletLoginTicket\(ticket\)/);
  assert.match(ticketStore, /wallet_address/);
  assert.match(ticketStore, /login_id uuid NOT NULL/);
  assert.match(ticketStore, /crypto\.randomUUID\(\)/);
  assert.match(ticketStore, /RETURNING wallet_address, login_id/);
  assert.doesNotMatch(ticketStore, /ticket[^\n]*INSERT INTO/);

  assert.match(verifyRoute, /export const runtime = 'nodejs';/);
  assert.match(verifyRoute, /export const dynamic = 'force-dynamic';/);
  assert.match(verifyRoute, /invalid_wallet_auth_request/);
  assert.match(verifyRoute, /wallet_auth_request_too_large/);
  assert.match(verifyRoute, /invalid_or_expired_nonce/);
  assert.match(verifyRoute, /wallet_auth_verification_failed/);
  assert.match(verifyRoute, /Response\.json\(\{ isValid: true, address: result\.address, ticket: result\.ticket, loginId: result\.loginId \}/);
  assert.match(verifyRoute, /verifyAndMintWalletLoginTicket/);
  assert.match(verifyRoute, /readWalletAuthJson/);
  assert.ok(verifyCore.indexOf('await take(nonce)') < verifyCore.indexOf('await verify(candidate.payload, nonce, challenge.statement)'));
  assert.match(sessionCore, /if \(result\.kind !== 'success'\) return result/);
  assert.match(sessionCore, /const \{ ticket, loginId \} = minted;/);
  assert.match(sessionCore, /return \{ kind: 'success', address: result\.address, ticket, loginId \};/);
  assert.doesNotMatch(sessionCore, /\.\.\.result|\.\.\.\(await mint/);
  assert.doesNotMatch(verifyRoute, /console\.|requestId|notBefore|cookie|redirect|proof|transaction|signIn|\/game/);
});
