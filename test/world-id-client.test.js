import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizeWorldIdDiagnostic } from '../src/lib/world-id-diagnostic.js';

test('Civilization client uses only the WalletAuth-established wallet registration path', async () => {
  const client = await readFile(new URL('../src/components/CivilizationClient.tsx', import.meta.url), 'utf8');
  assert.match(client, /registerWalletWithMiniKit\(\{[\s\S]*?walletAddress,[\s\S]*?contractAddress,[\s\S]*?pollReceipt,[\s\S]*?pendingUserOpHash: pendingRegistrationHash\.current/);
  assert.match(client, /readCivilizationState\(walletAddress, contractAddress\)/);
  assert.match(client, /Dorf on-chain erstellen/);
  assert.match(client, /registrationInFlight\.current/);
  assert.match(client, /pendingRegistrationHash\.current = hash/);
  assert.doesNotMatch(client, /errorText|\$\{error/);
  assert.doesNotMatch(client, /@worldcoin\/idkit|IDKit|WorldId|World ID|rp_context|proofOfHuman/);
});

test('WalletAuth is completed before CivilizationClient is loaded', async () => {
  const client = await readFile(new URL('../src/components/CivilizationClient.tsx', import.meta.url), 'utf8');
  const stage9 = await readFile(new URL('../src/components/NativeWalletAuthDiagnostic/index.tsx', import.meta.url), 'utf8');
  assert.match(stage9, /verifyWalletForDirectGame/);
  assert.match(stage9, /if \(walletAddress\) return <CivilizationClient walletAddress=\{walletAddress\} contractAddress=\{contractAddress\} \/>;/);
  assert.match(client, /server has verified WalletAuth\/SIWE/);
});

test('wallet registration retry always rereads on-chain state before a new MiniKit transaction', async () => {
  const client = await readFile(new URL('../src/components/CivilizationClient.tsx', import.meta.url), 'utf8');
  assert.match(client, /registerWalletWithMiniKit always reads first, including every retry/);
  assert.match(client, /Das Dorf wurde noch nicht bestätigt\.[\s\S]*?versuche es bei Bedarf erneut/);
});

test('legacy game URL returns to the same-page WalletAuth flow without Auth.js', async () => {
  const [layout, page] = await Promise.all([
    readFile(new URL('../src/app/(protected)/layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/(protected)/game/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(`${layout}${page}`, /from ['"]@\/auth['"]|\bauth\(\)|SessionProvider/);
  assert.match(page, /redirect\('\/'\)/);
});

test('game route has a safe client error boundary with a retry action', async () => {
  const boundary = await readFile(new URL('../src/app/(protected)/game/error.tsx', import.meta.url), 'utf8');
  assert.match(boundary, /'use client';/);
  assert.match(boundary, /reset: \(\) => void/);
  assert.match(boundary, /onClick=\{reset\}/);
  assert.doesNotMatch(boundary, /error\.message/);
});

test('World ID diagnostic sanitizer keeps only the explicit allowlist', () => {
  const wallet = '0x1111111111111111111111111111111111111111';
  const diagnostic = sanitizeWorldIdDiagnostic('max_verifications_reached', {
    version: 1,
    package_version: '4.2.2',
    transport: 'mini_app',
    generated_at: '2026-08-12T06:00:00.000Z',
    request_id: 'req_safe',
    request_payload: { signal: wallet, nonce: 'nonce_secret', cookies: 'cookie_secret' },
    response_payload: { error_code: 'max_verifications_reached', proof: 'proof_secret', credential: 'credential_secret' },
    mini_app: { platform: 'ios', send_channel: 'webkit.minikit', response_channel: 'minikit' },
  });

  assert.deepEqual(diagnostic, {
    errorCode: 'max_verifications_reached',
    packageVersion: '4.2.2',
    transport: 'mini_app',
    platform: 'ios',
    sendChannel: 'webkit.minikit',
    responseChannel: 'minikit',
    requestId: 'req_safe',
    responseErrorCode: 'max_verifications_reached',
  });
  const visible = JSON.stringify(diagnostic);
  for (const secret of [wallet, 'nonce_secret', 'cookie_secret', 'proof_secret', 'credential_secret', '2026-08-12T06:00:00.000Z']) {
    assert.doesNotMatch(visible, new RegExp(secret));
  }
});

test('World ID diagnostic sanitizer rejects non-string optional diagnostic values', () => {
  assert.deepEqual(sanitizeWorldIdDiagnostic('duplicate_nonce', {
    package_version: ['4.2.2'], transport: { type: 'mini_app' }, request_id: 12,
    response_payload: { error_code: { value: 'duplicate_nonce' } },
    mini_app: { platform: null, send_channel: true, response_channel: ['minikit'] },
  }), { errorCode: 'duplicate_nonce' });
});
