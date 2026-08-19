import {
  readWalletAuthJson,
  verifyWalletAuthRequest,
} from "@/lib/wallet-auth-verify-core";
import {
  walletAuthSessionCookie,
  createWalletAuthSession,
} from "@/lib/wallet-auth-session";
import { runtimeConfiguration } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };
const malformed = () =>
  Response.json(
    { isValid: false, error: "invalid_wallet_auth_request" },
    { status: 400, headers: noStoreHeaders },
  );
const tooLarge = () =>
  Response.json(
    { isValid: false, error: "wallet_auth_request_too_large" },
    { status: 413, headers: noStoreHeaders },
  );
const invalidNonce = () =>
  Response.json(
    { isValid: false, error: "invalid_or_expired_nonce" },
    { status: 400, headers: noStoreHeaders },
  );
const verificationFailed = () =>
  Response.json(
    { isValid: false, error: "wallet_auth_verification_failed" },
    { status: 400, headers: noStoreHeaders },
  );

export async function POST(request: Request) {
  if (!runtimeConfiguration().ready) {
    return Response.json(
      { error: "wallet_auth_unavailable" },
      { status: 503, headers: noStoreHeaders },
    );
  }
  const parsed = await readWalletAuthJson(request);
  if (parsed.kind === "too_large") return tooLarge();
  if (parsed.kind !== "json") return malformed();

  try {
    const result = await verifyWalletAuthRequest(parsed.value);
    if (result.kind === "malformed") return malformed();
    if (result.kind === "invalid_nonce") return invalidNonce();
    if (result.kind === "verification_failed") return verificationFailed();
    const session = await createWalletAuthSession(result.address);
    return Response.json(
      { isValid: true, address: result.address },
      {
        headers: {
          ...noStoreHeaders,
          "Set-Cookie": walletAuthSessionCookie(
            session.token,
            session.expiresAt,
          ),
        },
      },
    );
  } catch {
    return Response.json(
      { error: "wallet_auth_unavailable" },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
