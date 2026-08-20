/** Pure response projections keep the HTTP routes and their fail-closed status testable. */
export function contractStatusPayload(staticMetadata, verification) {
  return { ...staticMetadata, runtimeVerification: verification };
}

export function readinessPayload({ schema, configuration, contract }) {
  const ready = schema && configuration.ready && contract.status === "verified";
  return {
    ready,
    body: {
      status: ready ? "ready" : "not_ready",
      database: schema ? "ok" : "schema_unavailable_or_outdated",
      configuration: configuration.ready ? "ok" : "incomplete",
      contract:
        contract.status === "verified" ? "ok" : "unverified_or_mismatched",
      missing: configuration.missing,
    },
  };
}
