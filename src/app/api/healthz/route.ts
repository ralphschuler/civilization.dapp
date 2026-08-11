import { NextResponse } from 'next/server';
import { authChallengeReady } from '@/lib/auth-challenge';
import { runtimeConfiguration } from '@/lib/runtime-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const challenges = await authChallengeReady().then(() => true).catch(() => false);
  const configuration = runtimeConfiguration();
  return NextResponse.json({
    status: 'ok',
    authChallenges: challenges ? 'ok' : 'unavailable',
    configuration: configuration.ready ? 'ok' : 'incomplete',
    ready: challenges && configuration.ready,
  }, { headers: { 'cache-control': 'no-store' } });
}
