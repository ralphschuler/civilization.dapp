import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizeWorldIdDiagnostic } from '../src/lib/world-id-diagnostic.js';

test('World ID client requests Proof of Human with the SDK-supported v3 fallback', async () => {
  const client = await readFile(new URL('../src/components/CivilizationClient.tsx', import.meta.url), 'utf8');
  assert.match(client, /import \{ CredentialRequest \} from '@worldcoin\/idkit-core';/);
  assert.match(client, /allow_legacy_proofs=\{true\}/);
  assert.match(client, /constraints=\{CredentialRequest\('proof_of_human', \{ signal: walletAddress \}\)\}/);
  assert.doesNotMatch(client, /preset=/);
  assert.doesNotMatch(client, /proofOfHuman/);
});

test('World ID recovery keeps the request widget mounted after close or rejection', async () => {
  const client = await readFile(new URL('../src/components/CivilizationClient.tsx', import.meta.url), 'utf8');
  assert.match(client, /const \[widgetOpen, setWidgetOpen\] = useState\(false\);/);
  assert.match(client, /open=\{widgetOpen\}/);
  assert.match(client, /onOpenChange=\{closeWidget\}/);
  assert.match(client, /onError=\{handleWidgetError\}/);
  assert.match(client, /setWidgetOpen\(false\);[\s\S]*?setBusy\(false\);[\s\S]*?errorCode === 'user_rejected'/);
  assert.doesNotMatch(client, /onOpenChange=\{\(open\) => !open && setRequest\(null\)\}/);
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
