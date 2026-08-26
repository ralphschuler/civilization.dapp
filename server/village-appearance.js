import {
  DEFAULT_VILLAGE_APPEARANCE,
  isVillageAppearance,
  resolveVillageAppearance,
} from "../src/lib/village-appearance.js";

export async function readVillageAppearance(query, walletAddress) {
  const result = await query(
    "SELECT appearance FROM village_appearance_preferences WHERE wallet_address = $1",
    [walletAddress],
  );
  if (result.rowCount !== 1) return DEFAULT_VILLAGE_APPEARANCE;
  return resolveVillageAppearance(result.rows[0]?.appearance);
}

export async function saveVillageAppearance(query, walletAddress, appearance) {
  if (!isVillageAppearance(appearance)) throw new Error("invalid_appearance");
  await query(
    `INSERT INTO village_appearance_preferences (wallet_address, appearance)
     VALUES ($1, $2)
     ON CONFLICT (wallet_address) DO UPDATE
       SET appearance = EXCLUDED.appearance, updated_at = now()`,
    [walletAddress, appearance],
  );
  return appearance;
}
