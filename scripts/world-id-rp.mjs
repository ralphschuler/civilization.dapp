const RP_ID_PATTERN = /^rp_([0-9a-fA-F]{1,16})$/;

/** Converts Portal's `rp_<hex>` identifier to the uint64 used by WorldIDVerifier. */
export function worldRpIdToUint64(rpId) {
  const match = RP_ID_PATTERN.exec(rpId || "");
  if (!match) throw new Error("invalid_world_id_rp_id");
  const value = BigInt(`0x${match[1]}`);
  if (value === 0n || value > 0xffffffffffffffffn)
    throw new Error("invalid_world_id_rp_id");
  return value;
}
