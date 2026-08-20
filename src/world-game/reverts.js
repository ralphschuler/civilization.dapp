import { decodeErrorResult } from "viem";
import { CIVILIZATION_GAME_ABI } from "../abi/CivilizationGame.js";

const known = new Set([
  "MissingBuildingRequirement",
  "InsufficientResources",
  "ConstructionSlotsFull",
  "BuildingMaxLevel",
  "Unregistered",
]);

function revertData(error) {
  const candidates = [error?.data, error?.cause?.data, error?.details?.data];
  return candidates.find(
    (data) => typeof data === "string" && /^0x[0-9a-fA-F]*$/.test(data),
  );
}

/** Decode only the explicitly supported game errors; malformed data stays unknown. */
export function decodeCivilizationRevert(error) {
  const data = typeof error === "string" ? error : revertData(error);
  if (!data || data.length < 10) return null;
  try {
    const decoded = decodeErrorResult({ abi: CIVILIZATION_GAME_ABI, data });
    if (!known.has(decoded.errorName)) return null;
    return {
      code: `contract_${decoded.errorName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).slice(1)}`,
      args: decoded.args || [],
    };
  } catch {
    return null;
  }
}
