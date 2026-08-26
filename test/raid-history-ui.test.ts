import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  appendStoredRaidReports,
  mapStoredRaidHistory,
  raidHistoryFailureStatus,
} from "../src/components/raid-history.ts";

const event = {
  kind: "raid_resolved",
  role: "attacker",
  counterparty: "0x2222222222222222222222222222222222222222",
  attackerWon: true,
  attack: "42",
  defense: "30",
  resources: { wood: "12", clay: "0", stone: "2", gold: "0" },
  blockNumber: "123",
  blockTimestamp: "2026-08-26T10:00:00.000Z",
  transactionHash: `0x${"a".repeat(64)}`,
  logIndex: 3,
};

test("raid history retains only presentation data and one-way local dedupe IDs", () => {
  const page = mapStoredRaidHistory({
    availability: "stored_finalized_events",
    coverage: { complete: false, checkpoint: { secret: "ignored" } },
    events: [{ ...event, topics: ["raw"], data: "0xraw" }],
    nextCursor: "opaque-server-cursor",
  });
  assert.ok(page);
  assert.deepEqual(page.reports[0].resources, event.resources);
  assert.deepEqual(Object.keys(page.reports[0]).sort(), [
    "attack",
    "attackerWon",
    "counterpartyLabel",
    "dedupeId",
    "defense",
    "resources",
    "role",
  ]);
  assert.equal(page.reports[0].counterpartyLabel, "0x2222…2222");
  assert.match(page.reports[0].dedupeId, /^raid-[a-z0-9]+-[a-z0-9]+$/);
  assert.doesNotMatch(page.reports[0].dedupeId, /aaaa|:3|0x/);
  assert.equal(
    mapStoredRaidHistory({ ...page, events: [{ ...event, attack: "-1" }] }),
    null,
  );
});

test("raid history pagination appends unique reports and preserves the first snapshot order", () => {
  const first = mapStoredRaidHistory({
    availability: "stored_finalized_events",
    coverage: { complete: false },
    events: [event],
    nextCursor: "cursor-a",
  })!;
  const duplicate = { ...event };
  const second = {
    ...event,
    transactionHash: `0x${"b".repeat(64)}`,
    logIndex: 0,
  };
  const appended = appendStoredRaidReports(
    first.reports,
    mapStoredRaidHistory({
      availability: "stored_finalized_events",
      coverage: { complete: false },
      events: [duplicate, second],
      nextCursor: null,
    })!.reports,
  );
  assert.deepEqual(
    appended.map((report) => report.dedupeId),
    [
      first.reports[0].dedupeId,
      mapStoredRaidHistory({
        availability: "stored_finalized_events",
        coverage: { complete: false },
        events: [second],
        nextCursor: null,
      })!.reports[0].dedupeId,
    ],
  );
});

test("raid history uses both local fingerprint lanes to resist single-lane collisions", () => {
  const first = mapStoredRaidHistory({
    availability: "stored_finalized_events",
    coverage: { complete: false },
    events: [event],
    nextCursor: null,
  })!;
  const distinct = mapStoredRaidHistory({
    availability: "stored_finalized_events",
    coverage: { complete: false },
    events: [{ ...event, transactionHash: `0x${"b".repeat(64)}` }],
    nextCursor: null,
  })!;
  assert.notEqual(first.reports[0].dedupeId, distinct.reports[0].dedupeId);
  assert.equal(first.reports[0].dedupeId.split("-").length, 3);
});

test("raid history treats empty, expired, and unavailable API responses honestly", () => {
  const empty = mapStoredRaidHistory({
    availability: "no_stored_replay",
    coverage: { complete: false },
    events: [],
    nextCursor: null,
  });
  assert.equal(empty?.reports.length, 0);
  assert.equal(raidHistoryFailureStatus(401), "session");
  assert.equal(raidHistoryFailureStatus(503), "error");
});

test("raid panel keeps reports private, loads twenty, resets a 409 once, and sends no action", async () => {
  const source = await readFile(
    new URL("../src/components/RaidPanel.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /request\(`\/api\/history\/raids\?\$\{query\}`,[\s\S]*credentials: "same-origin"/,
  );
  assert.match(source, /limit: "20"/);
  assert.match(source, /response\.status === 409 && cursor/);
  assert.match(source, /await loadRef\.current\(null\)/);
  assert.match(source, /requesting\.current/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /onSendRaid\([^)]*load/);
  assert.match(
    source,
    /reports: \[\],[\s\S]*nextCursor: null,[\s\S]*status: raidHistoryFailureStatus\(response\.status\)/,
  );
  assert.match(
    source,
    /if \(!response\.ok\) \{[\s\S]*reports: \[\],[\s\S]*nextCursor: null,[\s\S]*status: raidHistoryFailureStatus\(response\.status\)/,
  );
  assert.match(source, /history\.status === "error"/);
});

test("static raid-history audit states use sanitized presentation data while the 409 story keeps the controller path", async () => {
  const [panel, stories, capture, packageJson] = await Promise.all([
    readFile(
      new URL("../src/components/RaidPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/components/CivilizationUiAudit.stories.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../scripts/capture-storybook-audit.mjs", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const scripts = JSON.parse(packageJson).scripts;
  assert.match(panel, /export function RaidHistoryView/);
  assert.match(
    panel,
    /raidHistoryPresentation\?: RaidHistoryPresentationState/,
  );
  assert.match(panel, /props\.raidHistoryPresentation[\s\S]*?<RaidHistoryView/);
  assert.match(stories, /export const RaidHistoryLoaded/);
  assert.match(stories, /export const RaidHistoryUpdatedFinalState/);
  const staticStories = stories.slice(
    stories.indexOf("export const RaidHistoryLoaded"),
    stories.indexOf("export const RaidHistoryCheckpointResetBehavior"),
  );
  const staticFixture = stories.slice(
    stories.indexOf("function RaidHistoryStaticFixture"),
    stories.indexOf("function RaidHistoryCheckpointResetBehaviorFixture"),
  );
  assert.match(stories, /raidHistoryPresentation=\{history\}/);
  assert.match(staticFixture, /reports: Array<typeof raidAuditReport>/);
  assert.match(stories, /dedupeId: "raid-audit-1"/);
  assert.doesNotMatch(staticStories, /responses=|transactionHash|nextCursor/);
  assert.match(stories, /export const RaidHistoryCheckpointResetBehavior/);
  assert.match(
    stories,
    /RaidHistoryCheckpointResetBehaviorFixture[\s\S]*?more\.click\(\)/,
  );
  assert.match(stories, /\{ status: 409 \}/);
  assert.match(capture, /ui-audit-civilization--raid-history-loaded/);
  assert.match(
    capture,
    /ui-audit-civilization--raid-history-updated-final-state/,
  );
  assert.match(capture, /process\.argv\.includes\("--raid-history"\)/);
  assert.doesNotMatch(capture, /raid-history-checkpoint-reset-behavior/);
  assert.equal(
    scripts["capture:storybook-audit"],
    "node scripts/capture-storybook-audit.mjs",
  );
  assert.equal(
    scripts["capture:raid-history-audit"],
    "node scripts/capture-storybook-audit.mjs --raid-history",
  );
});
