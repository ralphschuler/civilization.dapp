import { getAddress, isAddress } from "viem";
import { WORLD_CHAIN_ID } from "../world-chain.js";

/** Immutable production identifiers. Development must never inherit these. */
export const LIVE_CONTRACT = "0x0E6689d0649Ad9037465d178231b10F18518D2b0";
/** WLD's World Chain mainnet contract; clients receive it through runtime config. */
export const LIVE_WORLD_TOKEN = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003";
export const DEVELOPMENT_WORLD_APP_ID = "app_c098bd46180834e598bd9cac8d1bd94d";
export const DEVELOPMENT_ORIGIN = "https://civilization-dev.nyphon.de";

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
}>;

type Environment = Record<string, string | undefined>;
const APP_ID = /^app_[A-Za-z0-9]+$/;
const value = (env: Environment, name: string) => env[name] || "";

/** Unknown selectors deliberately resolve to production, preserving the live default. */
export function civilizationEnvironment(
  env: Environment = process.env,
): CivilizationEnvironment {
  return env.CIVILIZATION_ENV === "development" ? "development" : "production";
}

function hasHttpsOrigin(raw: string, expectedOrigin?: string) {
  try {
    const parsed = new URL(raw);
    return (
      parsed.protocol === "https:" &&
      (expectedOrigin === undefined || parsed.origin === expectedOrigin)
    );
  } catch {
    return false;
  }
}

function publicWorld(
  env: Environment,
  environment: CivilizationEnvironment,
): PublicWorldRuntimeConfiguration {
  return {
    environment,
    worldAppId: value(env, "WORLD_APP_ID"),
    civilizationContractAddress: value(env, "CIVILIZATION_CONTRACT_ADDRESS"),
    worldTokenAddress: value(env, "CIVILIZATION_WORLD_TOKEN_ADDRESS"),
    worldChainId: Number(value(env, "CIVILIZATION_CHAIN_ID")),
  };
}

function sharedMissing(
  env: Environment,
  world: PublicWorldRuntimeConfiguration,
) {
  const missing: string[] = [];
  if (!hasHttpsOrigin(value(env, "WALLET_AUTH_URL")))
    missing.push("WALLET_AUTH_URL");
  if (!APP_ID.test(world.worldAppId)) missing.push("WORLD_APP_ID");
  if (world.worldChainId !== WORLD_CHAIN_ID)
    missing.push("CIVILIZATION_CHAIN_ID");
  return missing;
}

function productionMissing(
  env: Environment,
  world: PublicWorldRuntimeConfiguration,
) {
  const missing = sharedMissing(env, world);
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
  return missing;
}

/**
 * Development accepts only its own complete identity set. This prevents a
 * typo from sending a development transaction to production.
 */
function developmentMissing(
  env: Environment,
  world: PublicWorldRuntimeConfiguration,
) {
  const missing = sharedMissing(env, world);
  const authUrl = value(env, "WALLET_AUTH_URL");
  if (!hasHttpsOrigin(authUrl, DEVELOPMENT_ORIGIN))
    missing.push("WALLET_AUTH_URL");
  if (world.worldAppId !== DEVELOPMENT_WORLD_APP_ID)
    missing.push("WORLD_APP_ID");
  if (
    !isAddress(world.civilizationContractAddress) ||
    getAddress(world.civilizationContractAddress) === getAddress(LIVE_CONTRACT)
  )
    missing.push("CIVILIZATION_CONTRACT_ADDRESS");
  if (!isAddress(world.worldTokenAddress))
    missing.push("CIVILIZATION_WORLD_TOKEN_ADDRESS");
  if (value(env, "PGDATABASE") === "civilization" || !value(env, "PGDATABASE"))
    missing.push("PGDATABASE");
  if (!value(env, "PGHOST")) missing.push("PGHOST");
  if (!value(env, "PGUSER")) missing.push("PGUSER");
  return [...new Set(missing)];
}

export function runtimeConfiguration(
  env: Environment = process.env,
): RuntimeConfiguration {
  const environment = civilizationEnvironment(env);
  const world = publicWorld(env, environment);
  const missing =
    environment === "development"
      ? developmentMissing(env, world)
      : productionMissing(env, world);
  return { ready: missing.length === 0, missing, world };
}
