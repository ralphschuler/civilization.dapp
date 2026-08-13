import { takeLegacyWalletAuthChallenge } from './auth-challenge.js';
import { isLegacyWalletAuthNonce, verifyLegacyWalletAuthPayload } from './wallet-auth-verifier.js';

export const MAX_WALLET_AUTH_BODY_BYTES = 16_384;

/** Reads JSON without ever buffering more than the legacy endpoint's limit. */
export async function readWalletAuthJson(request) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') return { kind: 'malformed' };

  const contentLength = request.headers.get('content-length');
  if (contentLength && /^\d+$/.test(contentLength)
    && Number(contentLength) > MAX_WALLET_AUTH_BODY_BYTES) return { kind: 'too_large' };
  if (!request.body) return { kind: 'malformed' };

  const reader = request.body.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_WALLET_AUTH_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { kind: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: 'malformed' };
  }

  if (byteLength === 0) return { kind: 'malformed' };
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { kind: 'json', value: JSON.parse(text) };
  } catch {
    return { kind: 'malformed' };
  }
}

/**
 * Small dependency-injected Stage-5 core. Taking the challenge deliberately
 * precedes signature verification, including on failures, to make it single-use
 * across every application replica sharing PostgreSQL.
 */
export async function verifyWalletAuthRequest(body, dependencies = {}) {
  const candidate = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  const nonce = candidate?.nonce;
  if (!candidate || typeof nonce !== 'string' || !isLegacyWalletAuthNonce(nonce) || !Object.hasOwn(candidate, 'payload')) {
    return { kind: 'malformed' };
  }

  const take = dependencies.takeChallenge ?? takeLegacyWalletAuthChallenge;
  const verify = dependencies.verifyPayload ?? verifyLegacyWalletAuthPayload;
  const challenge = await take(nonce);
  if (!challenge) return { kind: 'invalid_nonce' };

  const address = await verify(candidate.payload, nonce, challenge.statement);
  return address ? { kind: 'success', address } : { kind: 'verification_failed' };
}
