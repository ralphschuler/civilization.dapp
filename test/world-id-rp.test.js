import test from "node:test";
import assert from "node:assert/strict";
import { createWorldIdProofContext, getWorldIdRpConfiguration, worldRpIdToUint64 } from "../server/world-id-rp.js";

const environment = {
  WORLD_ID_RP_ID: "rp_a84548cb908798cf",
  WORLD_ID_ACTION: "play",
  WORLD_ID_RP_SIGNING_KEY: "0x0123456789012345678901234567890123456789012345678901234567890123",
  WORLD_ID_RP_CONTEXT_TTL_SECONDS: "300",
};

test("Portal RP IDs keep all uint64 bits when converted for WorldIDVerifier", () => {
  assert.equal(worldRpIdToUint64(environment.WORLD_ID_RP_ID), 0xa84548cb908798cfn);
  assert.throws(() => worldRpIdToUint64("rp_not-hex"), /invalid_world_id_rp_id/);
});

test("World ID RP context accepts only complete server-side configuration", () => {
  assert.equal(getWorldIdRpConfiguration(environment).configured, true);
  assert.equal(getWorldIdRpConfiguration({ ...environment, WORLD_ID_RP_CONTEXT_TTL_SECONDS: "20" }).configured, false);
  assert.equal(getWorldIdRpConfiguration({ ...environment, WORLD_ID_RP_SIGNING_KEY: "not-a-key" }).configured, false);
});

test("proof-context signs the fixed action and never exposes the signing key", () => {
  let signingInput;
  const context = createWorldIdProofContext({
    environment,
    signer: (input) => {
      signingInput = input;
      return { sig: "0xabc", nonce: "0x0012", createdAt: 100, expiresAt: 400 };
    },
  });
  assert.deepEqual(context, {
    rp_id: environment.WORLD_ID_RP_ID,
    nonce: "0x0012",
    created_at: 100,
    expires_at: 400,
    signature: "0xabc",
  });
  assert.deepEqual(signingInput, { signingKeyHex: environment.WORLD_ID_RP_SIGNING_KEY, action: "play", ttl: 300 });
  assert.equal(JSON.stringify(context).includes(environment.WORLD_ID_RP_SIGNING_KEY), false);
});

test("proof-context refuses incomplete World ID configuration", () => {
  assert.throws(() => createWorldIdProofContext({ environment: { WORLD_ID_RP_ID: environment.WORLD_ID_RP_ID } }), /world_id_rp_not_configured/);
});
