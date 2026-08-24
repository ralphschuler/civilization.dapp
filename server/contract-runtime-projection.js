/** Pure response projections keep the HTTP routes and their fail-closed status testable. */
export function contractStatusPayload(
  staticMetadata,
  verification,
  environment,
) {
  if (environment !== "production")
    return { environment, runtimeVerification: verification };
  return {
    environment,
    ...staticMetadata,
    runtimeVerification: verification,
  };
}

export function readinessPayload({ schema, configuration, contract }) {
  const contractReady =
    contract.status === "verified" ||
    (configuration.world?.environment === "development" &&
      contract.status === "not_production");
  const ready = schema && configuration.ready && contractReady;
  return {
    ready,
    body: {
      status: ready ? "ready" : "not_ready",
      database: schema ? "ok" : "schema_unavailable_or_outdated",
      configuration: configuration.ready ? "ok" : "incomplete",
      contract:
        contract.status === "verified"
          ? "ok"
          : contract.status === "not_production"
            ? "not_applicable"
            : "unverified_or_mismatched",
      missing: configuration.missing,
    },
  };
}
