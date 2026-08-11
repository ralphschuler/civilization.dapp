import { NextResponse } from 'next/server';
import { authChallengeReady } from '@/lib/auth-challenge';
import { runtimeConfiguration } from '@/lib/runtime-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const challenges = await authChallengeReady().then(() => true).catch(() => false);
  const configuration = runtimeConfiguration();
  const ready = challenges && configuration.ready;
  return NextResponse.json(
    {
      status: ready ? 'ready' : 'not_ready',
      authChallenges: challenges ? 'ok' : 'unavailable',
      configuration: configuration.ready ? 'ok' : 'incomplete',
      missing: configuration.missing,
    },
    { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
