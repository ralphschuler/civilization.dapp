const noStoreHeaders = { "Cache-Control": "no-store", Vary: "Cookie" };

/**
 * Builds the private raid-history HTTP handler with explicit dependencies so
 * its authentication and cache boundaries can be exercised without Next.js.
 */
export function createRaidHistoryGet({
  database,
  expiredWalletAuthSessionCookie,
  parseRaidHistoryQuery,
  readPersonalRaidHistory,
  readWalletAuthSession,
  runtimeConfiguration,
}) {
  return async function GET(request) {
    const configuration = runtimeConfiguration();
    if (!configuration.ready)
      return Response.json(
        { error: "raid_history_unavailable" },
        { status: 503, headers: noStoreHeaders },
      );
    try {
      const address = await readWalletAuthSession(
        request.headers.get("cookie"),
      );
      if (!address)
        return Response.json(
          { error: "invalid_or_expired_session" },
          {
            status: 401,
            headers: {
              ...noStoreHeaders,
              "Set-Cookie": expiredWalletAuthSessionCookie(),
            },
          },
        );
      const query = parseRaidHistoryQuery(new URL(request.url).searchParams);
      const history = await readPersonalRaidHistory(database(), {
        chainId: String(configuration.world.worldChainId),
        contractAddress: configuration.world.civilizationContractAddress,
        walletAddress: address,
        ...query,
      });
      return Response.json(history, { headers: noStoreHeaders });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.startsWith("invalid_raid_history:"))
        return Response.json(
          { error: "invalid_history_query" },
          { status: 400, headers: noStoreHeaders },
        );
      if (message === "raid_history_checkpoint_changed")
        return Response.json(
          { error: "history_snapshot_changed" },
          { status: 409, headers: noStoreHeaders },
        );
      return Response.json(
        { error: "raid_history_unavailable" },
        { status: 503, headers: noStoreHeaders },
      );
    }
  };
}
