import { getAddress, isAddress } from "viem";
import { WORLD_CHAIN_ID } from "../world-chain.js";

/** Immutable production identifiers. Development must never inherit these. */
export const LIVE_CONTRACT = "0x0E6689d0649Ad9037465d178231b10F18518D2b0";
/** WLD's World Chain mainnet contract; clients receive it through runtime config. */
export const LIVE_WORLD_TOKEN = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003";
export const LIVE_RP_ID = "rp_a84548cb908798cf";
export const LIVE_WORLD_ID_ACTION = "play";
export const LIVE_WORLD_ID_PROOF_CONTEXT_URL =
  "https://civilization.nyphon.de/api/rp-signature";
export const DEVELOPMENT_WORLD_APP_ID = "app_c098bd46180834e598bd9cac8d1bd94d";
export const DEVELOPMENT_ORIGIN = "https://civilization-dev.nyphon.de";
export const DEVELOPMENT_RP_ID = "rp_de35f1ecb30715f9";
export const DEVELOPMENT_WORLD_ID_ACTION = "civilization-dev-play";

export type CivilizationEnvironment = "production" | "development";

export type PublicWorldRuntimeConfiguration = Readonly<{
  environment: CivilizationEnvironment;
  worldAppId: string;
  worldIdAppId: string;
  worldIdAction: string;
  civilizationContractAddress: string;
  worldTokenAddress: string;
  worldChainId: number;
  worldIdProofContextUrl: string;
  worldIdEnvironment: string;
}>;

export type RuntimeConfiguration = Readonly<{
  ready: boolean;
  missing: string[];
  world: PublicWorldRuntimeConfiguration;
}>;

type Environment = Record<string, string | undefined>;
const APP_ID = /^app_[A-Za-z0-9]+$/;
const HEX_KEY = /^0x[0-9a-fA-F]{64}$/;
const hasSecret = (value: string | undefined) =>
  typeof value === "string" &&
  value.length >= 32 &&
  !/^replace(?:[-_]|$)/i.test(value);
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
    worldIdAppId: value(env, "WORLD_ID_APP_ID"),
    worldIdAction: value(env, "WORLD_ID_ACTION"),
    civilizationContractAddress: value(env, "CIVILIZATION_CONTRACT_ADDRESS"),
    worldTokenAddress: value(env, "CIVILIZATION_WORLD_TOKEN_ADDRESS"),
    worldChainId: Number(value(env, "CIVILIZATION_CHAIN_ID")),
    worldIdProofContextUrl: value(env, "WORLD_ID_PROOF_CONTEXT_URL"),
    worldIdEnvironment: value(env, "WORLD_ID_ENVIRONMENT"),
  };
}

function sharedMissing(
  env: Environment,
  world: PublicWorldRuntimeConfiguration,
) {
  const missing: string[] = [];
  if (!hasSecret(env.AUTH_SECRET)) missing.push("AUTH_SECRET");
  if (!hasSecret(env.HMAC_SECRET_KEY)) missing.push("HMAC_SECRET_KEY");
  if (!hasHttpsOrigin(value(env, "AUTH_URL"))) missing.push("AUTH_URL");
  if (env.AUTH_TRUST_HOST !== "true") missing.push("AUTH_TRUST_HOST");
  if (!APP_ID.test(world.worldAppId)) missing.push("WORLD_APP_ID");
  if (!APP_ID.test(world.worldIdAppId)) missing.push("WORLD_ID_APP_ID");
  if (!HEX_KEY.test(value(env, "RP_SIGNING_KEY")))
    missing.push("RP_SIGNING_KEY");
  if (world.worldIdEnvironment !== "production")
    missing.push("WORLD_ID_ENVIRONMENT");
  if (world.worldChainId !== WORLD_CHAIN_ID)
    missing.push("CIVILIZATION_CHAIN_ID");
  return missing;
}

function productionMissing(
  env: Environment,
  world: PublicWorldRuntimeConfiguration,
) {
  const missing = sharedMissing(env, world);
  if (world.worldIdAction !== LIVE_WORLD_ID_ACTION)
    missing.push("WORLD_ID_ACTION");
  if (world.worldIdProofContextUrl !== LIVE_WORLD_ID_PROOF_CONTEXT_URL)
    missing.push("WORLD_ID_PROOF_CONTEXT_URL");
  if (value(env, "RP_ID") !== LIVE_RP_ID) missing.push("RP_ID");
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
 * typo from sending a development proof or transaction to production.
 */
function developmentMissing(
  env: Environment,
  world: PublicWorldRuntimeConfiguration,
) {
  const missing = sharedMissing(env, world);
  const authUrl = value(env, "AUTH_URL");
  if (!hasHttpsOrigin(authUrl, DEVELOPMENT_ORIGIN)) missing.push("AUTH_URL");
  if (world.worldAppId !== DEVELOPMENT_WORLD_APP_ID)
    missing.push("WORLD_APP_ID");
  // This app is the Portal identity supplied for the isolated Dev Mini App.
  if (world.worldIdAppId !== DEVELOPMENT_WORLD_APP_ID)
    missing.push("WORLD_ID_APP_ID");
  if (value(env, "RP_ID") !== DEVELOPMENT_RP_ID) missing.push("RP_ID");
  if (world.worldIdAction !== DEVELOPMENT_WORLD_ID_ACTION)
    missing.push("WORLD_ID_ACTION");
  const expectedContext = `${authUrl}/api/rp-signature`;
  if (
    world.worldIdProofContextUrl !== expectedContext ||
    world.worldIdProofContextUrl === LIVE_WORLD_ID_PROOF_CONTEXT_URL
  )
    missing.push("WORLD_ID_PROOF_CONTEXT_URL");
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
