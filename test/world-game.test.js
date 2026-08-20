import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  toFunctionSelector,
  zeroAddress,
} from "viem";
import {
  CIVILIZATION_GAME_ABI,
  WORLD_TOKEN_ABI,
} from "../src/abi/CivilizationGame.js";
import {
  BUILDING_INDEX,
  CIVILIZATION_GAME_ADDRESS,
  TROOP_INDEX,
  decodeCivilizationState,
  encodeWalletRegistration,
  encodeWorldGameAction,
  readContractBuildDuration,
  createWorldGameAdapter,
  constructionBoostEligibility,
  claimEligibility,
  getContractBuildingCost,
  projectContractUpgradeImpact,
  projectCivilizationState,
  registerWalletWithMiniKit,
} from "../src/world-game.js";

const defender = "0x2222222222222222222222222222222222222222";
const alternateGame = "0x3333333333333333333333333333333333333333";
const configuredWorldToken = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003";
const userOpHash = `0x${"ab".repeat(32)}`;

function functionSelector(signature) {
  return toFunctionSelector(signature);
}

test("Civilization contract state decodes CGOLD and chain timestamps for the UI", () => {
  const raw = [
    true,
    1_700_000_001n,
    1_700_000_222n,
    { wood: 81n, clay: 82n, stone: 83n, gold: 999n },
    [11n, 12n, 13n, 14n],
    [4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n],
    { spear: 21n, archer: 22n, rider: 23n },
    { defender, arrivesAt: 1_700_000_333n, spear: 3n, archer: 2n, rider: 1n },
    {
      pending: true,
      building: BUILDING_INDEX.goldmine,
      completesAt: 1_700_000_444n,
    },
    3n,
  ];

  const state = decodeCivilizationState(raw, 12_345_000_000_000_000_000n);

  assert.equal(state.registered, true);
  assert.deepEqual(state.resources, {
    wood: 81,
    clay: 82,
    stone: 83,
    gold: 12.345,
  });
  assert.deepEqual(state.unclaimed, {
    wood: 11,
    clay: 12,
    stone: 13,
    gold: 14,
  });
  assert.deepEqual(state.buildings, {
    townhall: 4,
    timber: 5,
    claypit: 6,
    quarry: 7,
    warehouse: 8,
    workshop: 9,
    goldmine: 10,
    barracks: 11,
  });
  assert.deepEqual(state.troops, { spear: 21, archer: 22, rider: 23 });
  assert.deepEqual(state.pendingRaid, {
    kind: "pvp",
    targetId: getAddress(defender),
    arrivesAt: 1_700_000_333_000,
    army: { spear: 3, archer: 2, rider: 1 },
  });
  assert.deepEqual(state.construction, {
    pending: true,
    building: BUILDING_INDEX.goldmine,
    buildingId: "goldmine",
    completesAt: 1_700_000_444_000,
    slot: 0,
  });
  assert.equal(state.gatherAvailableAt, 1_700_000_222_000);
  assert.equal(state.last, 1_700_000_001_000);
  assert.equal(state.prestigeCount, 3);
  assert.deepEqual(state.targets, []);
  assert.equal(state.raids, 0);
  assert.equal(state.lastRaid, null);
});

test("empty on-chain raid and construction tuples remain inactive", () => {
  const raw = [
    true,
    1n,
    2n,
    [3n, 4n, 5n, 6n],
    [7n, 8n, 9n, 10n],
    [0n, 1n, 1n, 1n, 1n, 0n, 0n, 0n],
    [0n, 0n, 0n],
    [zeroAddress, 0n, 0n, 0n, 0n],
    [false, 0, 0n],
    0n,
  ];

  const state = decodeCivilizationState(raw, 0n);
  assert.equal(state.pendingRaid, null);
  assert.deepEqual(state.construction, {
    pending: false,
    building: 0,
    buildingId: "townhall",
    completesAt: 0,
    slot: 0,
  });
});

test("construction reads retain stable slots for the legacy and parallel queues", () => {
  const raw = [
    true,
    1n,
    2n,
    [0n, 0n, 0n, 0n],
    [0n, 0n, 0n, 0n],
    [0n, 0n, 0n, 0n, 0n, 21n, 0n, 0n],
    [0n, 0n, 0n],
    [zeroAddress, 0n, 0n, 0n, 0n],
    [true, BUILDING_INDEX.timber, 100n],
    0n,
  ];
  const packed = (building, completesAt) =>
    1n | (BigInt(building) << 8n) | (BigInt(completesAt) << 16n);
  const state = decodeCivilizationState(raw, 0n, null, null, {
    jobs: [
      packed(BUILDING_INDEX.timber, 100),
      packed(BUILDING_INDEX.quarry, 200),
      packed(BUILDING_INDEX.claypit, 300),
    ],
  });

  assert.deepEqual(
    state.constructions.map(({ slot, buildingId }) => ({ slot, buildingId })),
    [
      { slot: 0, buildingId: "timber" },
      { slot: 1, buildingId: "quarry" },
      { slot: 2, buildingId: "claypit" },
    ],
  );
  assert.equal(state.constructionOccupied, 3);
  assert.equal(state.constructionCapacity, 3);
});

test("World client mirrors the workshop CGOLD bootstrap cost only for level 1", () => {
  const state = projectedSnapshot();
  const bootstrap = getContractBuildingCost(state, "workshop");
  assert.deepEqual(bootstrap, { wood: 90, clay: 110, stone: 105, gold: 0 });
  state.buildings.workshop = 1;
  assert.deepEqual(getContractBuildingCost(state, "workshop"), {
    wood: 144,
    clay: 176,
    stone: 168,
    gold: 24,
  });
});

test("every single-call Civilization action uses its deployed ABI selector and arguments", () => {
  const cases = [
    { type: "claim", signature: "claim()", functionName: "claim", payload: {} },
    {
      type: "upgrade",
      signature: "upgrade(uint8)",
      functionName: "upgrade",
      payload: { building: "barracks" },
      expectedArgs: [BUILDING_INDEX.barracks],
    },
    {
      type: "complete_upgrade",
      signature: "completeUpgrade()",
      functionName: "completeUpgrade",
      payload: {},
    },
    {
      type: "prestige",
      signature: "prestige()",
      functionName: "prestige",
      payload: {},
    },
    {
      type: "train",
      signature: "train(uint8,uint256)",
      functionName: "train",
      payload: { troop: "rider", amount: 3 },
      expectedArgs: [TROOP_INDEX.rider, 3n],
    },
    {
      type: "start_raid",
      signature: "startRaid(address,uint256,uint256,uint256)",
      functionName: "startRaid",
      payload: { targetId: defender, army: { spear: 4, archer: 5, rider: 6 } },
      expectedArgs: [getAddress(defender), 4n, 5n, 6n],
    },
    {
      type: "resolve_raid",
      signature: "resolveRaid()",
      functionName: "resolveRaid",
      payload: {},
    },
  ];

  for (const item of cases) {
    const transactions = encodeWorldGameAction(item.type, item.payload);
    assert.equal(
      transactions.length,
      1,
      `${item.type} must be one contract call`,
    );
    assert.equal(
      getAddress(transactions[0].to),
      getAddress(CIVILIZATION_GAME_ADDRESS),
    );
    assert.equal(transactions[0].value, "0x0");
    assert.equal(
      transactions[0].data.slice(0, 10),
      functionSelector(item.signature),
    );
    const decoded = decodeFunctionData({
      abi: CIVILIZATION_GAME_ABI,
      data: transactions[0].data,
    });
    assert.equal(decoded.functionName, item.functionName);
    assert.deepEqual(decoded.args ?? [], item.expectedArgs ?? []);
  }
});

test("construction duration is exposed through the authoritative contract ABI", async () => {
  const data = encodeFunctionData({
    abi: CIVILIZATION_GAME_ABI,
    functionName: "buildDuration",
    args: [BUILDING_INDEX.quarry, 30n],
  });
  assert.equal(
    data.slice(0, 10),
    functionSelector("buildDuration(uint8,uint256)"),
  );
  assert.deepEqual(decodeFunctionData({ abi: CIVILIZATION_GAME_ABI, data }), {
    functionName: "buildDuration",
    args: [BUILDING_INDEX.quarry, 30n],
  });
  await assert.rejects(
    readContractBuildDuration("market", 1),
    /invalid_building/,
  );
  await assert.rejects(
    readContractBuildDuration("quarry", 31),
    /invalid_building_level/,
  );
});

test("adapter exposes the contract build-duration read before an upgrade prompt", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  const calls = [];
  const adapter = createWorldGameAdapter({
    walletAddress: wallet,
    contractAddress: alternateGame,
    pollReceipt: async () => ({ receipt: { status: "success" } }),
    readBuildDuration: async (buildingId, level, contract) => {
      calls.push([buildingId, level, contract]);
      return 158n;
    },
  });
  assert.equal(await adapter.readBuildDuration("quarry", 2), 158n);
  assert.deepEqual(calls, [["quarry", 2, getAddress(alternateGame)]]);
});

test("registered wallet skips registration transaction and unregistered wallet sends exactly registerWallet", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  const sent = [];
  const registered = await registerWalletWithMiniKit({
    walletAddress: wallet,
    readState: async () => ({ registered: true }),
    pollReceipt: async () => {
      throw new Error("must_not_poll");
    },
    miniKit: {
      sendTransaction: async (request) => {
        sent.push(request);
        return {};
      },
    },
  });
  assert.equal(registered.alreadyRegistered, true);
  assert.equal(sent.length, 0);

  let reads = 0;
  const initialized = await registerWalletWithMiniKit({
    walletAddress: wallet,
    contractAddress: alternateGame,
    readState: async () => ({ registered: ++reads === 2 }),
    pollReceipt: async (hash) => ({ receipt: { status: "success", hash } }),
    miniKit: {
      sendTransaction: async (request) => {
        sent.push(request);
        return {
          executedWith: "minikit",
          data: { status: "success", userOpHash, from: wallet },
        };
      },
    },
  });
  assert.equal(initialized.alreadyRegistered, false);
  assert.equal(reads, 2, "must read before send and after receipt");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].transactions.length, 1);
  assert.deepEqual(
    sent[0].transactions,
    encodeWalletRegistration(alternateGame),
  );
  assert.equal(
    getAddress(sent[0].transactions[0].to),
    getAddress(alternateGame),
  );
  assert.equal(
    decodeFunctionData({
      abi: CIVILIZATION_GAME_ABI,
      data: sent[0].transactions[0].data,
    }).functionName,
    "registerWallet",
  );
});

test("wallet registration bypasses the runtime gate and can dispatch", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  let gateRequests = 0;
  let sends = 0;
  const result = await registerWalletWithMiniKit({
    walletAddress: wallet,
    readState: async () => ({ registered: sends > 0 }),
    pollReceipt: async () => ({ receipt: { status: "success" } }),
    // An ignored legacy option proves registration makes no runtime-gate request.
    runtimeGate: async () => {
      gateRequests += 1;
      throw new Error("contract_runtime_mismatched");
    },
    miniKit: {
      sendTransaction: async () => {
        sends += 1;
        return {
          executedWith: "minikit",
          data: { status: "success", userOpHash, from: wallet },
        };
      },
    },
  });
  assert.equal(result.alreadyRegistered, false);
  assert.equal(gateRequests, 0);
  assert.equal(sends, 1);
});

test("an unavailable authoritative registration read never opens a registration transaction", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  let sends = 0;
  await assert.rejects(
    registerWalletWithMiniKit({
      walletAddress: wallet,
      readState: async () => {
        throw new Error("rpc_unavailable");
      },
      pollReceipt: async () => ({ receipt: { status: "success" } }),
      miniKit: {
        sendTransaction: async () => {
          sends += 1;
          return {};
        },
      },
    }),
    /rpc_unavailable/,
  );
  assert.equal(sends, 0);
});

test("wallet registration requires the exact WalletAuth checksum address, receipt, and registered readback", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  const base = {
    walletAddress: wallet,
    readState: async () => ({ registered: false }),
    pollReceipt: async () => ({ receipt: { status: "success" } }),
  };
  await assert.rejects(
    registerWalletWithMiniKit({
      ...base,
      miniKit: {
        sendTransaction: async () => ({
          executedWith: "minikit",
          data: { status: "success", userOpHash, from: defender },
        }),
      },
    }),
    /transaction_wallet_mismatch/,
  );
  await assert.rejects(
    registerWalletWithMiniKit({
      ...base,
      miniKit: {
        sendTransaction: async () => ({
          executedWith: "minikit",
          data: { status: "success", userOpHash, from: wallet },
        }),
      },
    }),
    /wallet_registration_not_confirmed/,
  );
  await assert.rejects(
    registerWalletWithMiniKit({
      ...base,
      miniKit: {
        sendTransaction: async () => ({
          executedWith: "minikit",
          data: { status: "error", error_code: "user_rejected" },
        }),
      },
    }),
    /user_rejected/,
  );
  await assert.rejects(
    registerWalletWithMiniKit({
      ...base,
      pollReceipt: async () => {
        throw new Error("receipt_timeout");
      },
      miniKit: {
        sendTransaction: async () => ({
          executedWith: "minikit",
          data: { status: "success", userOpHash, from: wallet },
        }),
      },
    }),
    /receipt_timeout/,
  );
  await assert.rejects(
    registerWalletWithMiniKit({
      ...base,
      miniKit: {
        sendTransaction: async () => ({
          executedWith: "minikit",
          data: { status: "success", userOpHash: "0x1234", from: wallet },
        }),
      },
    }),
    /wallet_registration_rejected/,
  );
});

test("wallet registration retry polls one pending user operation instead of sending a duplicate", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  let pending = null;
  let sends = 0;
  let polls = 0;
  let reads = 0;
  const options = {
    walletAddress: wallet,
    readState: async () => ({ registered: ++reads >= 3 }),
    pollReceipt: async (hash) => {
      polls += 1;
      assert.equal(hash, userOpHash);
      if (polls === 1) throw new Error("receipt_timeout");
      return { receipt: { status: "success" } };
    },
    onPendingUserOpHash: (hash) => {
      pending = hash;
    },
    miniKit: {
      sendTransaction: async () => {
        sends += 1;
        return {
          executedWith: "minikit",
          data: { status: "success", userOpHash, from: wallet },
        };
      },
    },
  };

  await assert.rejects(
    registerWalletWithMiniKit({ ...options, pendingUserOpHash: pending }),
    /receipt_timeout/,
  );
  assert.equal(
    pending,
    userOpHash,
    "timeout must retain the submitted operation hash",
  );
  const result = await registerWalletWithMiniKit({
    ...options,
    pendingUserOpHash: pending,
  });
  assert.equal(result.alreadyRegistered, false);
  assert.equal(
    pending,
    null,
    "confirmed readback clears the pending operation",
  );
  assert.equal(sends, 1, "retry must not open a second transaction prompt");
  assert.equal(polls, 2);
});

test("terminally failed wallet registration clears pending operation before a new send", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  let pending = userOpHash;
  let sends = 0;
  await assert.rejects(
    registerWalletWithMiniKit({
      walletAddress: wallet,
      pendingUserOpHash: pending,
      onPendingUserOpHash: (hash) => {
        pending = hash;
      },
      readState: async () => ({ registered: false }),
      pollReceipt: async () => {
        throw new Error("Transaction failed");
      },
      miniKit: {
        sendTransaction: async () => {
          sends += 1;
          return {};
        },
      },
    }),
    /transaction_failed/,
  );
  assert.equal(pending, null);
  assert.equal(sends, 0);
});

test("construction boost uses the supplied validated WLD configuration", () => {
  const transactions = encodeWorldGameAction(
    "boost",
    { hours: 2 },
    CIVILIZATION_GAME_ADDRESS,
    configuredWorldToken,
  );
  const amount = 2n * 10n ** 18n;

  assert.equal(transactions.length, 2);
  assert.equal(
    getAddress(transactions[0].to),
    getAddress(configuredWorldToken),
  );
  assert.equal(
    transactions[0].data.slice(0, 10),
    functionSelector("approve(address,uint256)"),
  );
  assert.equal(transactions[0].value, "0x0");
  assert.deepEqual(
    decodeFunctionData({ abi: WORLD_TOKEN_ABI, data: transactions[0].data }),
    {
      functionName: "approve",
      args: [getAddress(CIVILIZATION_GAME_ADDRESS), amount],
    },
  );

  assert.equal(
    getAddress(transactions[1].to),
    getAddress(CIVILIZATION_GAME_ADDRESS),
  );
  assert.equal(
    transactions[1].data.slice(0, 10),
    functionSelector("boostConstruction(uint256)"),
  );
  assert.equal(transactions[1].value, "0x0");
  assert.deepEqual(
    decodeFunctionData({
      abi: CIVILIZATION_GAME_ABI,
      data: transactions[1].data,
    }),
    { functionName: "boostConstruction", args: [2n] },
  );
});

test("construction slot ABI keeps slot zero legacy-compatible and addresses slots one and two", () => {
  for (const [slot, completeSignature, boostSignature] of [
    [0, "completeUpgrade()", "boostConstruction(uint256)"],
    [1, "completeUpgrade(uint8)", "boostConstruction(uint8,uint256)"],
    [2, "completeUpgrade(uint8)", "boostConstruction(uint8,uint256)"],
  ]) {
    const payload = slot ? { slot } : {};
    const complete = encodeWorldGameAction("complete_upgrade", payload)[0];
    const boost = encodeWorldGameAction(
      "boost",
      slot ? { slot, hours: 1 } : { hours: 1 },
      CIVILIZATION_GAME_ADDRESS,
      configuredWorldToken,
    )[1];
    assert.equal(
      complete.data.slice(0, 10),
      functionSelector(completeSignature),
    );
    assert.equal(boost.data.slice(0, 10), functionSelector(boostSignature));
  }
});

test("construction boost eligibility matches the contract boundary and rejects invalid states", () => {
  const construction = { pending: true, completesAt: 3_600_000 };
  assert.deepEqual(
    constructionBoostEligibility({ construction, now: 0 }),
    { eligible: true, reason: null, remainingSeconds: 3_600 },
    "the contract permits a boost when exactly one full hour remains",
  );
  assert.equal(
    constructionBoostEligibility({
      construction: { ...construction, completesAt: 3_599_000 },
      now: 0,
    }).reason,
    "less_than_one_hour",
  );
  assert.equal(
    constructionBoostEligibility({ construction, now: 3_600_000 }).reason,
    "construction_complete",
  );
  assert.equal(
    constructionBoostEligibility({ construction: { pending: false }, now: 0 })
      .reason,
    "no_boostable_construction",
  );
  assert.equal(
    constructionBoostEligibility({ construction, now: 0, busy: true }).reason,
    "transaction_pending",
  );
});

test("runtime contract and WLD addresses drive every game transaction target", () => {
  const claim = encodeWorldGameAction("claim", {}, alternateGame);
  const boost = encodeWorldGameAction(
    "boost",
    { hours: 1 },
    alternateGame,
    configuredWorldToken,
  );

  assert.equal(getAddress(claim[0].to), getAddress(alternateGame));
  assert.equal(getAddress(boost[1].to), getAddress(alternateGame));
  assert.deepEqual(
    decodeFunctionData({ abi: WORLD_TOKEN_ABI, data: boost[0].data }).args,
    [getAddress(alternateGame), 10n ** 18n],
  );
});

test("World contract adapter refuses local market swaps and malformed actions", () => {
  assert.throws(
    () =>
      encodeWorldGameAction("swap", { from: "wood", to: "clay", amount: 1 }),
    /world_market_unavailable/,
  );
  assert.throws(() => encodeWorldGameAction("unknown"), /invalid_action/);
  assert.throws(
    () => encodeWorldGameAction("boost", { hours: 0 }),
    /invalid_boost/,
  );
  assert.throws(
    () => encodeWorldGameAction("boost", { hours: 1 }),
    /invalid_world_token/,
  );
  assert.throws(
    () =>
      encodeWorldGameAction(
        "boost",
        { hours: 1 },
        CIVILIZATION_GAME_ADDRESS,
        "not-an-address",
      ),
    /invalid_world_token/,
  );
  assert.throws(
    () => encodeWorldGameAction("upgrade", { building: "market" }),
    /invalid_building/,
  );
  assert.throws(
    () => encodeWorldGameAction("train", { troop: "spear", amount: 1.5 }),
    /invalid_troop/,
  );
});

function projectedSnapshot({
  last = 1_000_000,
  registered = true,
  field = 0,
} = {}) {
  return {
    registered,
    last,
    resources: { wood: 80, clay: 80, stone: 80, gold: 0 },
    unclaimed: { wood: field, clay: field, stone: field, gold: field },
    buildings: {
      townhall: 0,
      timber: 1,
      claypit: 1,
      quarry: 1,
      warehouse: 1,
      workshop: 0,
      goldmine: 0,
      barracks: 0,
    },
    troops: { spear: 0, archer: 0, rider: 0 },
    prestigeCount: 0,
    chainTimestamp: last,
    performanceAnchor: last,
  };
}

test("live field projection is monotonic, uses the contract hourly formula, caps, and never compounds", () => {
  const snapshot = projectedSnapshot();
  const atHour = projectCivilizationState(snapshot, snapshot.last + 3_600_000);
  const later = projectCivilizationState(snapshot, snapshot.last + 7_200_000);
  assert.equal(
    atHour.unclaimed.wood,
    12,
    "300/day is exactly 12 whole wood per hour",
  );
  assert.equal(
    atHour.unclaimed.clay,
    11,
    "270/day rounds down exactly like Solidity",
  );
  assert.equal(later.unclaimed.wood, 25);
  assert.ok(later.unclaimed.wood >= atHour.unclaimed.wood);
  assert.equal(
    projectCivilizationState(snapshot, snapshot.last + 3_600_000).unclaimed
      .wood,
    atHour.unclaimed.wood,
    "frames must use the anchor, not prior display",
  );
  const reconciled = {
    ...snapshot,
    last: snapshot.last + 3_600_000,
    performanceAnchor: snapshot.last + 3_600_000,
    unclaimed: atHour.unclaimed,
  };
  assert.equal(
    projectCivilizationState(reconciled, snapshot.last + 7_200_000).unclaimed
      .wood,
    24,
    "authoritative reconciliation replaces rather than adds projected stock",
  );
  assert.equal(
    projectCivilizationState(
      projectedSnapshot({ field: 499 }),
      snapshot.last + 86_400_000,
    ).unclaimed.wood,
    500,
    "warehouse cap applies",
  );
  assert.equal(
    projectCivilizationState(snapshot, snapshot.last + 72 * 3_600_000).unclaimed
      .wood,
    300,
    "background jumps are capped at 24 hours",
  );
  assert.equal(
    projectCivilizationState(
      projectedSnapshot({ registered: false }),
      snapshot.last + 3_600_000,
    ).unclaimed.wood,
    0,
    "unregistered snapshots never tick",
  );
  assert.equal(
    projectCivilizationState(null, 1),
    null,
    "RPC/error state never invents resources",
  );
});

test("upgrade impact projection matches contract fixture boundaries for rounding, slots, defense, and unlocks", () => {
  const fixture = projectedSnapshot();
  fixture.buildings.warehouse = 1;
  const warehouse = projectContractUpgradeImpact(fixture, "warehouse");
  assert.deepEqual(warehouse.capacity, { before: 500, after: 850, delta: 350 });

  fixture.buildings.workshop = 10;
  const workshop10 = projectContractUpgradeImpact(fixture, "workshop");
  assert.deepEqual(workshop10.constructionSlots, {
    before: 1,
    after: 2,
    delta: 1,
  });
  fixture.buildings.workshop = 20;
  const workshop20 = projectContractUpgradeImpact(fixture, "workshop");
  assert.deepEqual(workshop20.constructionSlots, {
    before: 2,
    after: 3,
    delta: 1,
  });
  fixture.buildings.workshop = 21;
  assert.equal(
    projectContractUpgradeImpact(fixture, "workshop").constructionSlots,
    null,
  );

  fixture.buildings.townhall = 2;
  fixture.buildings.workshop = 1;
  const townhall = projectContractUpgradeImpact(fixture, "townhall");
  assert.deepEqual(townhall.defense, { before: 40, after: 60, delta: 20 });
  assert.deepEqual(townhall.unlocks.buildings, ["barracks"]);

  fixture.buildings.townhall = 3;
  fixture.buildings.workshop = 1;
  fixture.buildings.barracks = 3;
  const workshop = projectContractUpgradeImpact(fixture, "workshop");
  assert.deepEqual(workshop.unlocks.troops, ["rider"]);
  fixture.buildings.townhall = 30;
  assert.deepEqual(projectContractUpgradeImpact(fixture, "townhall"), {
    available: false,
    reason: "max_level",
  });
});

test("claim eligibility requires a fresh chain anchor, elapsed cooldown, whole transferable stock, and treats gold independently", () => {
  const eligible = projectedSnapshot({ field: 1 });
  assert.equal(claimEligibility(eligible), true);
  assert.equal(
    claimEligibility({ ...eligible, chainTimestamp: null }),
    false,
    "an unanchored display is never a transaction preflight",
  );
  assert.equal(
    claimEligibility({
      ...eligible,
      gatherAvailableAt: eligible.chainTimestamp + 1,
    }),
    false,
    "chain cooldown blocks claims",
  );
  const fullStorage = {
    ...eligible,
    resources: { ...eligible.resources, wood: 500, clay: 500, stone: 500 },
    unclaimed: { wood: 1, clay: 1, stone: 1, gold: 0 },
  };
  assert.equal(
    claimEligibility(fullStorage),
    false,
    "full protected storage cannot burn a claim",
  );
  assert.equal(
    claimEligibility({
      ...fullStorage,
      unclaimed: { ...fullStorage.unclaimed, gold: 1 },
    }),
    true,
    "gold remains transferable without warehouse room",
  );
});

test("zero claim is rejected before MiniKit and a pending claim rejects a different action", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  let sends = 0;
  const unavailable = createWorldGameAdapter({
    walletAddress: wallet,
    contractAddress: alternateGame,
    readState: async () => projectedSnapshot(),
    pollReceipt: async () => ({ receipt: { status: "success" } }),
    miniKit: {
      sendTransaction: async () => {
        sends += 1;
        return {};
      },
    },
  });
  await assert.rejects(unavailable.execute("claim"), /claim_not_available/);
  assert.equal(sends, 0, "no MiniKit prompt is opened for a zero claim");

  const pending = createWorldGameAdapter({
    walletAddress: wallet,
    contractAddress: alternateGame,
    readState: async () => projectedSnapshot({ field: 1 }),
    pollReceipt: async () => {
      throw new Error("receipt_timeout");
    },
    miniKit: {
      sendTransaction: async () => ({
        executedWith: "minikit",
        data: { status: "success", userOpHash, from: wallet },
      }),
    },
  });
  await pending.execute("claim");
  await assert.rejects(
    pending.execute("upgrade", { building: "quarry" }),
    /transaction_pending/,
  );
});

test("boost preflight admits an exact hour and blocks invalid chain state before MiniKit", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  const boostableState = {
    ...projectedSnapshot(),
    chainTimestamp: 1_000_000,
    construction: { pending: true, completesAt: 4_600_000 },
  };
  let sends = 0;
  const adapter = createWorldGameAdapter({
    walletAddress: wallet,
    contractAddress: alternateGame,
    worldTokenAddress: configuredWorldToken,
    readState: async () => boostableState,
    pollReceipt: async () => ({ receipt: { status: "success", logs: [] } }),
    miniKit: {
      sendTransaction: async () => {
        sends += 1;
        return {
          executedWith: "minikit",
          data: { status: "success", userOpHash, from: wallet },
        };
      },
    },
  });
  await adapter.execute("boost", { hours: 1 });
  assert.equal(sends, 1, "an exact one-hour remainder opens the wallet prompt");

  const invalid = createWorldGameAdapter({
    walletAddress: wallet,
    contractAddress: alternateGame,
    worldTokenAddress: configuredWorldToken,
    readState: async () => ({
      ...boostableState,
      construction: { pending: true, completesAt: 4_599_000 },
    }),
    pollReceipt: async () => ({ receipt: { status: "success", logs: [] } }),
    miniKit: { sendTransaction: async () => ({}) },
  });
  await assert.rejects(
    invalid.execute("boost", { hours: 1 }),
    /less_than_one_hour/,
  );
});

test("claim sends once, validates MiniKit identity, waits for receipt, and rereads authoritative state", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  let sends = 0;
  let reads = 0;
  const order = [];
  const adapter = createWorldGameAdapter({
    walletAddress: wallet,
    contractAddress: alternateGame,
    readState: async () => {
      order.push("read");
      return {
        ...projectedSnapshot({ field: 1 }),
        registered: true,
        read: ++reads,
      };
    },
    pollReceipt: async (hash) => {
      order.push("receipt");
      return { receipt: { status: "success", hash, logs: [] } };
    },
    miniKit: {
      sendTransaction: async () => {
        sends += 1;
        order.push("send");
        return {
          executedWith: "minikit",
          data: { status: "success", userOpHash, from: wallet },
        };
      },
    },
  });
  const [first, second] = await Promise.all([
    adapter.execute("claim"),
    adapter.execute("claim"),
  ]);
  assert.equal(sends, 1, "double tap shares one explicit user-operation");
  assert.equal(first.userOpHash, userOpHash);
  assert.equal(
    second.state.read,
    2,
    "the shared operation performs one preflight and one post-receipt readback",
  );
  assert.equal(reads, 2);
  assert.deepEqual(
    order,
    ["read", "send", "receipt", "read"],
    "fresh preflight precedes MiniKit and receipt confirmation precedes readback",
  );
});

test("claim timeout retries its existing hash, while failed receipts and mismatched senders allow safe recovery", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  let sends = 0;
  let polls = 0;
  const adapter = createWorldGameAdapter({
    walletAddress: wallet,
    contractAddress: alternateGame,
    readState: async () => projectedSnapshot({ field: 1 }),
    pollReceipt: async () => {
      polls += 1;
      if (polls === 1) throw new Error("receipt_timeout");
      return { receipt: { status: "success", logs: [] } };
    },
    miniKit: {
      sendTransaction: async () => {
        sends += 1;
        return {
          executedWith: "minikit",
          data: { status: "success", userOpHash, from: wallet },
        };
      },
    },
  });
  const timedOut = await adapter.execute("claim");
  assert.equal(timedOut.pending, true);
  await adapter.execute("claim");
  assert.equal(sends, 1, "timeout polling must not open a duplicate claim");

  let failedSends = 0;
  let failedPolls = 0;
  const retryAdapter = createWorldGameAdapter({
    walletAddress: wallet,
    contractAddress: alternateGame,
    readState: async () => projectedSnapshot({ field: 1 }),
    pollReceipt: async () => ({
      receipt: {
        status: ++failedPolls === 1 ? "reverted" : "success",
        logs: [],
      },
    }),
    miniKit: {
      sendTransaction: async () => {
        failedSends += 1;
        return {
          executedWith: "minikit",
          data: { status: "success", userOpHash, from: wallet },
        };
      },
    },
  });
  await assert.rejects(retryAdapter.execute("claim"), /transaction_failed/);
  // A failed receipt cleared its hash, so a later explicit gesture is eligible to send again.
  await retryAdapter.execute("claim");
  assert.equal(failedSends, 2);

  const mismatch = createWorldGameAdapter({
    walletAddress: wallet,
    contractAddress: alternateGame,
    readState: async () => projectedSnapshot({ field: 1 }),
    pollReceipt: async () => ({ receipt: { status: "success", logs: [] } }),
    miniKit: {
      sendTransaction: async () => ({
        executedWith: "minikit",
        data: { status: "success", userOpHash, from: defender },
      }),
    },
  });
  await assert.rejects(
    mismatch.execute("claim"),
    /transaction_wallet_mismatch/,
  );

  const cancelled = createWorldGameAdapter({
    walletAddress: wallet,
    contractAddress: alternateGame,
    readState: async () => projectedSnapshot({ field: 1 }),
    pollReceipt: async () => {
      throw new Error("must_not_poll");
    },
    miniKit: {
      sendTransaction: async () => ({
        executedWith: "minikit",
        data: { status: "error", error_code: "user_rejected" },
      }),
    },
  });
  await assert.rejects(cancelled.execute("claim"), /user_rejected/);
});

test("a timed-out UserOp survives adapter remount and resumes its scoped hash without a second MiniKit prompt", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  const storage = new Map();
  const priorStorage = globalThis.sessionStorage;
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  });
  try {
    let sends = 0;
    const first = createWorldGameAdapter({
      walletAddress: wallet,
      contractAddress: alternateGame,
      readState: async () => projectedSnapshot({ field: 1 }),
      pollReceipt: async () => {
        throw new Error("receipt_timeout");
      },
      miniKit: {
        sendTransaction: async () => ({
          executedWith: "minikit",
          data: { status: "success", userOpHash, from: wallet },
        }),
      },
    });
    await first.execute("claim");
    const second = createWorldGameAdapter({
      walletAddress: wallet,
      contractAddress: alternateGame,
      readState: async () => projectedSnapshot({ field: 1 }),
      pollReceipt: async (hash) => {
        assert.equal(hash, userOpHash);
        return { receipt: { status: "success", logs: [] } };
      },
      miniKit: {
        sendTransaction: async () => {
          sends += 1;
          throw new Error("must_not_send");
        },
      },
    });
    assert.equal(second.hasPending(), true);
    await assert.rejects(
      second.execute("upgrade", { building: "quarry" }),
      /transaction_pending/,
    );
    const resumed = await second.resumePending();
    assert.equal(resumed.pending, false);
    assert.equal(
      sends,
      0,
      "the persisted hash is polled rather than prompting again",
    );
    assert.equal(
      second.hasPending(),
      false,
      "success clears the scoped record",
    );
  } finally {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: priorStorage,
    });
  }
});
