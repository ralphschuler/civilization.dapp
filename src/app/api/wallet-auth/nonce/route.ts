import { randomBytes } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

export function GET() {
  try {
    const issuedAt = Date.now();
    const nonce = randomBytes(32).toString('hex');
    const expires_at = issuedAt + 5 * 60_000;

    return Response.json({ nonce, expires_at }, { headers: noStoreHeaders });
  } catch {
    return Response.json({ error: 'wallet_auth_unavailable' }, {
      status: 503,
      headers: noStoreHeaders,
    });
  }
}
