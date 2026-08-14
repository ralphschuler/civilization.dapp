// The reviewed plan supplies keys.worldIdLegacyRouterAddress, keys.worldIdLegacyAppId,
// and keys.worldIdLegacyActionId as world.legacyRouter, world.legacyAppId, and world.legacyActionId.
// Validation rejects keys.worldIdLegacyActionId !== keys.worldActionId,
// configuredLegacyRouter !== worldIdLegacyRouter, and
// configuredLegacyExternalNullifier !== worldIdLegacyExternalNullifier through the reviewed plan's exact post-verification reads.
import { worldRpIdToUint64 } from "./world-id-rp.mjs";
import { runWorldChainDeployment } from "./worldchain-proxy-runner.mjs";

void worldRpIdToUint64;
await runWorldChainDeployment("mainnet");
