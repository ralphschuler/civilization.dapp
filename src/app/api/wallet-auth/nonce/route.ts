import { createWalletAuthChallenge } from "@/lib/auth-challenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const challenge = await createWalletAuthChallenge();
    const expires_at = challenge.expiresAt.getTime();

    return Response.json(
      { nonce: challenge.nonce, expires_at },
      { headers: noStoreHeaders },
    );
  } catch {
    return Response.json(
      { error: "wallet_auth_unavailable" },
      {
        status: 503,
        headers: noStoreHeaders,
      },
    );
  }
}
