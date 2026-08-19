import {
  expiredWalletAuthSessionCookie,
  invalidateWalletAuthSession,
} from "@/lib/wallet-auth-session";
import { runtimeConfiguration } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!runtimeConfiguration().ready) {
    return Response.json(
      { error: "wallet_auth_unavailable" },
      { status: 503, headers: noStoreHeaders },
    );
  }
  try {
    await invalidateWalletAuthSession(request.headers.get("cookie"));
    return Response.json(
      { isValid: true },
      {
        headers: {
          ...noStoreHeaders,
          "Set-Cookie": expiredWalletAuthSessionCookie(),
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
