import { getAddress, isAddress } from 'viem';

export const LIVE_CONTRACT = '0x29147c7bead901e8019d7911a7dc404447877c62';
export const LIVE_RP_ID = 'rp_a84548cb908798cf';
export const LIVE_WORLD_ID_ACTION = 'play';
export const LIVE_WORLD_ID_PROOF_CONTEXT_URL = 'https://civilization.nyphon.de/api/rp-signature';

export type PublicWorldRuntimeConfiguration = Readonly<{
  worldAppId: string;
  worldIdAppId: string;
  worldIdAction: string;
  civilizationContractAddress: string;
  worldIdProofContextUrl: string;
  worldIdEnvironment: string;
}>;

const APP_ID = /^app_[A-Za-z0-9]+$/;
const SECRET = (value: string | undefined) => typeof value === 'string'
  && value.length >= 32
  && !/^replace(?:[-_]|$)/i.test(value);

export function runtimeConfiguration() {
  const world: PublicWorldRuntimeConfiguration = {
    worldAppId: process.env.WORLD_APP_ID || '',
    worldIdAppId: process.env.WORLD_ID_APP_ID || '',
    worldIdAction: process.env.WORLD_ID_ACTION || '',
    civilizationContractAddress: process.env.CIVILIZATION_CONTRACT_ADDRESS || '',
    worldIdProofContextUrl: process.env.WORLD_ID_PROOF_CONTEXT_URL || '',
    worldIdEnvironment: process.env.WORLD_ID_ENVIRONMENT || '',
  };
  const missing: string[] = [];
  if (!SECRET(process.env.AUTH_SECRET)) missing.push('AUTH_SECRET');
  if (!SECRET(process.env.HMAC_SECRET_KEY)) missing.push('HMAC_SECRET_KEY');
  try {
    const url = new URL(process.env.AUTH_URL || '');
    if (url.protocol !== 'https:') missing.push('AUTH_URL');
  } catch { missing.push('AUTH_URL'); }
  if (process.env.AUTH_TRUST_HOST !== 'true') missing.push('AUTH_TRUST_HOST');
  if (!APP_ID.test(world.worldAppId)) missing.push('WORLD_APP_ID');
  if (!APP_ID.test(world.worldIdAppId)) missing.push('WORLD_ID_APP_ID');
  if (world.worldIdAction !== LIVE_WORLD_ID_ACTION) missing.push('WORLD_ID_ACTION');
  if (world.worldIdProofContextUrl !== LIVE_WORLD_ID_PROOF_CONTEXT_URL) missing.push('WORLD_ID_PROOF_CONTEXT_URL');
  if (world.worldIdEnvironment !== 'production') missing.push('WORLD_ID_ENVIRONMENT');
  if (process.env.RP_ID !== LIVE_RP_ID) missing.push('RP_ID');
  if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.RP_SIGNING_KEY || '')) missing.push('RP_SIGNING_KEY');
  const contract = world.civilizationContractAddress;
  if (!contract || !isAddress(contract) || getAddress(contract) !== getAddress(LIVE_CONTRACT)) missing.push('CIVILIZATION_CONTRACT_ADDRESS');
  return { ready: missing.length === 0, missing, world };
}
