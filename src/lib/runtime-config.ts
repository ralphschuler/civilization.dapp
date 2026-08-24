import { getAddress, isAddress } from "viem";
import { WORLD_CHAIN_ID } from "../world-chain.js";

/** Immutable production identifiers. Development must never inherit these. */
export const LIVE_CONTRACT = "0x99976f2f170F17a14ae6c69cEb8Cb31d47366764";
/** WLD's World Chain mainnet contract; clients receive it through runtime config. */
export const LIVE_WORLD_TOKEN = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003";
/** Historical V1 is never an admissible reviewed V2 release identity. */
const HISTORICAL_V1_IMPLEMENTATION =
  "0x7330C22d7b61CCcDB7794435535aaB349D9aFF79";
const HISTORICAL_V1_IMPLEMENTATION_CODEHASH =
  "0x0a2ceb5853ae7ba5d020948baf97c08526f7d19ef990c3e3fc61c35ac794b12a";

export type CivilizationEnvironment = "production" | "development";

export type PublicWorldRuntimeConfiguration = Readonly<{
  environment: CivilizationEnvironment;
  worldAppId: string;
  civilizationContractAddress: string;
  worldTokenAddress: string;
  worldChainId: number;
}>;

export type RuntimeConfiguration = Readonly<{
  ready: boolean;
  missing: string[];
  world: PublicWorldRuntimeConfiguration;
  walletAuthUrl: string;
  /** Server-only HTTPS endpoint. Never include this in client props or JSON. */
  worldchainRpcUrl: string;
  /** Server-only V2 identity used by the production delivery gate. */
  worldchainRelease: Readonly<{
    implementationAddress: string;
    implementationCodeHash: string;
  }>;
  walletAuthAbuse: Readonly<{
    rateLimitSecret: string;
    trustedProxyHops: number;
  }>;
}>;

type Environment = Record<string, string | undefined>;
const APP_ID = /^app_[A-Za-z0-9]+$/;
const value = (env: Environment, name: string) => env[name] || "";

/** Profiles are opt-in. An absent or misspelled selector is never production. */
export function civilizationEnvironment(
  env: Environment = process.env,
): CivilizationEnvironment | null {
  const selected = value(env, "CIVILIZATION_ENV");
  return selected === "production" || selected === "development"
    ? selected
    : null;
}

function hasHttpsOrigin(raw: string) {
  try {
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
}

/** Development must use a separately configured HTTPS origin. */
function hasIsolatedDevelopmentHttpsOrigin(raw: string) {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      url.origin !== "https://civilization.nyphon.de"
    );
  } catch {
    return false;
  }
}

function profileValue(
  env: Environment,
  environment: CivilizationEnvironment | null,
  productionName: string,
) {
  return environment === "development"
    ? value(env, `DEV_${productionName}`)
    : value(env, productionName);
}

function publicWorld(
  env: Environment,
  environment: CivilizationEnvironment | null,
): PublicWorldRuntimeConfiguration {
  // This value is never exposed while the configuration is unready.
  const safeEnvironment = environment ?? "production";
  return {
    environment: safeEnvironment,
    worldAppId: profileValue(env, environment, "WORLD_APP_ID"),
    civilizationContractAddress: profileValue(
      env,
      environment,
      "CIVILIZATION_CONTRACT_ADDRESS",
    ),
    worldTokenAddress: profileValue(
      env,
      environment,
      "CIVILIZATION_WORLD_TOKEN_ADDRESS",
    ),
    worldChainId: Number(
      profileValue(env, environment, "CIVILIZATION_CHAIN_ID"),
    ),
  };
}

function commonMissing(
  world: PublicWorldRuntimeConfiguration,
  walletAuthUrl: string,
  env: Environment,
  prefix = "",
) {
  const missing: string[] = [];
  if (!hasHttpsOrigin(walletAuthUrl)) missing.push(`${prefix}WALLET_AUTH_URL`);
  if (!APP_ID.test(world.worldAppId)) missing.push(`${prefix}WORLD_APP_ID`);
  if (world.worldChainId !== WORLD_CHAIN_ID)
    missing.push(`${prefix}CIVILIZATION_CHAIN_ID`);
  if (value(env, "WALLET_AUTH_RATE_LIMIT_SECRET").length < 32)
    missing.push("WALLET_AUTH_RATE_LIMIT_SECRET");
  if (!/^\d+$/.test(value(env, "WALLET_AUTH_TRUSTED_PROXY_HOPS")))
    missing.push("WALLET_AUTH_TRUSTED_PROXY_HOPS");
  if (
    !hasHttpsOrigin(
      profileValue(
        env,
        civilizationEnvironment(env),
        "CIVILIZATION_WORLDCHAIN_RPC_URL",
      ),
    )
  )
    missing.push(`${prefix}CIVILIZATION_WORLDCHAIN_RPC_URL`);
  return missing;
}

function productionMissing(
  env: Environment,
  world: PublicWorldRuntimeConfiguration,
  walletAuthUrl: string,
) {
  const missing = commonMissing(world, walletAuthUrl, env);
  if (
    !isAddress(world.civilizationContractAddress) ||
    getAddress(world.civilizationContractAddress) !== getAddress(LIVE_CONTRACT)
  )
    missing.push("CIVILIZATION_CONTRACT_ADDRESS");
  if (
    !isAddress(world.worldTokenAddress) ||
    getAddress(world.worldTokenAddress) !== getAddress(LIVE_WORLD_TOKEN)
  )
    missing.push("CIVILIZATION_WORLD_TOKEN_ADDRESS");
  const v2ImplementationAddress = value(
    env,
    "CIVILIZATION_WORLDCHAIN_V2_IMPLEMENTATION_ADDRESS",
  );
  const v2ImplementationCodehash = value(
    env,
    "CIVILIZATION_WORLDCHAIN_V2_IMPLEMENTATION_CODEHASH",
  );
  if (
    !isAddress(v2ImplementationAddress) ||
    getAddress(v2ImplementationAddress) ===
      getAddress(HISTORICAL_V1_IMPLEMENTATION)
  )
    missing.push("CIVILIZATION_WORLDCHAIN_V2_IMPLEMENTATION_ADDRESS");
  if (
    !/^0x[0-9a-fA-F]{64}$/.test(v2ImplementationCodehash) ||
    v2ImplementationCodehash.toLowerCase() ===
      HISTORICAL_V1_IMPLEMENTATION_CODEHASH
  )
    missing.push("CIVILIZATION_WORLDCHAIN_V2_IMPLEMENTATION_CODEHASH");
  return missing;
}

/** Development reads only DEV_* values, so it cannot inherit production. */
function developmentMissing(
  env: Environment,
  world: PublicWorldRuntimeConfiguration,
  walletAuthUrl: string,
) {
  const missing = commonMissing(world, walletAuthUrl, env, "DEV_");
  if (!hasIsolatedDevelopmentHttpsOrigin(walletAuthUrl))
    missing.push("DEV_WALLET_AUTH_URL");
  if (
    !isAddress(world.civilizationContractAddress) ||
    getAddress(world.civilizationContractAddress) === getAddress(LIVE_CONTRACT)
  )
    missing.push("DEV_CIVILIZATION_CONTRACT_ADDRESS");
  if (!isAddress(world.worldTokenAddress))
    missing.push("DEV_CIVILIZATION_WORLD_TOKEN_ADDRESS");
  for (const name of ["PGHOST", "PGDATABASE", "PGUSER"]) {
    const developmentValue = value(env, `DEV_${name}`);
    if (!developmentValue || value(env, name) !== developmentValue)
      missing.push(`DEV_${name}`);
  }
  return [...new Set(missing)];
}

export function runtimeConfiguration(
  env: Environment = process.env,
): RuntimeConfiguration {
  const environment = civilizationEnvironment(env);
  const world = publicWorld(env, environment);
  const walletAuthUrl = profileValue(env, environment, "WALLET_AUTH_URL");
  const worldchainRpcUrl = profileValue(
    env,
    environment,
    "CIVILIZATION_WORLDCHAIN_RPC_URL",
  );
  // Deliberately not DEV_-profiled: this identity gates only production
  // delivery. Development keeps its isolated, non-production behavior.
  const worldchainRelease = {
    implementationAddress: value(
      env,
      "CIVILIZATION_WORLDCHAIN_V2_IMPLEMENTATION_ADDRESS",
    ),
    implementationCodeHash: value(
      env,
      "CIVILIZATION_WORLDCHAIN_V2_IMPLEMENTATION_CODEHASH",
    ).toLowerCase(),
  };
  const walletAuthAbuse = {
    rateLimitSecret: value(env, "WALLET_AUTH_RATE_LIMIT_SECRET"),
    trustedProxyHops: Number(value(env, "WALLET_AUTH_TRUSTED_PROXY_HOPS")),
  };
  const missing =
    environment === null
      ? ["CIVILIZATION_ENV"]
      : environment === "development"
        ? developmentMissing(env, world, walletAuthUrl)
        : productionMissing(env, world, walletAuthUrl);
  return {
    ready: missing.length === 0,
    missing,
    world,
    walletAuthUrl,
    worldchainRpcUrl,
    worldchainRelease,
    walletAuthAbuse,
  };
}
