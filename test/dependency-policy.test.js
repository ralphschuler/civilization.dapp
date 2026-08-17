import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

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

  assert.match(workspaceYaml, /^overrides:\n  tmp: 0\.2\.7$/m);
  assert.match(lockfile, /^  tmp@0\.2\.7:$/m);
  assert.doesNotMatch(lockfile, /^  tmp@0\.[0-1]\./m);
  assert.doesNotMatch(lockfile, /^  tmp@0\.2\.[0-6]:$/m);
  assert.doesNotMatch(lockfile, /^  tmp@0\.0\.33:$/m);
  assert.equal(packageJson.pnpm, undefined);
  assert.equal(packageJson.devDependencies?.solc, "0.8.30");

  const { stdout } = await execFile("pnpm", ["why", "tmp", "--json"]);
  const resolution = JSON.parse(stdout);

  assert.deepEqual(
    resolution.map(({ name, version, dependents }) => ({
      name,
      version,
      dependent: dependents?.[0]?.name,
      dependentVersion: dependents?.[0]?.version,
    })),
    [
      {
        name: "tmp",
        version: "0.2.7",
        dependent: "solc",
        dependentVersion: "0.8.30",
      },
    ],
  );
});
