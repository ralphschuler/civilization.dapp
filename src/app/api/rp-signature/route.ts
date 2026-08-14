import { signRequest } from '@worldcoin/idkit/signing';
import { NextResponse } from 'next/server';
import { readWalletAuthJson } from '@/lib/wallet-auth-verify-core';
import { LIVE_RP_ID, LIVE_WORLD_ID_ACTION } from '@/lib/runtime-config';
import { isRpSigningConfigured, validateRpSignatureRequest } from '@/lib/rp-signature-core';

export const runtime = 'nodejs';

const SIGNING_KEY = process.env.RP_SIGNING_KEY;
const RP_ID = process.env.RP_ID;
const noStoreHeaders = { 'Cache-Control': 'no-store' };
const unavailable = () => NextResponse.json({ error: 'world_id_rp_not_configured' }, { status: 503, headers: noStoreHeaders });
const invalidPayload = () => NextResponse.json({ error: 'invalid_payload' }, { status: 400, headers: noStoreHeaders });

export async function POST(req: Request) {
  if (!isRpSigningConfigured({ signingKey: SIGNING_KEY, rpId: RP_ID, liveRpId: LIVE_RP_ID })) return unavailable();

  const parsed = await readWalletAuthJson(req);
  if (parsed.kind !== 'json') return invalidPayload();
  const validation = validateRpSignatureRequest(parsed.value, { action: LIVE_WORLD_ID_ACTION });
  if (validation.kind === 'invalid_payload') return invalidPayload();
  if (validation.kind === 'invalid_action') return NextResponse.json({ error: 'invalid_action' }, { status: 400, headers: noStoreHeaders });
  if (validation.kind === 'invalid_signal') return NextResponse.json({ error: 'invalid_signal' }, { status: 400, headers: noStoreHeaders });
  // The normalized wallet is the signal the proof is bound to; it grants no state without on-chain registration.
  const sig = signRequest({ action: LIVE_WORLD_ID_ACTION, signingKeyHex: SIGNING_KEY! });

  return NextResponse.json({
    rp_id: RP_ID,
    sig: sig.sig,
    nonce: sig.nonce,
    created_at: Number(sig.createdAt),
    expires_at: Number(sig.expiresAt),
  }, { headers: noStoreHeaders });
}
