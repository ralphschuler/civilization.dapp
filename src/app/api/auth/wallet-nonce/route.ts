import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAuthChallenge } from "@/lib/auth-challenge";

export const runtime = "nodejs";

export async function POST() {
  const secret = process.env.HMAC_SECRET_KEY;
  if (!secret)
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  try {
    const challenge = await createAuthChallenge();
    const signedNonce = crypto
      .createHmac("sha256", secret)
      .update(challenge.nonce)
      .digest("hex");
    return NextResponse.json(
      { ...challenge, signedNonce },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "wallet_auth_unavailable" },
      { status: 503 },
    );
  }
}
