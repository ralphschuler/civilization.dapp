import test from "node:test";
import assert from "node:assert/strict";
import { canRenderGameWorld, canRetryWorldIdVerification, isExplicitDemoLocation } from "../src/world-gate.js";

test("explicit demo locations are limited to local development and published demos", () => {
  for (const location of [
    { hostname: "localhost", pathname: "/" },
    { hostname: "127.0.0.1", pathname: "/anything" },
    { hostname: "[::1]", pathname: "/" },
    { hostname: "ralphschuler.github.io", pathname: "/civilization.dapp/" },
    { hostname: "nyphon.de", pathname: "/civilization.dapp" },
    { hostname: "nyphon.de", pathname: "/civilization.dapp/" },
  ]) assert.equal(isExplicitDemoLocation(location), true, JSON.stringify(location));
});

test("production and lookalike locations are never browser demos", () => {
  for (const location of [
    { hostname: "civilization.nyphon.de", pathname: "/" },
    { hostname: "nyphon.de", pathname: "/" },
    { hostname: "nyphon.de", pathname: "/civilization.dapp-preview" },
    { hostname: "evilralphschuler.github.io", pathname: "/" },
    { hostname: "localhost.evil.example", pathname: "/" },
    undefined,
  ]) assert.equal(isExplicitDemoLocation(location), false, String(location));
});

test("WorldApp stays gated when provider installation is false until confirmed proof registration", () => {
  // `worldAppInstalled` here means the injected WorldApp bridge was found;
  // MiniKitProvider's `isInstalled: false` must not turn this into browser demo.
  for (const worldIdStatus of ["not_verified", "checking", "error", "configuration_required", "testnet_ready"]) {
    assert.equal(canRenderGameWorld({ worldAppInstalled: true, worldIdStatus }), false, worldIdStatus);
  }
  assert.equal(canRenderGameWorld({ worldAppInstalled: true, worldIdStatus: "verified" }), true);
});

test("World ID errors remain retryable without opening the game", () => {
  assert.equal(canRetryWorldIdVerification("not_verified"), true);
  assert.equal(canRetryWorldIdVerification("error"), true);
  assert.equal(canRetryWorldIdVerification("wallet_unavailable"), true);
  assert.equal(canRetryWorldIdVerification("wallet_auth_error"), true);
  assert.equal(canRetryWorldIdVerification("checking"), false);
  assert.equal(canRenderGameWorld({ worldAppInstalled: true, worldIdStatus: "error" }), false);
});

test("explicit browser demo remains accessible without World ID", () => {
  assert.equal(canRenderGameWorld({ worldAppInstalled: false, worldIdStatus: "local_demo" }), true);
  assert.equal(canRenderGameWorld({ worldAppInstalled: false, worldIdStatus: "not_verified" }), true);
});
