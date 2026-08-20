import { expect, test } from "@playwright/test";
import { BUILDING_IDS } from "../src/game-ui/constants.js";
import { gameShell } from "../src/game-ui/views/shell.js";
import { createInitialState } from "../src/game.js";

function shellWithFeedback(feedback: string) {
  const state = createInitialState();
  return gameShell({
    state,
    runtimeMode: "demo",
    worldApp: { installed: false },
    worldBadge: "DEMO · LOKAL",
    feedback,
    activePanel: "build",
    selectedBuilding: "townhall",
    panel: "",
    production: { wood: 0, clay: 0, stone: 0, gold: 0 },
    capacity: 100,
    displayState: state,
    collection: { locked: false, detail: "FELD" },
    readyToClaim: 0,
    resourceDefs: {},
    tokens: {},
    format: String,
    resourceFormat: String,
    buildings: Object.fromEntries(
      BUILDING_IDS.map((id) => [id, { label: id }]),
    ),
    busy: false,
  });
}

test("dynamic feedback remains literal text in the browser DOM", async ({
  page,
}) => {
  const feedback =
    '<img src=x onerror="globalThis.feedbackXss=1"> "quotes" & Käse 🏰';

  await page.setContent(shellWithFeedback(feedback));

  const feedbackElement = page.locator(".map-feedback");
  await expect(feedbackElement).toHaveText(feedback);
  await expect(feedbackElement.locator("img")).toHaveCount(0);
  await expect(feedbackElement.locator("[onerror]")).toHaveCount(0);
  await expect(page.locator("img[onerror]")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (globalThis as { feedbackXss?: number }).feedbackXss,
    ),
  ).toBeUndefined();
});
