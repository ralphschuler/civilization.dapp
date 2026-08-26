#!/usr/bin/env node
// Deterministic, offline ABI/storage/size evidence for a proposed proxy V2.
// It compiles local source only; it never queries a chain and never represents
// CivilizationGameV2Fixture as a deployed implementation.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
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

const V1_STORAGE_STRUCTS = Object.freeze([
  "Resources",
  "Buildings",
  "Troops",
  "Construction",
  "Raid",
  "Player",
  "GameStorage",
]);

const STORAGE_NAMESPACE_BINDINGS = Object.freeze([
  {
    namespace: "civilization.game.storage.v1",
    struct: "GameStorage",
    constant: "GAME_STORAGE_LOCATION",
    accessor: "_game",
    snapshotSlot: true,
  },
  {
    namespace: "civilization.game.market.v2",
    struct: "MarketStorage",
    constant: "MARKET_STORAGE_LOCATION",
    accessor: "_market",
    fields: Object.freeze([
      Object.freeze({
        name: "priceWeiPerUnit",
        type: "mapping(uint8 => uint256)",
      }),
      Object.freeze({ name: "inventory", type: "mapping(uint8 => uint256)" }),
      Object.freeze({ name: "distributor", type: "address" }),
    ]),
  },
  {
    namespace: "civilization.game.buyback.v3",
    struct: "BuybackStorage",
    constant: "BUYBACK_STORAGE_LOCATION",
    accessor: "_buyback",
    fields: Object.freeze([Object.freeze({ name: "vault", type: "address" })]),
  },
]);

const normalizeStorageType = (value) =>
  value
    .replaceAll("struct CivilizationGame.", "")
    .replaceAll("enum CivilizationGame.", "")
    .replaceAll("contract CivilizationGame.", "")
    .replaceAll("contract IWorldID", "IWorldID");

// Manual ERC-7201 storage is absent from solc's ordinary storageLayout output.
// Derive the V1 declarations from the compiler AST so that source formatting or
// comments cannot conceal a changed field order, type, or added field.
export function assertV1StorageCompatibility(ast, storage) {
  if (!storage?.structs || typeof storage.structs !== "object")
    throw new Error("V1 storage snapshot is missing its struct schema");
  const game = ast?.nodes?.find(
    (node) =>
      node.nodeType === "ContractDefinition" &&
      node.name === "CivilizationGame",
  );
  if (!game)
    throw new Error(
      "CivilizationGame declaration is missing from compiler AST",
    );
  const declarations = new Map(
    game.nodes
      .filter((node) => node.nodeType === "StructDefinition")
      .map((node) => [node.name, node]),
  );
  for (const name of V1_STORAGE_STRUCTS) {
    const expected = storage.structs[name];
    const declaration = declarations.get(name);
    if (!Array.isArray(expected) || !declaration)
      throw new Error(`V1 storage schema is missing ${name}`);
    const actual = declaration.members.map(
      (member) =>
        `${normalizeStorageType(member.typeDescriptions.typeString)} ${member.name}`,
    );
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`V1 storage layout drift detected in ${name}`);
  }
  for (const [name, expected] of Object.entries(storage.enums || {})) {
    const declaration = game.nodes.find(
      (node) => node.nodeType === "EnumDefinition" && node.name === name,
    );
    if (!declaration || !Array.isArray(expected))
      throw new Error(`V1 storage enum schema is missing ${name}`);
    const actual = declaration.members.map((member) => member.name);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`V1 storage enum order drift detected in ${name}`);
  }
}

const gameContract = (ast) => {
  const game = ast?.nodes?.find(
    (node) =>
      node.nodeType === "ContractDefinition" &&
      node.name === "CivilizationGame",
  );
  if (!game)
    throw new Error(
      "CivilizationGame declaration is missing from compiler AST",
    );
  return game;
};

const documentationText = (node) =>
  typeof node.documentation === "string"
    ? node.documentation
    : node.documentation?.text;

const protectedStorageType = (binding) =>
  `struct CivilizationGame.${binding.struct}`;

const visitAst = (node, visitor) => {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const value of node) visitAst(value, visitor);
    return;
  }
  if (typeof node.nodeType === "string") visitor(node);
  for (const value of Object.values(node)) visitAst(value, visitor);
};

// Verify the namespace relationship through compiler-owned declarations and
// the complete inline-assembly AST. This deliberately does not inspect the
// full source text: an unrelated comment or literal cannot satisfy the guard.
export function assertStorageNamespaceBindings(ast, storage) {
  const game = gameContract(ast);
  const protectedDeclarations = new Map();
  const protectedConstants = new Map();
  const canonicalAccessors = new Map();

  visitAst(game, (node) => {
    if (node.nodeType !== "VariableDeclaration") return;
    for (const binding of STORAGE_NAMESPACE_BINDINGS) {
      if (node.typeDescriptions?.typeString === protectedStorageType(binding))
        protectedDeclarations.set(node.id, binding);
    }
  });

  for (const binding of STORAGE_NAMESPACE_BINDINGS) {
    const struct = game.nodes.find(
      (node) =>
        node.nodeType === "StructDefinition" && node.name === binding.struct,
    );
    const constant = game.nodes.find(
      (node) =>
        node.nodeType === "VariableDeclaration" &&
        node.name === binding.constant,
    );
    const accessors = game.nodes.filter(
      (node) =>
        node.nodeType === "FunctionDefinition" &&
        node.name === binding.accessor,
    );
    const accessor = accessors[0];
    if (!struct || !constant || !accessor)
      throw new Error(
        `storage namespace binding is missing ${binding.namespace}`,
      );
    if (binding.fields) {
      const actualFields = struct.members.map((member) => ({
        name: member.name,
        type: normalizeStorageType(member.typeDescriptions.typeString),
      }));
      if (JSON.stringify(actualFields) !== JSON.stringify(binding.fields))
        throw new Error(
          `storage schema drift detected for ${binding.namespace}`,
        );
    }
    if (
      !documentationText(struct)
        ?.split("\n")
        .includes(`@custom:storage-location erc7201:${binding.namespace}`)
    )
      throw new Error(
        `storage namespace annotation drift detected for ${binding.namespace}`,
      );
    const expectedSlot = binding.snapshotSlot
      ? storage?.slot
      : erc7201(binding.namespace);
    if (constant.value?.value?.toLowerCase() !== expectedSlot?.toLowerCase())
      throw new Error(
        `storage namespace slot drift detected for ${binding.namespace}`,
      );
    protectedConstants.set(constant.id, {
      binding,
      slot: BigInt(expectedSlot),
    });
    const returned = accessor.returnParameters?.parameters;
    if (
      accessors.length !== 1 ||
      returned?.length !== 1 ||
      returned[0].typeDescriptions?.typeString !==
        protectedStorageType(binding) ||
      returned[0].storageLocation !== "storage"
    )
      throw new Error(
        `storage accessor type drift detected for ${binding.namespace}`,
      );
    const returners = game.nodes.filter(
      (node) =>
        node.nodeType === "FunctionDefinition" &&
        node.returnParameters?.parameters?.some(
          (parameter) =>
            parameter.typeDescriptions?.typeString ===
              protectedStorageType(binding) &&
            parameter.storageLocation === "storage",
        ),
    );
    if (returners.length !== 1 || returners[0].id !== accessor.id)
      throw new Error(
        `storage accessor alias detected for ${binding.namespace}`,
      );
    const accessorStatements = accessor.body?.statements;
    const assemblies = accessorStatements?.filter(
      (statement) => statement.nodeType === "InlineAssembly",
    );
    const assembly = assemblies?.[0];
    const assignment = assembly?.AST?.statements?.[0];
    const target = assignment?.variableNames?.[0];
    const value = assignment?.value;
    if (
      accessorStatements?.length !== 1 ||
      assemblies?.length !== 1 ||
      assembly.AST?.nodeType !== "YulBlock" ||
      assembly.AST.statements?.length !== 1 ||
      assignment?.nodeType !== "YulAssignment" ||
      assignment.variableNames?.length !== 1 ||
      target?.nodeType !== "YulIdentifier" ||
      target.name !== "$.slot" ||
      value?.nodeType !== "YulIdentifier" ||
      value.name !== binding.constant
    )
      throw new Error(
        `storage accessor binding drift detected for ${binding.namespace}`,
      );
    const references = assembly?.externalReferences;
    const slotReference = references?.find(
      (reference) =>
        reference.isSlot &&
        reference.suffix === "slot" &&
        reference.declaration === returned[0].id &&
        reference.src === target.src,
    );
    const constantReference = references?.find(
      (reference) =>
        !reference.isSlot &&
        reference.declaration === constant.id &&
        reference.src === value.src,
    );
    if (
      references?.length !== 2 ||
      !slotReference ||
      !constantReference ||
      slotReference === constantReference
    )
      throw new Error(
        `storage accessor binding drift detected for ${binding.namespace}`,
      );
    canonicalAccessors.set(binding.struct, {
      id: accessor.id,
      returnId: returned[0].id,
      assemblyId: assembly.id,
      constantReferenceSrc: value.src,
      binding,
    });
  }

  visitAst(game, (node) => {
    if (node.nodeType === "InlineAssembly") {
      for (const reference of node.externalReferences || []) {
        const constant = protectedConstants.get(reference.declaration);
        if (constant) {
          const canonical = canonicalAccessors.get(constant.binding.struct);
          if (
            node.id !== canonical.assemblyId ||
            reference.isSlot ||
            reference.src !== canonical.constantReferenceSrc
          )
            throw new Error(
              `protected storage constant outside canonical accessor for ${constant.binding.namespace}`,
            );
          continue;
        }
        const binding = protectedDeclarations.get(reference.declaration);
        if (!binding || !reference.isSlot) continue;
        const canonical = canonicalAccessors.get(binding.struct);
        if (
          node.id !== canonical.assemblyId ||
          reference.declaration !== canonical.returnId
        )
          throw new Error(
            `protected storage slot binding outside canonical accessor for ${binding.namespace}`,
          );
      }
      visitAst(node.AST, (yulNode) => {
        if (yulNode.nodeType !== "YulLiteral") return;
        let value;
        try {
          value = BigInt(yulNode.value);
        } catch {
          throw new Error("unable to inspect inline-assembly literal");
        }
        for (const { binding, slot } of protectedConstants.values()) {
          const canonical = canonicalAccessors.get(binding.struct);
          if (value === slot && node.id !== canonical.assemblyId)
            throw new Error(
              `protected storage slot literal outside canonical accessor for ${binding.namespace}`,
            );
        }
      });
      visitAst(node.AST, (yulNode) => {
        if (
          yulNode.nodeType !== "YulFunctionCall" ||
          !["sload", "sstore"].includes(yulNode.functionName?.name)
        )
          return;
        if (
          ![...canonicalAccessors.values()].some(
            (canonical) => node.id === canonical.assemblyId,
          )
        )
          throw new Error(
            `raw ordinary-storage Yul operation ${yulNode.functionName.name} outside canonical accessor`,
          );
      });
    }
    if (
      node.nodeType === "FunctionCall" &&
      STORAGE_NAMESPACE_BINDINGS.some(
        (binding) =>
          node.typeDescriptions?.typeString ===
          `${protectedStorageType(binding)} storage pointer`,
      )
    ) {
      const binding = STORAGE_NAMESPACE_BINDINGS.find(
        (candidate) =>
          node.typeDescriptions?.typeString ===
          `${protectedStorageType(candidate)} storage pointer`,
      );
      const canonical = canonicalAccessors.get(binding.struct);
      if (
        node.expression?.nodeType !== "Identifier" ||
        node.expression.referencedDeclaration !== canonical.id
      )
        throw new Error(
          `protected storage accessor reference drift detected for ${binding.namespace}`,
        );
    }
  });
}

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
            "*": {
              "": ["ast"],
              "*": ["abi", "evm.deployedBytecode.object"],
            },
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

async function main() {
  const output = await compile();
  const source = await readFile(
    new URL("../contracts/src/CivilizationGame.sol", import.meta.url),
    "utf8",
  );
  const game =
    output.contracts["contracts/src/CivilizationGame.sol"].CivilizationGame;
  const v1Abi = game.abi.filter(
    (entry) =>
      (entry.type === "function" &&
        V1_FUNCTIONS.has(functionSignature(entry))) ||
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
    throw new Error(
      "V1 ERC-7201 storage snapshot has an invalid namespace slot",
    );
  assertV1StorageCompatibility(
    output.sources["contracts/src/CivilizationGame.sol"].ast,
    storage,
  );
  assertStorageNamespaceBindings(
    output.sources["contracts/src/CivilizationGame.sol"].ast,
    storage,
  );
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
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  await main();
