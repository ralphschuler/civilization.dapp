import test from "node:test";
import assert from "node:assert/strict";
import { canRenderGameWorld, canRetryWorldIdVerification } from "../src/world-gate.js";

test("World Mini App keeps the game world closed until confirmed proof registration", () => {
  for (const worldIdStatus of ["not_verified", "checking", "error", "configuration_required", "testnet_ready"]) {
    assert.equal(canRenderGameWorld({ worldAppInstalled: true, worldIdStatus }), false, worldIdStatus);
  }
  assert.equal(canRenderGameWorld({ worldAppInstalled: true, worldIdStatus: "verified" }), true);
});

test("World ID errors remain retryable without opening the game", () => {
  assert.equal(canRetryWorldIdVerification("not_verified"), true);
  assert.equal(canRetryWorldIdVerification("error"), true);
  assert.equal(canRetryWorldIdVerification("checking"), false);
  assert.equal(canRenderGameWorld({ worldAppInstalled: true, worldIdStatus: "error" }), false);
});

test("regular browser demo remains accessible without World ID", () => {
  assert.equal(canRenderGameWorld({ worldAppInstalled: false, worldIdStatus: "local_demo" }), true);
  assert.equal(canRenderGameWorld({ worldAppInstalled: false, worldIdStatus: "not_verified" }), true);
});
