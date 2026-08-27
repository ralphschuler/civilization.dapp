const noStoreHeaders = { "Cache-Control": "no-store", Vary: "Cookie" };
export function createBuildHistoryGet({
  database,
  expiredWalletAuthSessionCookie,
  parseBuildHistoryQuery,
  readPersonalBuildHistory,
  readWalletAuthSession,
  runtimeConfiguration,
}) {
  return async function GET(request) {
    const configuration = runtimeConfiguration();
    if (!configuration.ready)
      return Response.json(
        { error: "build_history_unavailable" },
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
      const query = parseBuildHistoryQuery(new URL(request.url).searchParams);
      return Response.json(
        await readPersonalBuildHistory(database(), {
          chainId: String(configuration.world.worldChainId),
          contractAddress: configuration.world.civilizationContractAddress,
          walletAddress: address,
          ...query,
        }),
        { headers: noStoreHeaders },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.startsWith("invalid_build_history:"))
        return Response.json(
          { error: "invalid_history_query" },
          { status: 400, headers: noStoreHeaders },
        );
      if (message === "build_history_checkpoint_changed")
        return Response.json(
          { error: "history_snapshot_changed" },
          { status: 409, headers: noStoreHeaders },
        );
      return Response.json(
        { error: "build_history_unavailable" },
        { status: 503, headers: noStoreHeaders },
      );
    }
  };
}
