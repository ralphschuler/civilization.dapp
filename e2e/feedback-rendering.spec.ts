import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VillageMap } from "../src/components/VillageMap.js";
import {
  BUILDINGS,
  RESOURCE_DEFS,
  createInitialState,
  format,
  getCapacity,
} from "../src/game.js";
import { civilizationMessages } from "../src/lib/civilization-locale.js";

function villageMapWithFeedback(feedback: string) {
  const state = createInitialState();
  const copy = civilizationMessages("de-DE");
  const mapCopy = {
    ...copy,
    mapHead: (prestigeCount: number) => copy.mapHead(format(prestigeCount)),
  };
  return renderToStaticMarkup(
    createElement(VillageMap, {
      assetResult: { failed: [] },
      assetsLoading: false,
      buildings: BUILDINGS,
      buildingLevels: state.buildings,
      capacity: getCapacity(state),
      collectionStatus: {
        assetResult: { failed: [] },
        busy: false,
        collection: { locked: false, detail: "FELD" },
        copy: mapCopy,
        locale: "de-DE",
        onGather: () => {},
        resourceDefs: RESOURCE_DEFS,
        resourceFormat: format,
        unclaimed: state.unclaimed,
      },
      copy: mapCopy,
      feedback,
      format,
      onSelectBuilding: () => {},
      onSelectMarket: () => {},
      prestigeCount: 0,
      runtimeMode: "demo",
      selectedBuilding: "townhall",
      activePanel: "build",
    }),
  );
}

test("dynamic feedback remains literal text in the browser DOM", async ({
  page,
}) => {
  const feedback =
    '<img src=x onerror="globalThis.feedbackXss=1"> "quotes" & Käse 🏰';

  await page.setContent(villageMapWithFeedback(feedback));

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
