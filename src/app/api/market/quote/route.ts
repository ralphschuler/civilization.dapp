import { NextResponse } from 'next/server';
import { CGOLD_DECIMALS, TRADE_FEE_BPS, WLD_DECIMALS, quoteCgoldWldTrade } from '../../../../../server/market.js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const quote = quoteCgoldWldTrade({ side: url.searchParams.get('side'), amount: url.searchParams.get('amount') });
    return NextResponse.json({
      ...quote,
      feeBps: TRADE_FEE_BPS,
      assetPair: 'CGOLD/WLD',
      decimals: { cgold: CGOLD_DECIMALS, wld: WLD_DECIMALS },
      executable: false,
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_quote';
    return NextResponse.json({ error: message }, { status: 400, headers: { 'cache-control': 'no-store' } });
  }
}
