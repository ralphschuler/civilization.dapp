import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("tmp is globally overridden to the patched release without changing solc", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const workspaceYaml = await readFile(
    new URL("../pnpm-workspace.yaml", import.meta.url),
    "utf8",
  );
  const lockfile = await readFile(
    new URL("../pnpm-lock.yaml", import.meta.url),
    "utf8",
  );

  assert.match(workspaceYaml, /^overrides:\n  tmp: 0\.2\.6$/m);
  assert.match(lockfile, /^  tmp@0\.2\.6:$/m);
  assert.doesNotMatch(lockfile, /^  tmp@0\.0\.33:$/m);
  assert.equal(packageJson.pnpm, undefined);
  assert.equal(packageJson.devDependencies?.solc, "0.8.30");
});
