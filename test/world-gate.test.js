import test from "node:test";
import assert from "node:assert/strict";
import {
  canRenderGameWorld,
  isExplicitDemoLocation,
} from "../src/world-gate.js";

test("explicit demo locations are limited to local development and published demos", () => {
  for (const location of [
    { hostname: "localhost", pathname: "/" },
    { hostname: "127.0.0.1", pathname: "/anything" },
    { hostname: "[::1]", pathname: "/" },
    { hostname: "ralphschuler.github.io", pathname: "/civilization.dapp/" },
    { hostname: "nyphon.de", pathname: "/civilization.dapp" },
    { hostname: "nyphon.de", pathname: "/civilization.dapp/" },
  ]) {
    assert.equal(
      isExplicitDemoLocation(location),
      true,
      JSON.stringify(location),
    );
  }
});

test("production and lookalike locations are never browser demos", () => {
  for (const location of [
    { hostname: "civilization.nyphon.de", pathname: "/" },
    { hostname: "nyphon.de", pathname: "/" },
    { hostname: "nyphon.de", pathname: "/civilization.dapp-preview" },
    { hostname: "evilralphschuler.github.io", pathname: "/" },
    { hostname: "localhost.evil.example", pathname: "/" },
    undefined,
  ]) {
    assert.equal(isExplicitDemoLocation(location), false, String(location));
  }
});

test("World App stays gated until WalletAuth access is confirmed", () => {
  // `worldAppInstalled` here means the injected WorldApp bridge was found;
  // MiniKitProvider's `isInstalled: false` must not turn this into browser demo.
  assert.equal(
    canRenderGameWorld({
      worldAppInstalled: true,
      walletAccessConfirmed: false,
    }),
    false,
  );
  assert.equal(
    canRenderGameWorld({
      worldAppInstalled: true,
      walletAccessConfirmed: true,
    }),
    true,
  );
});

test("explicit browser demo remains accessible without WalletAuth", () => {
  assert.equal(
    canRenderGameWorld({
      worldAppInstalled: false,
      walletAccessConfirmed: false,
    }),
    true,
  );
});
