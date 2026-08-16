import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { worldRpIdToUint64 } from "../scripts/world-id-rp.mjs";

test("Portal RP IDs keep all uint64 bits when converted for WorldIDVerifier", () => {
  assert.equal(worldRpIdToUint64("rp_a84548cb908798cf"), 0xa84548cb908798cfn);
  assert.equal(worldRpIdToUint64("rp_FFFFFFFFFFFFFFFF"), 0xffffffffffffffffn);
});

test("invalid, zero, and oversized RP IDs are rejected", () => {
  for (const rpId of ["", "rp_0", "rp_not-hex", "rp_10000000000000000"]) {
    assert.throws(() => worldRpIdToUint64(rpId), /invalid_world_id_rp_id/);
  }
});

test("mainnet deploy and preflight use the scripts-side RP utility", async () => {
  const source = await readFile(
    new URL("../scripts/deploy-worldchain-mainnet.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /from "\.\/world-id-rp\.mjs"/);
  assert.doesNotMatch(source, /server\/world-id-rp/);
});
