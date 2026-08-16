// Stable public entrypoint for the World Chain game adapter.
export {
  BUILDING_IDS,
  BUILDING_INDEX,
  CIVILIZATION_GAME_ADDRESS,
  TROOP_INDEX,
  WORLD_TOKEN_ADDRESS,
} from "./world-game/constants.js";
export {
  decodeCivilizationState,
  readCivilizationState,
  readContractBuildDuration,
  worldGameClient,
} from "./world-game/reads.js";
export {
  claimEligibility,
  getContractBuildingCost,
  getContractCapacity,
  getContractProduction,
  getContractRequirements,
  getContractTroopRequirements,
  projectCivilizationState,
} from "./world-game/projections.js";
export {
  encodeWalletRegistration,
  encodeWorldIdRegistration,
  encodeWorldGameAction,
  registerWalletWithMiniKit,
} from "./world-game/actions.js";
export { createWorldGameAdapter } from "./world-game/adapter.js";
