#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCOPE_FILE = "contracts/solidity-scope.json";

const canonicalPath = (value) => value.replaceAll("\\", "/");

export function validateSolidityScope(scope, sourceFiles) {
  const errors = [];
  if (scope?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  const classifications = ["production", "fixtures"];
  const declared = new Map();
  for (const classification of classifications) {
    const files = scope?.[classification];
    if (!Array.isArray(files) || files.length === 0) {
      errors.push(`${classification} must be a non-empty array`);
      continue;
    }
    for (const file of files) {
      if (typeof file !== "string" || !file.endsWith(".sol")) {
        errors.push(`${classification} contains a non-Solidity path`);
        continue;
      }
      if (
        canonicalPath(file) !== file ||
        file.startsWith("/") ||
        file.includes("..")
      )
        errors.push(`${classification} contains a non-canonical path: ${file}`);
      if (declared.has(file))
        errors.push(
          `${file} is classified as both ${declared.get(file)} and ${classification}`,
        );
      declared.set(file, classification);
    }
  }
  for (const file of sourceFiles) {
    if (!declared.has(file))
      errors.push(`unclassified Solidity source: ${file}`);
  }
  for (const file of declared.keys()) {
    if (!sourceFiles.includes(file))
      errors.push(`classified Solidity source is missing: ${file}`);
  }
  return errors;
}

export async function loadSolidityScope() {
  return JSON.parse(await readFile(path.join(root, SCOPE_FILE), "utf8"));
}

export async function discoverScopedSolidityFiles() {
  const directories = ["contracts/src", "test/fixtures"];
  const files = await Promise.all(
    directories.map(async (directory) =>
      (await readdir(path.join(root, directory), { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".sol"))
        .map((entry) => `${directory}/${entry.name}`),
    ),
  );
  return files.flat().sort();
}

export async function checkedSolidityScope() {
  const [scope, sourceFiles] = await Promise.all([
    loadSolidityScope(),
    discoverScopedSolidityFiles(),
  ]);
  const errors = validateSolidityScope(scope, sourceFiles);
  if (errors.length)
    throw new Error(`invalid Solidity scope:\n- ${errors.join("\n- ")}`);
  return scope;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const scope = await checkedSolidityScope();
  const command = process.argv[2];
  if (command === "--production")
    process.stdout.write(`${scope.production.join("\n")}\n`);
  else if (command === "--fixture-filter")
    process.stdout.write(
      `${scope.fixtures.filter((file) => file.startsWith("contracts/src/")).join("|")}\n`,
    );
  else if (command === undefined)
    process.stdout.write(
      `${JSON.stringify({ ok: true, ...scope }, null, 2)}\n`,
    );
  else throw new Error(`unknown Solidity scope command: ${command}`);
}
