#!/usr/bin/env node
// Deterministic, network-free assurance evidence. CI supplies the immutable
// checkout SHA; local callers must supply the commit they checked out.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const reference = process.env.SECURITY_ASSURANCE_REF || process.env.GITHUB_SHA;
if (!/^[0-9a-f]{40}$/i.test(reference || "")) {
  throw new Error(
    "SECURITY_ASSURANCE_REF must be the 40-character commit SHA being verified (CI may use GITHUB_SHA)",
  );
}

const scopedFiles = [
  "contracts/src/CivilizationGame.sol",
  "contracts/src/CivilizationGameV2Fixture.sol",
  "contracts/src/CivilizationProxyArchitecture.sol",
  "contracts/src/CivilizationReleaseRegistry.sol",
  "contracts/src/CivilizationRevenueSplitter.sol",
  "contracts/src/GoldSettlementRegistry.sol",
  "contracts/storage-layout-v1.snapshot.json",
  "contracts/proxy-deployment-plan.example.json",
  "contracts/worldchain-proxy-release-plan.mainnet.example.json",
  "contracts/worldchain-proxy-release-plan.testnet.example.json",
  "contracts/world-id-deployment.example.json",
  "contracts/worldchain.tokens.example.json",
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const files = Object.fromEntries(
  await Promise.all(
    scopedFiles.map(async (file) => [file, sha256(await readFile(file))]),
  ),
);
const manifest = JSON.stringify({ reference: reference.toLowerCase(), files });
process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      kind: "civilization-security-offline-manifest/v1",
      reference: reference.toLowerCase(),
      files,
      manifestSha256: sha256(manifest),
    },
    null,
    2,
  )}\n`,
);
