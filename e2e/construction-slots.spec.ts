import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { buildPanel } from "../src/game-ui/views/build.js";

function constructionPanel(workshop: number, jobs: number) {
  const constructions = Array.from({ length: jobs }, (_, slot) => ({
    pending: true,
    buildingId: slot === 0 ? "quarry" : "timber",
    completesAt: 3_600_000,
    slot,
  }));
  return buildPanel({
    state: {
      resources: { wood: 999, clay: 999, stone: 999, gold: 999 },
      buildings: { timber: 1, workshop },
      construction: constructions[0],
      constructions,
      constructionOccupied: jobs,
      constructionCapacity: workshop >= 21 ? 3 : 2,
    },
    selectedBuilding: "timber",
    buildings: {
      timber: { label: "Holzfäller", detail: "Erzeugt Holz.", produces: {} },
      quarry: { label: "Steinbruch", detail: "Erzeugt Stein.", produces: {} },
    },
    requirements: () => [],
    buildingCost: () => ({ wood: 1, clay: 1, stone: 1, gold: 0 }),
    runtimeMode: "world",
    resourceDefs: { wood: {}, clay: {}, stone: {}, gold: {} },
    format: String,
    buildDuration: () => 3_600,
    nextBuildingProduction: () => ({}),
    remainingTime: () => 3_600,
    busy: false,
  });
}

async function mountPanel(page: Page, workshop: number, jobs: number) {
  const css = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  await page.setContent(
    `<style>${css}</style><main>${constructionPanel(workshop, jobs)}</main>`,
  );
  await page.locator('[data-building="timber"]').evaluate((button) => {
    const target = window as Window & { constructionStarts?: number };
    target.constructionStarts = 0;
    button.addEventListener("click", () => {
      target.constructionStarts = (target.constructionStarts || 0) + 1;
    });
  });
}

async function expectNoHorizontalOverflow(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  expect(
    await page
      .locator("html")
      .evaluate((node) => node.scrollWidth <= window.innerWidth),
  ).toBe(true);
}

test("workshop 11 with one job retains a keyboard-reachable start composer at 320px and 390px", async ({
  page,
}) => {
  await mountPanel(page, 11, 1);
  await expect(page.locator("[data-construction-job]")).toHaveCount(1);
  const start = page.locator('[data-building="timber"]');
  await expect(start).toBeEnabled();
  for (const width of [320, 390]) await expectNoHorizontalOverflow(page, width);

  await start.focus();
  await expect(start).toBeFocused();
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { constructionStarts?: number })
            .constructionStarts,
      ),
    )
    .toBe(1);
});

test("workshop 21 with two jobs preserves each slot and a keyboard-reachable start composer", async ({
  page,
}) => {
  await mountPanel(page, 21, 2);
  await expect(
    page.locator('[data-construction-job][data-construction-slot="0"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-construction-job][data-construction-slot="1"]'),
  ).toHaveCount(1);
  const start = page.locator('[data-building="timber"]');
  await expect(start).toBeEnabled();
  for (const width of [320, 390]) await expectNoHorizontalOverflow(page, width);

  await start.focus();
  await expect(start).toBeFocused();
  await page.keyboard.press("Space");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { constructionStarts?: number })
            .constructionStarts,
      ),
    )
    .toBe(1);
});
