const statusError = (status) => {
  if (status === "mismatched") return "contract_runtime_mismatched";
  if (status === "failed") return "contract_runtime_failed";
  return "contract_runtime_unavailable";
};

/** Read the public, sanitized release observation before opening a wallet UI. */
export async function requireVerifiedContractRuntime(
  fetchImpl = globalThis.fetch,
) {
  if (typeof fetchImpl !== "function")
    throw new Error("contract_runtime_unavailable");
  let response;
  try {
    response = await fetchImpl("/api/contracts/status", { cache: "no-store" });
  } catch {
    throw new Error("contract_runtime_unavailable");
  }
  if (!response?.ok) throw new Error("contract_runtime_unavailable");
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("contract_runtime_unavailable");
  }
  if (payload?.runtimeVerification?.status !== "verified")
    throw new Error(statusError(payload?.runtimeVerification?.status));
}

export const browserRuntimeGate = () =>
  typeof window === "undefined" ? undefined : requireVerifiedContractRuntime;
