import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createAndConfirmWalletSession,
  safeDiagnosticErrorCode,
  sessionMatchesWalletLogin,
} from '../src/lib/native-wallet-auth-diagnostic.js';
import { verifyWalletForDirectGame } from '../src/lib/direct-wallet-game-flow.js';

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

test('Stage 9 sends nonce, native WalletAuth, then verification and renders the game in place', async () => {
  const [component, flow, page, nonceRoute, verifyRoute, verifyCore, ticketStore, sessionCore, diagnosticCore] = await Promise.all([
    readFile(new URL('../src/components/NativeWalletAuthDiagnostic/index.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/direct-wallet-game-flow.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/wallet-auth/nonce/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/wallet-auth/verify/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/wallet-auth-verify-core.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/wallet-login-ticket.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/wallet-auth-session-core.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/native-wallet-auth-diagnostic.js', import.meta.url), 'utf8'),
  ]);

  assert.match(component, /walletAuth: \(input: Parameters<typeof MiniKit\.walletAuth>\[0\]\) => MiniKit\.walletAuth\(input\)/);
  assert.match(component, /if \(walletAddress\) return <CivilizationClient walletAddress=\{walletAddress\} contractAddress=\{contractAddress\} \/>;/);
  assert.equal((component.match(/MiniKit\.walletAuth/g) ?? []).length, 2);
  assert.match(component, /dynamic\(\(\) => import\('\@\/components\/CivilizationClient'\), \{ ssr: false \}\)/);
  assert.doesNotMatch(component, /import CivilizationClient from/);
  assert.ok(component.indexOf('if (walletAddress) return <CivilizationClient') < component.indexOf('<main className="world-id-gate">'));
  assert.ok(flow.indexOf("'/api/wallet-auth/nonce'") < flow.indexOf('walletAuth({ nonce, statement: walletAuthStatement, expirationTime })'));
  assert.ok(flow.indexOf('walletAuth({ nonce, statement: walletAuthStatement, expirationTime })') < flow.indexOf("'/api/wallet-auth/verify'"));
  assert.match(flow, /body: JSON\.stringify\(\{ nonce, payload: result\.data \}\)/);
  assert.equal((flow.match(/walletAuth\(/g) ?? []).length, 1);
  assert.match(flow, /result\.executedWith !== 'minikit'/);
  assert.doesNotMatch(flow, /\bstatus\b/);
  assert.doesNotMatch(flow, /notBefore|requestId|signedNonce|HMAC|\/api\/auth/);
  assert.match(diagnosticCore, /signIn\('credentials', \{ redirect: false, redirectTo: '\/', ticket \}\)/);
  assert.match(diagnosticCore, /!signInResult \|\| !signInResult\.ok \|\| signInResult\.error/);
  assert.match(diagnosticCore, /getSession\(\{ broadcast: false \}\)/);
  assert.match(diagnosticCore, /sessionMatchesWalletLogin\(session, walletAddress, loginId\)/);
  assert.match(diagnosticCore, /signOut\(\{ redirect: false \}\)\.catch\(\(\) => undefined\)/);
  assert.match(diagnosticCore, /session_identity_mismatch/);
  assert.doesNotMatch(component, /signIn|getSession|signOut|\/api\/auth|\/game|window\.location|location\.|router\.|localStorage|sessionStorage|console\./);
  assert.doesNotMatch(component, /MiniKit\.(install|isInstalled|isInWorldApp)|isCommandAvailable|useMiniKit|readiness|command|version/);
  assert.doesNotMatch(flow, /localStorage|sessionStorage|console\.|window\.location|location\.|router\.|signIn|getSession|signOut/);
  assert.match(page, /return <NativeWalletAuthDiagnostic contractAddress=\{world\.civilizationContractAddress\} \/>;/);
  assert.doesNotMatch(page, /world-id-gate-card|href="\/game"/);
  assert.doesNotMatch(page, /['"]use client['"]/);
  assert.doesNotMatch(page, /AuthButton|\bauth\s*\(|\b(getSession|useSession|signIn|signOut)\s*\(|\bredirect\s*\(|router\.(push|replace)|useEffect\s*\(|MiniKit\./);

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
  assert.match(verifyRoute, /verifyWalletAuthRequest\(parsed\.value\)/);
  assert.match(verifyRoute, /Response\.json\(\{ isValid: true, address: result\.address \}/);
  assert.doesNotMatch(verifyRoute, /verifyAndMintWalletLoginTicket|wallet-auth-session-core|ticket|loginId/);
  assert.match(verifyRoute, /readWalletAuthJson/);
  assert.ok(verifyCore.indexOf('await take(nonce)') < verifyCore.indexOf('await verify(candidate.payload, nonce, challenge.statement)'));
  assert.match(sessionCore, /if \(result\.kind !== 'success'\) return result/);
  assert.match(sessionCore, /const \{ ticket, loginId \} = minted;/);
  assert.match(sessionCore, /return \{ kind: 'success', address: result\.address, ticket, loginId \};/);
  assert.doesNotMatch(sessionCore, /\.\.\.result|\.\.\.\(await mint/);
  assert.doesNotMatch(verifyRoute, /console\.|requestId|notBefore|cookie|redirect|proof|transaction|signIn|\/game/);
});

test('active root path has no Auth.js or session provider dependency', async () => {
  const [layout, providers] = await Promise.all([
    readFile(new URL('../src/app/layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/providers/index.tsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(layout, /from ['"]@\/auth['"]|\bauth\s*\(|\bsession\b/i);
  assert.doesNotMatch(providers, /next-auth|SessionProvider|\bsession\b/);
  assert.match(providers, /MiniKitProvider/);
});

test('direct game flow accepts a statusless native result only after server verification', async () => {
  const callbackWallet = '0x52908400098527886E0F7030069857D2E4169EE7';
  const verifiedWallet = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';
  const payload = { address: callbackWallet, message: 'private message', signature: 'private signature' };
  const calls = [];
  const address = await verifyWalletForDirectGame({
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      if (url.endsWith('/nonce')) return { ok: true, json: async () => ({ nonce: 'abcdefgh', expires_at: Date.now() + 60_000 }) };
      return { ok: true, json: async () => ({ isValid: true, address: verifiedWallet }) };
    },
    walletAuth: async (input) => { calls.push(['native', input]); return { executedWith: 'minikit', data: payload }; },
  });
  assert.equal(address, verifiedWallet);
  assert.deepEqual(calls.map(([kind]) => kind), ['/api/wallet-auth/nonce', 'native', '/api/wallet-auth/verify']);
  assert.deepEqual(JSON.parse(calls[2][1].body), { nonce: 'abcdefgh', payload });
});

test('direct game flow stops before verification on cancelled or malformed native results and on failed verification', async () => {
  for (const walletAuth of [
    async () => { throw new Error('cancelled'); },
    async () => ({ executedWith: 'minikit', data: { address: 'x' } }),
  ]) {
    const calls = [];
    await assert.rejects(verifyWalletForDirectGame({
      fetchImpl: async (url) => { calls.push(url); return { ok: true, json: async () => ({ nonce: 'abcdefgh', expires_at: Date.now() + 60_000 }) }; },
      walletAuth,
    }));
    assert.deepEqual(calls, ['/api/wallet-auth/nonce']);
  }
  const calls = [];
  await assert.rejects(verifyWalletForDirectGame({
    fetchImpl: async (url) => { calls.push(url); return url.endsWith('/nonce')
      ? { ok: true, json: async () => ({ nonce: 'abcdefgh', expires_at: Date.now() + 60_000 }) }
      : { ok: false, json: async () => ({ isValid: false }) }; },
    walletAuth: async () => ({ executedWith: 'minikit', data: { address: '0x52908400098527886E0F7030069857D2E4169EE7', message: 'm', signature: 's' } }),
  }));
  assert.deepEqual(calls, ['/api/wallet-auth/nonce', '/api/wallet-auth/verify']);
});
