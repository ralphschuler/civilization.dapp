import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import solc from "solc";
import {
  assertStorageNamespaceBindings,
  assertV1StorageCompatibility,
} from "../scripts/verify-proxy-v2-compatibility.mjs";

const require = createRequire(import.meta.url);
const sourceUrl = new URL(
  "../contracts/src/CivilizationGame.sol",
  import.meta.url,
);
const snapshotUrl = new URL(
  "../contracts/storage-layout-v1.snapshot.json",
  import.meta.url,
);

const compileAst = (source) => {
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: { "contracts/src/CivilizationGame.sol": { content: source } },
        settings: { outputSelection: { "*": { "": ["ast"] } } },
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
  assert.deepEqual(errors, [], "test source must compile");
  return output.sources["contracts/src/CivilizationGame.sol"].ast;
};

const fixture = async () => ({
  source: await readFile(sourceUrl, "utf8"),
  snapshot: JSON.parse(await readFile(snapshotUrl, "utf8")),
});

const insertAfterAccessor = (source, accessor, struct) =>
  source.replace(
    `    function ${accessor}() internal pure returns (${struct} storage $) {\n        assembly {\n            $.slot := ${accessor === "_game" ? "GAME" : accessor === "_market" ? "MARKET" : "BUYBACK"}_STORAGE_LOCATION\n        }\n    }`,
    `    function ${accessor}() internal pure returns (${struct} storage $) {\n        assembly {\n            $.slot := ${accessor === "_game" ? "GAME" : accessor === "_market" ? "MARKET" : "BUYBACK"}_STORAGE_LOCATION\n        }\n    }\n    function ${accessor}Unsafe() internal pure returns (${struct} storage $) {\n        assembly {\n            $.slot := 0\n        }\n    }`,
  );

const redirectAccessorCalls = (source, accessor) =>
  source.replace(
    new RegExp(`(?<!function )${accessor}\\(\\)`, "g"),
    `${accessor}Unsafe()`,
  );

const insertBeforeEvents = (source, code) =>
  source.replace(
    "    event WalletRegistered(address indexed player);",
    `${code}\n\n    event WalletRegistered(address indexed player);`,
  );

test("namespace verifier accepts the current source", async () => {
  const { source, snapshot } = await fixture();

  assert.doesNotThrow(() =>
    assertStorageNamespaceBindings(compileAst(source), snapshot),
  );
});

test("namespace verifier rejects protected V2/V3 storage schema drift", async () => {
  const { source, snapshot } = await fixture();
  const cases = [
    [
      "MarketStorage append",
      source.replace(
        "        address distributor;\n    }\n    /// @custom:storage-location erc7201:civilization.game.construction-queue.v2",
        "        address distributor;\n        uint256 forbiddenMarketField;\n    }\n    /// @custom:storage-location erc7201:civilization.game.construction-queue.v2",
      ),
      "civilization.game.market.v2",
    ],
    [
      "BuybackStorage append",
      source.replace(
        "        address vault;\n    }\n    bytes32 private constant GAME_STORAGE_LOCATION",
        "        address vault;\n        uint256 forbiddenBuybackField;\n    }\n    bytes32 private constant GAME_STORAGE_LOCATION",
      ),
      "civilization.game.buyback.v3",
    ],
    [
      "MarketStorage reorder",
      source.replace(
        "        mapping(uint8 => uint256) priceWeiPerUnit;\n        mapping(uint8 => uint256) inventory;",
        "        mapping(uint8 => uint256) inventory;\n        mapping(uint8 => uint256) priceWeiPerUnit;",
      ),
      "civilization.game.market.v2",
    ],
    [
      "BuybackStorage type mutation",
      source
        .replace("        address vault;", "        address payable vault;")
        .replace(
          "_buyback().vault = vault;",
          "_buyback().vault = payable(vault);",
        ),
      "civilization.game.buyback.v3",
    ],
  ];

  for (const [name, changed, namespace] of cases) {
    assert.throws(
      () => assertStorageNamespaceBindings(compileAst(changed), snapshot),
      new RegExp(`storage schema drift detected for ${namespace}`),
      name,
    );
  }
});

test("V1 storage verifier rejects field type and layout changes", async () => {
  const { source, snapshot } = await fixture();
  const changedType = source.replace(
    "uint64 worldIdIssuerSchemaId;",
    "uint256 worldIdIssuerSchemaId;",
  );
  const widened = source.replace(
    "address timelock;\n        mapping(address => Player) players;",
    "address timelock;\n        uint256 forbiddenV1Field;\n        mapping(address => Player) players;",
  );

  assert.throws(
    () => assertV1StorageCompatibility(compileAst(changedType), snapshot),
    /V1 storage layout drift detected in GameStorage/,
  );
  assert.throws(
    () => assertV1StorageCompatibility(compileAst(widened), snapshot),
    /V1 storage layout drift detected in GameStorage/,
  );
});

test("V1 storage verifier rejects reordered enum members", async () => {
  const { source, snapshot } = await fixture();
  const reordered = source.replace(
    "Townhall,\n        Timber,",
    "Timber,\n        Townhall,",
  );

  assert.throws(
    () => assertV1StorageCompatibility(compileAst(reordered), snapshot),
    /V1 storage enum order drift detected in Building/,
  );
});

test("namespace verifier rejects V1 slot and accessor drift", async () => {
  const { source, snapshot } = await fixture();
  const wrongSlot = source.replace(
    "0xb9c5fb29a19a4c3e9d391dc26eaefcdaaec2a4fc6362d4bd27f1470fa2592b00;\n    bytes32 private constant MARKET_STORAGE_LOCATION",
    "0xcee92606729e5d492c2082be6bb48c8bd80e80fae11c8dd742ee28f82e210100;\n    bytes32 private constant MARKET_STORAGE_LOCATION",
  );
  const wrongAccessor = source.replace(
    "$.slot := GAME_STORAGE_LOCATION\n        }\n    }\n    function _market",
    "$.slot := MARKET_STORAGE_LOCATION\n        }\n    }\n    function _market",
  );

  assert.throws(
    () => assertStorageNamespaceBindings(compileAst(wrongSlot), snapshot),
    /storage namespace slot drift detected for civilization\.game\.storage\.v1/,
  );
  assert.throws(
    () => assertStorageNamespaceBindings(compileAst(wrongAccessor), snapshot),
    /storage accessor binding drift detected for civilization\.game\.storage\.v1/,
  );
});

test("namespace verifier rejects V2 annotation, slot, and accessor drift", async () => {
  const { source, snapshot } = await fixture();
  const wrongAnnotation = source.replace(
    "@custom:storage-location erc7201:civilization.game.market.v2",
    "@custom:storage-location erc7201:civilization.game.storage.v1",
  );
  const wrongSlot = source.replace(
    "0xcee92606729e5d492c2082be6bb48c8bd80e80fae11c8dd742ee28f82e210100;\n    // Separate ERC-7201 namespace",
    "0xb9c5fb29a19a4c3e9d391dc26eaefcdaaec2a4fc6362d4bd27f1470fa2592b00;\n    // Separate ERC-7201 namespace",
  );
  const wrongAccessor = source.replace(
    "$.slot := MARKET_STORAGE_LOCATION\n        }\n    }\n    function _constructionQueue",
    "$.slot := GAME_STORAGE_LOCATION\n        }\n    }\n    function _constructionQueue",
  );
  const wrongBuybackAccessor = source.replace(
    "$.slot := BUYBACK_STORAGE_LOCATION\n        }\n    }\n\n    event WorldIdRegistered",
    "$.slot := MARKET_STORAGE_LOCATION\n        }\n    }\n\n    event WorldIdRegistered",
  );

  assert.throws(
    () => assertStorageNamespaceBindings(compileAst(wrongAnnotation), snapshot),
    /storage namespace annotation drift detected for civilization\.game\.market\.v2/,
  );
  assert.throws(
    () => assertStorageNamespaceBindings(compileAst(wrongSlot), snapshot),
    /storage namespace slot drift detected for civilization\.game\.market\.v2/,
  );
  assert.throws(
    () => assertStorageNamespaceBindings(compileAst(wrongAccessor), snapshot),
    /storage accessor binding drift detected for civilization\.game\.market\.v2/,
  );
  assert.throws(
    () =>
      assertStorageNamespaceBindings(
        compileAst(wrongBuybackAccessor),
        snapshot,
      ),
    /storage accessor binding drift detected for civilization\.game\.buyback\.v3/,
  );
});

test("namespace verifier rejects post-assignment slot overwrites", async () => {
  const { source, snapshot } = await fixture();
  const cases = [
    ["GAME_STORAGE_LOCATION", "civilization.game.storage.v1"],
    ["MARKET_STORAGE_LOCATION", "civilization.game.market.v2"],
    ["BUYBACK_STORAGE_LOCATION", "civilization.game.buyback.v3"],
  ];

  for (const [constant, namespace] of cases) {
    const overwritten = source.replace(
      `$.slot := ${constant}\n        }`,
      `$.slot := ${constant}\n            $.slot := 0\n        }`,
    );
    assert.throws(
      () => assertStorageNamespaceBindings(compileAst(overwritten), snapshot),
      new RegExp(`storage accessor binding drift detected for ${namespace}`),
    );
  }
});

test("namespace verifier rejects literal and computed accessor slots", async () => {
  const { source, snapshot } = await fixture();
  const literal = source.replace(
    "$.slot := GAME_STORAGE_LOCATION",
    "$.slot := 0",
  );
  const computed = source.replace(
    "$.slot := GAME_STORAGE_LOCATION",
    "$.slot := or(GAME_STORAGE_LOCATION, 0)",
  );

  assert.throws(
    () => assertStorageNamespaceBindings(compileAst(literal), snapshot),
    /storage accessor binding drift detected for civilization\.game\.storage\.v1/,
  );
  assert.throws(
    () => assertStorageNamespaceBindings(compileAst(computed), snapshot),
    /storage accessor binding drift detected for civilization\.game\.storage\.v1/,
  );
});

test("namespace verifier rejects redirected protected-storage accessor aliases", async () => {
  const { source, snapshot } = await fixture();
  const cases = [
    ["_game", "GameStorage", "civilization.game.storage.v1"],
    ["_market", "MarketStorage", "civilization.game.market.v2"],
    ["_buyback", "BuybackStorage", "civilization.game.buyback.v3"],
  ];

  for (const [accessor, struct, namespace] of cases) {
    const aliased = redirectAccessorCalls(
      insertAfterAccessor(source, accessor, struct),
      accessor,
    );
    assert.match(aliased, new RegExp(`function ${accessor}\\(\\)`));
    assert.match(aliased, new RegExp(`function ${accessor}Unsafe\\(\\)`));
    assert.throws(
      () => assertStorageNamespaceBindings(compileAst(aliased), snapshot),
      new RegExp(`storage accessor alias detected for ${namespace}`),
    );
  }
});

test("namespace verifier rejects local protected-storage assembly bindings", async () => {
  const { source, snapshot } = await fixture();
  const boundLocal = source.replace(
    "    event WalletRegistered(address indexed player);",
    "    function unsafeGameStorageLocal() internal pure {\n        GameStorage storage local = _game();\n        assembly {\n            local.slot := 0\n        }\n    }\n\n    event WalletRegistered(address indexed player);",
  );

  assert.throws(
    () => assertStorageNamespaceBindings(compileAst(boundLocal), snapshot),
    /protected storage slot binding outside canonical accessor for civilization\.game\.storage\.v1/,
  );
});

test("namespace verifier rejects direct protected-slot stores", async () => {
  const { source, snapshot } = await fixture();
  const cases = [
    ["GAME_STORAGE_LOCATION", "civilization.game.storage.v1"],
    ["MARKET_STORAGE_LOCATION", "civilization.game.market.v2"],
    ["BUYBACK_STORAGE_LOCATION", "civilization.game.buyback.v3"],
  ];

  for (const [constant, namespace] of cases) {
    const injected = insertBeforeEvents(
      source,
      `    function unsafeStore() internal {\n        assembly {\n            sstore(${constant}, 0)\n        }\n    }`,
    );
    assert.throws(
      () => assertStorageNamespaceBindings(compileAst(injected), snapshot),
      new RegExp(
        `protected storage constant outside canonical accessor for ${namespace}`,
      ),
    );
  }
});

test("namespace verifier rejects arithmetic reconstruction of protected slots", async () => {
  const { source, snapshot } = await fixture();
  const slotMinusOne =
    "0xb9c5fb29a19a4c3e9d391dc26eaefcdaaec2a4fc6362d4bd27f1470fa2592aff";
  const cases = [
    [
      "store",
      `    function unsafeArithmeticStore() internal {
        assembly {
            sstore(add(${slotMinusOne}, 1), 0)
        }
    }`,
      "sstore",
    ],
    [
      "read",
      `    function unsafeArithmeticRead() internal view {
        assembly {
            let value := sload(add(${slotMinusOne}, 1))
        }
    }`,
      "sload",
    ],
  ];

  for (const [name, code, operation] of cases) {
    assert.throws(
      () =>
        assertStorageNamespaceBindings(
          compileAst(insertBeforeEvents(source, code)),
          snapshot,
        ),
      new RegExp(
        `raw ordinary-storage Yul operation ${operation} outside canonical accessor`,
      ),
      name,
    );
  }
});

test("namespace verifier rejects noncanonical protected-slot reads and bindings", async () => {
  const { source, snapshot } = await fixture();
  const cases = [
    `    function unsafeLoad() internal view {\n        assembly {\n            let value := sload(GAME_STORAGE_LOCATION)\n        }\n    }`,
    `    function unsafeComputed() internal pure {\n        assembly {\n            let value := or(GAME_STORAGE_LOCATION, 0)\n        }\n    }`,
    `    function unsafeShadow() internal pure {\n        GameStorage storage shadow;\n        assembly {\n            shadow.slot := GAME_STORAGE_LOCATION\n        }\n    }`,
  ];

  for (const code of cases) {
    assert.throws(
      () =>
        assertStorageNamespaceBindings(
          compileAst(insertBeforeEvents(source, code)),
          snapshot,
        ),
      /protected storage constant outside canonical accessor for civilization\.game\.storage\.v1/,
    );
  }
});

test("namespace verifier rejects noncanonical protected-slot literals", async () => {
  const { source, snapshot } = await fixture();
  const injected = insertBeforeEvents(
    source,
    "    function unsafeLiteral() internal pure {\n        assembly {\n            let value := 0xb9c5fb29a19a4c3e9d391dc26eaefcdaaec2a4fc6362d4bd27f1470fa2592b00\n        }\n    }",
  );

  assert.throws(
    () => assertStorageNamespaceBindings(compileAst(injected), snapshot),
    /protected storage slot literal outside canonical accessor for civilization\.game\.storage\.v1/,
  );
});

test("V1 storage verifier permits an additive independent ERC-7201 namespace", async () => {
  const { source, snapshot } = await fixture();
  const additiveNamespace = source.replace(
    "    /// @custom:storage-location erc7201:civilization.game.buyback.v3",
    "    /// @custom:storage-location erc7201:civilization.game.audit.v4\n    struct AuditStorage {\n        uint256 revision;\n    }\n    bytes32 private constant AUDIT_STORAGE_LOCATION =\n        0x94cb73efc01a8ed4f54331f6224ba7b43ed54b4cac018c787b4f6dd0d79d9800;\n    function _audit() internal pure returns (AuditStorage storage $) {\n        assembly {\n            $.slot := AUDIT_STORAGE_LOCATION\n        }\n    }\n    /// @custom:storage-location erc7201:civilization.game.buyback.v3",
  );

  assert.doesNotThrow(() =>
    assertV1StorageCompatibility(compileAst(additiveNamespace), snapshot),
  );
  assert.doesNotThrow(() =>
    assertStorageNamespaceBindings(compileAst(additiveNamespace), snapshot),
  );
});
