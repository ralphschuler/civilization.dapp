import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contractAddress = "0x29147c7bead901e8019d7911a7dc404447877c62";
const proofContextUrl = "https://civilization.nyphon.de/api/world-id/proof-context";

test("production GitHub Pages and GHCR builds receive the public World ID configuration", async () => {
  const [pages, containerWorkflow, dockerfile] = await Promise.all([
    readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/container.yml", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
  ]);
  for (const source of [pages, containerWorkflow, dockerfile]) {
    assert.match(source, /VITE_WORLD_APP_ID/);
    assert.match(source, /VITE_WORLD_ID_ACTION[=:] ?play/);
    assert.ok(source.includes(contractAddress));
    assert.ok(source.includes(proofContextUrl));
    assert.match(source, /VITE_WORLD_ID_ENVIRONMENT[=:] ?production/);
  }
});

test("the JSX browser entry imports the React runtime used by Vite's production build", async () => {
  const appEntry = await readFile(new URL("../src/app.jsx", import.meta.url), "utf8");
  assert.match(appEntry, /^import React, \{/m);
});
