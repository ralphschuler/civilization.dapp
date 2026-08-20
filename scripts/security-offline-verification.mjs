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
  "scripts/verify-worldchain-proxy.mjs",
  "scripts/release-worldchain-gate.mjs",
  "server/contract-runtime-status.js",
  "server/production-release-gate.js",
  "server/contract-runtime-projection.js",
  "server/contract-status.js",
  "src/lib/runtime-config.ts",
  "src/app/api/contracts/status/route.ts",
  "src/app/api/readyz/route.ts",
  "src/world-game/runtime-gate.js",
  "test/worldchain-proxy-verifier.test.js",
  "test/production-release-gate.test.js",
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const files = Object.fromEntries(
  await Promise.all(
    scopedFiles.map(async (file) => [file, sha256(await readFile(file))]),
  ),
);
const runtimeSource = await readFile(
  "server/contract-runtime-status.js",
  "utf8",
);
const configSource = await readFile("src/lib/runtime-config.ts", "utf8");
const verifierRegression = await readFile(
  "test/worldchain-proxy-verifier.test.js",
  "utf8",
);
if (
  !runtimeSource.includes('worldAppId: "app_civilization"') ||
  !runtimeSource.includes('"constructionCapacity()"') ||
  !runtimeSource.includes('"constructionJob(address,uint8)"') ||
  !runtimeSource.includes('"completeUpgrade(uint8)"') ||
  !runtimeSource.includes('"verified"') ||
  !configSource.includes("CIVILIZATION_WORLDCHAIN_RPC_URL") ||
  !verifierRegression.includes("V1-style missing construction selectors")
)
  throw new Error("runtime release identity/capability binding is missing");
const manifest = JSON.stringify({
  reference: reference.toLowerCase(),
  files,
  worldAppId: "app_civilization",
  requiredCapabilities: [
    "timelock()",
    "owner()",
    "constructionCapacity()",
    "constructionJob(address,uint8)",
    "completeUpgrade(uint8)",
  ],
});
process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      kind: "civilization-security-offline-manifest/v1",
      reference: reference.toLowerCase(),
      files,
      worldAppId: "app_civilization",
      requiredCapabilities: [
        "timelock()",
        "owner()",
        "constructionCapacity()",
        "constructionJob(address,uint8)",
        "completeUpgrade(uint8)",
      ],
      manifestSha256: sha256(manifest),
    },
    null,
    2,
  )}\n`,
);
