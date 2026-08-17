import "server-only";

type Environment = Record<string, string | undefined>;

/**
 * This is intentionally a server-only, opt-in development switch. It is not
 * exposed as NEXT_PUBLIC_* and URL parameters are never consulted.
 */
export function walletAccessE2eModeEnabled(
  env: Environment = process.env,
): boolean {
  return (
    env.NODE_ENV === "development" &&
    env.CIVILIZATION_WALLET_E2E_TEST_MODE === "enabled"
  );
}
