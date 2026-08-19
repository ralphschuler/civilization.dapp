import {
  expiredWalletAuthSessionCookie,
  readWalletAuthSession,
} from "@/lib/wallet-auth-session";
import { runtimeConfiguration } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  if (!runtimeConfiguration().ready) {
    return Response.json(
      { error: "wallet_auth_unavailable" },
      { status: 503, headers: noStoreHeaders },
    );
  }
  try {
    const address = await readWalletAuthSession(request.headers.get("cookie"));
    if (!address) {
      return Response.json(
        { isValid: false, error: "invalid_or_expired_session" },
        {
          status: 401,
          headers: {
            ...noStoreHeaders,
            "Set-Cookie": expiredWalletAuthSessionCookie(),
          },
        },
      );
    }
    return Response.json(
      { isValid: true, address },
      { headers: noStoreHeaders },
    );
  } catch {
    return Response.json(
      { error: "wallet_auth_unavailable" },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
