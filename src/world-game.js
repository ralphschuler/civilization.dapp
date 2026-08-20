// Stable public entrypoint for the World Chain game adapter.
export {
  BUILDING_IDS,
  BUILDING_INDEX,
  CIVILIZATION_GAME_ADDRESS,
  TROOP_INDEX,
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
  getContractConstructionCapacity,
  getContractDefense,
  getContractProduction,
  getContractRequirements,
  getContractRequirementsForLevel,
  getContractTroopRequirements,
  projectCivilizationState,
  projectContractUpgradeImpact,
} from "./world-game/projections.js";
export { planBuildingDependencies } from "./world-game/build-planner.js";
export {
  encodeWalletRegistration,
  encodeWorldGameAction,
  registerWalletWithMiniKit,
} from "./world-game/actions.js";
export {
  CONSTRUCTION_BOOST_SECONDS,
  constructionBoostEligibility,
} from "./world-game/boost-eligibility.js";
export { createWorldGameAdapter } from "./world-game/adapter.js";
export { createWalletIntent, createWalletReview } from "./world-game/review.js";
