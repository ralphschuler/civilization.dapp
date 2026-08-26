import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const replayRuntimeModules = [
  "scripts/run-chain-indexer.mjs",
  "src/lib/database.mjs",
  "src/lib/database-connect.mjs",
  "server/chain-indexer-core.js",
  "server/chain-indexer-store.js",
  "server/chain-indexer-reader.js",
];

function runtimeStage(dockerfile) {
  const marker = /^FROM .+ AS runtime\s*$/m;
  const match = marker.exec(dockerfile);
  assert.ok(match, "Dockerfile must have a runtime stage");
  return dockerfile.slice(match.index + match[0].length);
}

function copiedRuntimeSources(stage) {
  return [
    ...stage.matchAll(
      /^COPY\s+--from=build(?:\s+--\S+)*\s+\/app\/([^\s]+)\s+/gm,
    ),
  ].map(([, source]) => source);
}

test("runtime image packages exactly the replay CLI import closure", async () => {
  const dockerfile = await readFile("Dockerfile", "utf8");
  assert.match(
    dockerfile,
    /^COPY\s+scripts\/run-chain-indexer\.mjs\s+\.\/scripts\/run-chain-indexer\.mjs\s*$/m,
    "the build stage must make the replay CLI available to the runtime copy",
  );
  const copied = copiedRuntimeSources(runtimeStage(dockerfile));
  const packagedReplayModules = copied.filter(
    (source) =>
      source === "scripts/run-chain-indexer.mjs" ||
      source === "src/lib/database.mjs" ||
      source === "src/lib/database-connect.mjs" ||
      source.startsWith("server/chain-indexer-"),
  );

  assert.deepEqual(
    packagedReplayModules.sort(),
    [...replayRuntimeModules].sort(),
  );
  assert.match(
    runtimeStage(dockerfile),
    /^USER\s+node\s*$/m,
    "the replay CLI must retain the non-root runtime user",
  );
  assert.match(
    runtimeStage(dockerfile),
    /^CMD\s+\["node", "server\.js"\]\s*$/m,
    "the runtime image must retain the normal application command",
  );
});

test("ordinary Compose and TrueNAS definitions cannot activate the replay CLI", async () => {
  const templates = await Promise.all(
    [
      "compose.yaml",
      "deploy/truenas.yaml",
      "deploy/truenas.dev.example.yaml",
    ].map((path) => readFile(path, "utf8")),
  );

  for (const template of templates) {
    assert.doesNotMatch(template, /CHAIN_INDEXER_/);
    assert.doesNotMatch(template, /run-chain-indexer\.mjs/);
    assert.doesNotMatch(template, /chain-indexer/);
  }
});
