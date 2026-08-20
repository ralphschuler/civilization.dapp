#!/usr/bin/env node
// Production delivery gate: read-only RPC verification only. It performs no
// deployment, upgrade, transaction construction, or secret output.
import { runtimeConfiguration } from "../src/lib/runtime-config.ts";
import { productionReleaseGate } from "../server/production-release-gate.js";

export async function main({ configuration = runtimeConfiguration() } = {}) {
  const result = await productionReleaseGate(configuration);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
