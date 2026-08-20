import { createWalletAuthChallenge } from "@/lib/auth-challenge";
import { runtimeConfiguration } from "@/lib/runtime-config";
import {
  cleanupWalletAuthAbuseControls,
  recordWalletAuthMetric,
  takeWalletAuthRateLimit,
  walletAuthClientSource,
  walletAuthPrivacyKey,
} from "@/lib/wallet-auth-abuse-controls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

const limited = (retryAfter: number) =>
  Response.json(
    { error: "wallet_auth_rate_limited" },
    {
      status: 429,
      headers: { ...noStoreHeaders, "Retry-After": String(retryAfter) },
    },
  );

export async function POST(request: Request) {
  const configuration = runtimeConfiguration();
  if (!configuration.ready) {
    return Response.json(
      { error: "wallet_auth_unavailable" },
      { status: 503, headers: noStoreHeaders },
    );
  }
  try {
    const source = walletAuthClientSource(
      request.headers,
      configuration.walletAuthAbuse.trustedProxyHops,
    );
    const rate = await takeWalletAuthRateLimit(
      "nonce",
      source,
      configuration.walletAuthAbuse.rateLimitSecret,
    );
    if (!rate.allowed) {
      await recordWalletAuthMetric("nonce_rate_limited").catch(() => undefined);
      return limited(rate.retryAfter);
    }
    const challenge = await createWalletAuthChallenge({
      sourceKey: walletAuthPrivacyKey(
        source,
        configuration.walletAuthAbuse.rateLimitSecret,
      ),
    });
    await Promise.all([
      recordWalletAuthMetric("nonce_issued"),
      cleanupWalletAuthAbuseControls(),
    ]).catch(() => undefined);
    const expires_at = challenge.expiresAt.getTime();

    return Response.json(
      { nonce: challenge.nonce, expires_at },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "wallet_auth_challenge_capacity_exhausted"
    ) {
      await recordWalletAuthMetric("nonce_challenge_capacity_limited").catch(
        () => undefined,
      );
      return limited(1);
    }
    return Response.json(
      { error: "wallet_auth_unavailable" },
      {
        status: 503,
        headers: noStoreHeaders,
      },
    );
  }
}
