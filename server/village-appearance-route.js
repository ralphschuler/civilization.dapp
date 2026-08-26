import {
  DEFAULT_VILLAGE_APPEARANCE,
  isVillageAppearance,
  resolveVillageAppearance,
} from "../src/lib/village-appearance.js";

const noStoreHeaders = { "Cache-Control": "no-store", Vary: "Cookie" };

/** Private preference route: the authenticated server session is its only identity input. */
export function createVillageAppearanceRoute(dependencies) {
  const unavailable = () =>
    Response.json(
      {
        appearance: DEFAULT_VILLAGE_APPEARANCE,
        error: "appearance_unavailable",
      },
      { status: 503, headers: noStoreHeaders },
    );
  const authenticated = async (request) => {
    const address = await dependencies.readWalletAuthSession(
      request.headers.get("cookie"),
    );
    if (address) return address;
    return null;
  };
  const unauthorized = () =>
    Response.json(
      {
        appearance: DEFAULT_VILLAGE_APPEARANCE,
        error: "invalid_or_expired_session",
      },
      {
        status: 401,
        headers: {
          ...noStoreHeaders,
          "Set-Cookie": dependencies.expiredWalletAuthSessionCookie(),
        },
      },
    );
  return {
    async GET(request) {
      if (!dependencies.runtimeConfiguration().ready) return unavailable();
      try {
        const address = await authenticated(request);
        if (!address) return unauthorized();
        const appearance = await dependencies.readVillageAppearance(
          dependencies.database(),
          address,
        );
        return Response.json(
          { appearance: resolveVillageAppearance(appearance) },
          { headers: noStoreHeaders },
        );
      } catch {
        return unavailable();
      }
    },
    async PUT(request) {
      if (!dependencies.runtimeConfiguration().ready) return unavailable();
      try {
        const address = await authenticated(request);
        if (!address) return unauthorized();
        const body = await request.json();
        if (!isVillageAppearance(body?.appearance))
          return Response.json(
            {
              appearance: DEFAULT_VILLAGE_APPEARANCE,
              error: "invalid_appearance",
            },
            { status: 400, headers: noStoreHeaders },
          );
        const appearance = await dependencies.saveVillageAppearance(
          dependencies.database(),
          address,
          body.appearance,
        );
        return Response.json({ appearance }, { headers: noStoreHeaders });
      } catch {
        return unavailable();
      }
    },
  };
}
