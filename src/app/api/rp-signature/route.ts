import { signRequest } from '@worldcoin/idkit/signing';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAddress, isAddress } from 'viem';
import { LIVE_RP_ID } from '@/lib/runtime-config';
import { getAuthorizedWallet } from '@/lib/civilization-session-guard';

export const runtime = 'nodejs';

const SIGNING_KEY = process.env.RP_SIGNING_KEY;
const RP_ID = process.env.RP_ID;

export async function POST(req: Request) {
  const session = await auth();
  const walletAddress = getAuthorizedWallet(session);
  if (!walletAddress) return NextResponse.json({ error: 'world_session_required' }, { status: 401 });
  if (!SIGNING_KEY || RP_ID !== LIVE_RP_ID) {
    return NextResponse.json(
      { error: 'world_id_rp_not_configured' },
      { status: 503 },
    );
  }

  let action: unknown;
  let signal: unknown;
  try { ({ action, signal } = await req.json()); } catch { return NextResponse.json({ error: 'invalid_payload' }, { status: 400 }); }
  if (action !== 'play') return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  if (!isAddress(String(signal)) || getAddress(String(signal)) !== walletAddress) {
    return NextResponse.json({ error: 'invalid_signal' }, { status: 400 });
  }
  const sig = signRequest({ action, signingKeyHex: SIGNING_KEY });

  return NextResponse.json({
    rp_id: RP_ID,
    sig: sig.sig,
    nonce: sig.nonce,
    created_at: Number(sig.createdAt),
    expires_at: Number(sig.expiresAt),
  });
}
