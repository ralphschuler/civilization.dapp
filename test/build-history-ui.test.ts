import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  appendStoredBuildFacts,
  buildHistoryFailureStatus,
  mapStoredBuildHistory,
} from "../src/components/build-history.ts";
const event = {
  kind: "building_upgraded",
  building: 1,
  value: "9",
  transactionHash: `0x${"a".repeat(64)}`,
  logIndex: 2,
};
test("build UI maps only safe facts with collision-resistant local IDs and dedupes page overlap", () => {
  const page = mapStoredBuildHistory({
    availability: "stored_finalized_events",
    coverage: { complete: false },
    events: [event],
    nextCursor: "opaque",
  });
  assert.ok(page);
  assert.equal(page.facts[0].value, "9");
  assert.deepEqual(Object.keys(page.facts[0]).sort(), [
    "building",
    "dedupeId",
    "kind",
    "value",
  ]);
  assert.match(page.facts[0].dedupeId, /^build-[a-z0-9]+-[a-z0-9]+$/);
  assert.doesNotMatch(page.facts[0].dedupeId, /aaaa|:2|0x/);
  assert.equal(
    mapStoredBuildHistory({
      availability: "stored_finalized_events",
      coverage: { complete: false },
      events: [{ ...event, building: 8 }],
      nextCursor: null,
    }),
    null,
  );
  assert.equal(appendStoredBuildFacts(page.facts, page.facts).length, 1);
  const distinct = mapStoredBuildHistory({
    availability: "stored_finalized_events",
    coverage: { complete: false },
    events: [{ ...event, transactionHash: `0x${"b".repeat(64)}` }],
    nextCursor: null,
  });
  assert.ok(distinct);
  assert.notEqual(page.facts[0].dedupeId, distinct.facts[0].dedupeId);
});
test("build UI classifies expired sessions without a wallet action", () => {
  assert.equal(buildHistoryFailureStatus(401), "session");
  assert.equal(buildHistoryFailureStatus(503), "error");
});

test("stored Build History Storybook state renders direct final facts at the mobile audit sizes", async () => {
  const [panel, stories, capture, styles] = await Promise.all([
    readFile(
      new URL("../src/components/BuildPanel.tsx", import.meta.url),
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
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(panel, /history\.facts\.map\(\(fact\)/);
  assert.match(panel, /key=\{fact\.dedupeId\}/);
  assert.match(panel, /copy\.buildHistoryStarted\(name\)/);
  assert.match(panel, /copy\.buildHistoryFinished\(name, fact\.value\)/);
  assert.match(panel, /build-history-more[\s\S]*onClick=\{onLoadMore\}/);
  assert.match(styles, /\.build-history-more:focus-visible/);
  assert.match(stories, /export const BuildHistoryLoaded/);
  assert.match(stories, /dedupeId: "build-audit-start"/);
  assert.match(stories, /dedupeId: "build-audit-finish"/);
  assert.doesNotMatch(
    stories.slice(
      stories.indexOf("export const BuildHistoryLoaded"),
      stories.indexOf("export const BuildHistoryUpdated"),
    ),
    /transactionHash|logIndex|topics|data/,
  );
  assert.match(capture, /mobile-build-history-loaded-320\.png/);
  assert.match(capture, /mobile-build-history-loaded-390\.png/);
  assert.match(capture, /width: 320, height: 844/);
  assert.match(capture, /width: 390, height: 844/);
  assert.match(capture, /Mobile build history has horizontal overflow/);
  assert.match(
    capture,
    /Build history load-more control is not keyboard reachable/,
  );
});
