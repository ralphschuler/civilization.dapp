import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getWalletReadiness,
  confirmWalletSession,
  safeNativeWalletAuthReason,
  sessionMatchesWallet,
  supportsWalletAuthV2,
  WalletReadiness,
} from '../src/auth/wallet/client-flow.js';

const walletAuthV2 = [{ name: 'wallet-auth', supported_versions: [2] }];

test('Wallet Auth readiness waits for a late bridge and requires raw wallet-auth v2 support', () => {
  assert.equal(getWalletReadiness({
    inWorldApp: false, miniKitInstalled: false, walletAuthAvailable: false, supportedCommands: undefined,
    attempts: 0, maxAttempts: 12,
  }), WalletReadiness.Initializing);
  assert.equal(getWalletReadiness({
    inWorldApp: false, miniKitInstalled: false, walletAuthAvailable: false, supportedCommands: undefined,
    attempts: 12, maxAttempts: 12,
  }), WalletReadiness.OutsideWorldApp);

  // MiniKit 2.0.3 can report aggregate installation failure when unrelated
  // commands are absent; wallet-auth v2 itself is still usable.
  assert.equal(getWalletReadiness({
    inWorldApp: true, miniKitInstalled: true, walletAuthAvailable: true, supportedCommands: walletAuthV2,
    aggregateInstallSucceeded: false, attempts: 1, maxAttempts: 12,
  }), WalletReadiness.Ready);
  assert.equal(getWalletReadiness({
    inWorldApp: true, miniKitInstalled: true, walletAuthAvailable: true,
    supportedCommands: [{ name: 'wallet-auth', supported_versions: [1] }], attempts: 12, maxAttempts: 12,
  }), WalletReadiness.Unsupported);
  assert.equal(getWalletReadiness({
    inWorldApp: true, miniKitInstalled: true, walletAuthAvailable: true, supportedCommands: [], attempts: 12, maxAttempts: 12,
  }), WalletReadiness.Unsupported);
  assert.equal(supportsWalletAuthV2(walletAuthV2), true);
  assert.equal(supportsWalletAuthV2([{ name: 'wallet-auth', supported_versions: [1] }]), false);
  assert.equal(supportsWalletAuthV2([]), false);
});

test('session confirmation requires the signed wallet address', () => {
  const lower = '0x8ba1f109551bd432803012645ac136ddd64dba72';
  const checksum = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';
  assert.equal(sessionMatchesWallet({ user: { walletAddress: checksum } }, lower), true);
  assert.equal(sessionMatchesWallet(null, lower), false);
  assert.equal(sessionMatchesWallet({ user: { walletAddress: '0xabc' } }, lower), false);
  assert.equal(sessionMatchesWallet({ user: { walletAddress: '0x0000000000000000000000000000000000000001' } }, lower), false);
});

test('session readback is same-origin, uncached, and fails closed', async () => {
  const wallet = '0x8ba1f109551bd432803012645ac136ddd64dba72';
  let request;
  assert.equal(await confirmWalletSession(async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ user: { walletAddress: wallet } }) };
  }, wallet), true);
  assert.deepEqual(request, {
    url: '/api/auth/session',
    options: {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json', 'cache-control': 'no-store' },
    },
  });
  assert.equal(await confirmWalletSession(async () => ({ ok: true, json: async () => null }), wallet), false);
  assert.equal(await confirmWalletSession(async () => ({
    ok: true, json: async () => ({ user: { walletAddress: '0x0000000000000000000000000000000000000001' } }),
  }), wallet), false);
  assert.equal(await confirmWalletSession(async () => { throw new Error('network'); }, wallet), false);
});

test('native Wallet Auth diagnostics retain only allowlisted reason codes', () => {
  assert.equal(safeNativeWalletAuthReason({ code: 'user_rejected', details: 'private detail' }), 'user_rejected');
  assert.equal(safeNativeWalletAuthReason({ code: 'unexpected', details: 'private detail' }), undefined);
  assert.equal(safeNativeWalletAuthReason(new Error('private detail')), undefined);
});

test('native Wallet Auth uses only nonce, statement and server expiration and confirms the session before navigation', async () => {
  const [wallet, authButton, auth] = await Promise.all([
    readFile(new URL('../src/auth/wallet/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AuthButton/index.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/auth/index.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(authButton, /isCommandAvailable\(Command\.WalletAuth\)/);
  assert.doesNotMatch(authButton, /useMiniKit/);
  assert.match(wallet, /MiniKit\.isInstalled\(\)/);
  assert.match(wallet, /supportsWalletAuthV2\(/);
  assert.match(wallet, /const expirationTime = new Date\(expiresAt\)/);
  assert.match(wallet, /typeof expiresAt !== 'string'/);
  assert.match(wallet, /Number\.isNaN\(expirationTime\.getTime\(\)\)/);
  assert.match(wallet, /MiniKit\.walletAuth\(\{ nonce, statement, expirationTime \}\)/);
  assert.match(wallet, /WalletAuthClientError\('bridge_unavailable'\)/);
  assert.match(wallet, /WalletAuthClientError\('wallet_auth_unsupported'\)/);
  assert.doesNotMatch(wallet, /notBefore/);
  assert.doesNotMatch(wallet, /requestId/);
  assert.match(auth, /verifySiweMessage\(finalPayload, nonce, challenge\.statement\)/);
  assert.doesNotMatch(auth, /verifySiweMessage\(finalPayload, nonce, challenge\.statement, challenge\.requestId\)/);
  assert.match(wallet, /WalletAuthClientError\('credentials_rejected'\)/);
  assert.match(wallet, /try \{\s*signInResult = await signIn\('credentials'/);
  assert.match(wallet, /confirmWalletSession\(fetch, data\.address\)/);
  assert.match(wallet, /WalletAuthClientError\('session_cookie_rejected'\)/);
  assert.match(wallet, /window\.location\.assign\('\/game'\)/);
});
