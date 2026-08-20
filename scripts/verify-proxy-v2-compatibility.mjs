#!/usr/bin/env node
// Deterministic, offline ABI/storage/size evidence for a proposed proxy V2.
// It compiles local source only; it never queries a chain and never represents
// CivilizationGameV2Fixture as a deployed implementation.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import solc from "solc";
import { keccak256, stringToHex, toHex } from "viem";
import {
  EIP170_RUNTIME_LIMIT,
  SOLIDITY_RELEASE_PROFILE,
} from "./solidity-release-profile.mjs";

const require = createRequire(import.meta.url);
const V1_SNAPSHOT = new URL(
  "../contracts/abi-v1.compatibility.snapshot.json",
  import.meta.url,
);
const V2_SNAPSHOT = new URL(
  "../contracts/abi-v2.candidate.snapshot.json",
  import.meta.url,
);
const STORAGE_SNAPSHOT = new URL(
  "../contracts/storage-layout-v1.snapshot.json",
  import.meta.url,
);
const BUDGET_FILE = new URL(
  "../contracts/v2-compatibility-budget.json",
  import.meta.url,
);

// This is the published V1 facade, excluding Solidity constructors and the
// compiler's receive/fallback entries. Additions are allowed; changes here are
// an ABI break and must be separately approved.
const V1_FUNCTIONS = new Set([
  "allowance(address,address)",
  "approve(address,uint256)",
  "balanceOf(address)",
  "boostConstruction(uint256)",
  "buildDuration(uint8,uint256)",
  "claim()",
  "completeUpgrade()",
  "initialize((address,string,uint64,uint64,uint256,address,string,string,address,address,address))",
  "nullifierOwner(uint256)",
  "playerState(address)",
  "previewAccrual(address)",
  "previewPlayerState(address)",
  "prestige()",
  "prestigeMultiplierBps(uint256)",
  "productionMultiplierBps(address)",
  "registerWallet()",
  "registerWorldId(uint256,uint256,uint256,uint64,uint64,uint256[5])",
  "registerWorldIdLegacy(uint256,uint256,uint256,uint256[8])",
  "resolveRaid()",
  "revenueSplitter()",
  "setRevenueSplitter(address)",
  "startRaid(address,uint256,uint256,uint256)",
  "symbol()",
  "timelock()",
  "totalSupply()",
  "train(uint8,uint256)",
  "transfer(address,uint256)",
  "transferFrom(address,address,uint256)",
  "upgrade(uint8)",
  "worldIdAction()",
  "worldIdLegacyExternalNullifier()",
  "worldIdLegacyRouter()",
  "worldIdRpId()",
  "worldIdVerifier()",
  "worldToken()",
  "name()",
  "decimals()",
]);
const V1_EVENTS = new Set([
  "WorldIdRegistered(address,uint256)",
  "WalletRegistered(address)",
  "ResourcesClaimed(address,uint256,uint256,uint256,uint256)",
  "UpgradeStarted(address,uint8,uint64)",
  "BuildingUpgraded(address,uint8,uint256)",
  "TroopsTrained(address,uint8,uint256)",
  "RaidStarted(address,address,uint64,uint256,uint256,uint256)",
  "RaidResolved(address,address,bool,uint256,uint256,uint256,uint256,uint256,uint256)",
  "Prestiged(address,uint256,uint256)",
  "ConstructionBoosted(address,uint256,uint256,uint64)",
  "Transfer(address,address,uint256)",
  "Approval(address,address,uint256)",
  "RevenueSplitterUpdated(address,address)",
  "MonthlyPayoutDeferred(address,bytes32)",
]);
const V1_ERRORS = new Set([
  "ZeroAddress()",
  "AlreadyRegistered()",
  "NullifierAlreadyUsed()",
  "InvalidWorldIdConfiguration()",
  "UnexpectedWorldIdCredential()",
  "Unregistered()",
  "ClaimOnCooldown(uint64)",
  "NothingToClaim()",
  "BuildingMaxLevel()",
  "ConstructionAlreadyPending(uint64)",
  "NoConstructionPending()",
  "ConstructionNotReady(uint64)",
  "PrestigeRequirementNotMet()",
  "MissingBuildingRequirement()",
  "InsufficientResources()",
  "InvalidAmount()",
  "SelfRaid()",
  "RaidAlreadyPending()",
  "NoRaidPending()",
  "RaidNotArrived(uint64)",
  "InsufficientTroops()",
  "InsufficientGoldBalance()",
  "InsufficientAllowance()",
  "NoBoostableConstruction()",
  "BoostExceedsRemainingTime()",
  "WorldTokenTransferFailed()",
  "UnauthorizedGovernance()",
  "WorldTokenAmountMismatch()",
  "InvalidBuildingLevel()",
  "InvalidRevenueSplitter(address)",
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalType = (parameter) =>
  parameter.type.startsWith("tuple")
    ? `(${parameter.components.map(canonicalType).join(",")})${parameter.type.slice(5)}`
    : parameter.type;
const functionSignature = (entry) =>
  `${entry.name}(${entry.inputs.map(canonicalType).join(",")})`;
const normalizedAbi = (abi) =>
  abi
    .filter(
      (entry) =>
        entry.type !== "constructor" &&
        entry.type !== "fallback" &&
        entry.type !== "receive",
    )
    .sort((a, b) =>
      `${a.type}:${a.name || ""}:${functionSignature(a)}`.localeCompare(
        `${b.type}:${b.name || ""}:${functionSignature(b)}`,
      ),
    );
const erc7201 = (namespace) =>
  toHex(
    BigInt(
      keccak256(
        toHex(BigInt(keccak256(stringToHex(namespace))) - 1n, { size: 32 }),
      ),
    ) & ~0xffn,
    { size: 32 },
  );

async function compile() {
  // Compile only the production facade. Compiling unrelated contracts or the
  // test-only migration target would make this release-profile gate needlessly
  // expensive.
  const files = ["CivilizationGame.sol"];
  const sources = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        `contracts/src/${file}`,
        {
          content: await readFile(
            new URL(`../contracts/src/${file}`, import.meta.url),
            "utf8",
          ),
        },
      ]),
    ),
  );
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources,
        settings: {
          ...SOLIDITY_RELEASE_PROFILE,
          outputSelection: {
            "*": { "*": ["abi", "evm.deployedBytecode.object"] },
          },
        },
      }),
      {
        import: (file) => {
          try {
            return {
              contents: require("node:fs").readFileSync(
                require.resolve(file),
                "utf8",
              ),
            };
          } catch {
            return { error: `missing pinned source: ${file}` };
          }
        },
      },
    ),
  );
  const errors = (output.errors || []).filter(
    (error) => error.severity === "error",
  );
  if (errors.length)
    throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
  return output;
}

function snapshot(kind, abi, source) {
  const normalized = normalizedAbi(abi);
  return {
    schemaVersion: 1,
    kind,
    source: "contracts/src/CivilizationGame.sol",
    sourceSha256: sha256(source),
    compiler: solc.version(),
    profile: SOLIDITY_RELEASE_PROFILE,
    abi: normalized,
    abiSha256: sha256(JSON.stringify(normalized)),
  };
}

const output = await compile();
const source = await readFile(
  new URL("../contracts/src/CivilizationGame.sol", import.meta.url),
  "utf8",
);
const game =
  output.contracts["contracts/src/CivilizationGame.sol"].CivilizationGame;
const v1Abi = game.abi.filter(
  (entry) =>
    (entry.type === "function" && V1_FUNCTIONS.has(functionSignature(entry))) ||
    (entry.type === "event" && V1_EVENTS.has(functionSignature(entry))) ||
    (entry.type === "error" && V1_ERRORS.has(functionSignature(entry))),
);
const v1 = snapshot("civilization-proxy-abi/v1-compatibility", v1Abi, source);
const v2 = snapshot(
  "civilization-proxy-abi/v2-source-candidate-not-deployed",
  game.abi,
  source,
);

const writeSnapshots = process.argv[2] === "--write-snapshots";
if (!writeSnapshots && process.argv.length > 2) {
  throw new Error("expected no arguments or --write-snapshots");
}
if (!writeSnapshots) {
  const [expectedV1, expectedV2] = await Promise.all([
    readFile(V1_SNAPSHOT, "utf8").then(JSON.parse),
    readFile(V2_SNAPSHOT, "utf8").then(JSON.parse),
  ]);
  if (JSON.stringify(expectedV1) !== JSON.stringify(v1))
    throw new Error(
      "V1 ABI snapshot is stale or incompatible with current source",
    );
  if (JSON.stringify(expectedV2) !== JSON.stringify(v2))
    throw new Error(
      "V2 ABI candidate snapshot is stale; regenerate from reviewed current source",
    );
}

const storage = JSON.parse(await readFile(STORAGE_SNAPSHOT, "utf8"));
if (storage.slot !== erc7201(storage.namespace))
  throw new Error("V1 ERC-7201 storage snapshot has an invalid namespace slot");
for (const namespace of [
  "civilization.game.market.v2",
  "civilization.game.buyback.v3",
]) {
  if (
    !source.includes(`erc7201:${namespace}`) ||
    !source.includes(erc7201(namespace))
  )
    throw new Error(`missing isolated additive namespace: ${namespace}`);
}
// The construction queue namespace predates this plan. Its current slot is
// deliberately not migrated or corrected here: moving it requires an approved
// on-chain state baseline and a dedicated migration rehearsal.
const budgets = JSON.parse(await readFile(BUDGET_FILE, "utf8"));
const sizes = Object.fromEntries([
  ["CivilizationGame", game.evm.deployedBytecode.object.length / 2],
]);
for (const [name, bytes] of Object.entries(sizes)) {
  const budget = budgets.budgets[name]?.maxRuntimeBytes;
  if (
    !Number.isInteger(budget) ||
    budget > EIP170_RUNTIME_LIMIT ||
    bytes > budget
  )
    throw new Error(
      `${name} runtime ${bytes} bytes exceeds its tested ${budget}-byte budget`,
    );
}
if (writeSnapshots) {
  await Promise.all([
    writeFile(V1_SNAPSHOT, `${JSON.stringify(v1, null, 2)}\n`),
    writeFile(V2_SNAPSHOT, `${JSON.stringify(v2, null, 2)}\n`),
  ]);
}
process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      kind: "civilization-proxy-v2-compatibility/v1",
      network: "none (offline source verification)",
      deployedV2: false,
      v1AbiSha256: v1.abiSha256,
      v2CandidateAbiSha256: v2.abiSha256,
      v1StorageSnapshotSha256: sha256(JSON.stringify(storage)),
      sizes,
      budgets: Object.fromEntries(
        Object.entries(budgets.budgets).map(([name, value]) => [
          name,
          value.maxRuntimeBytes,
        ]),
      ),
    },
    null,
    2,
  )}\n`,
);
