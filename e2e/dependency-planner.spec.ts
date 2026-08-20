import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { buildPanel } from "../src/game-ui/views/build.js";
import { planBuildingDependencies } from "../src/world-game/build-planner.js";
import {
  getContractBuildingCost,
  getContractConstructionCapacity,
  getContractRequirementsForLevel,
} from "../src/world-game/projections.js";

const plannerState = {
  chainTimestamp: 1_000_000,
  resources: { wood: 100_000, clay: 100_000, stone: 100_000, gold: 100_000 },
  buildings: {
    townhall: 1,
    timber: 1,
    claypit: 1,
    quarry: 1,
    warehouse: 0,
    workshop: 0,
    goldmine: 0,
    barracks: 0,
  },
  constructions: [],
};

const plannerBuildings = Object.fromEntries(
  Object.keys(plannerState.buildings).map((id: string) => [
    id,
    { label: id, detail: `${id} details`, produces: {} },
  ]),
);

function dependencyPlan() {
  return planBuildingDependencies({
    state: plannerState,
    target: { id: "workshop", level: 1 },
    requirementsForLevel: getContractRequirementsForLevel,
    buildingCost: getContractBuildingCost,
    buildDuration: (_id: string, level: number) => level * 120,
    constructionCapacity: getContractConstructionCapacity,
  });
}

async function mountDependencyPlanner(page: Page) {
  const css = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  await page.setContent(
    `<style>${css}</style><main class="command-panel">${buildPanel({
      state: plannerState,
      selectedBuilding: "workshop",
      buildings: plannerBuildings,
      requirements: () => [{ id: "townhall", level: 2 }],
      buildingCost: (id) => getContractBuildingCost(plannerState, id),
      runtimeMode: "world",
      resourceDefs: Object.fromEntries(
        ["wood", "clay", "stone", "gold"].map((id) => [id, { label: id }]),
      ),
      format: String,
      buildDuration: (_id: string, level: number) => level * 120,
      nextBuildingProduction: () => ({}),
      remainingTime: () => 0,
      busy: false,
      buildingPlan: dependencyPlan,
    })}</main>`,
  );
}

async function expectNoHorizontalOverflow(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  expect(
    await page
      .locator("html")
      .evaluate((node) => node.scrollWidth <= window.innerWidth),
  ).toBe(true);
}

test("dependency planner is named, accessible, responsive, and offers one next step", async ({
  page,
}) => {
  await mountDependencyPlanner(page);
  const planner = page.getByRole("region", { name: "AUSBAUPLAN" });
  const nextStep = planner.getByRole("button", {
    name: "claypit auf Stufe 2 starten",
  });

  await expect(planner).toBeVisible();
  await expect(nextStep).toHaveCount(1);
  await expect(nextStep).toBeEnabled();
  await expect(planner.getByRole("button")).toHaveCount(1);
  await expect(planner.locator("[data-plan-upgrade]")).toHaveCount(1);
  await expect(planner.locator("[data-plan-upgrade]")).toHaveAttribute(
    "data-plan-upgrade",
    "claypit",
  );

  for (const width of [320, 390]) await expectNoHorizontalOverflow(page, width);
  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  await expectNoHorizontalOverflow(page, 320);
  await expectNoHorizontalOverflow(page, 390);

  const results = await new AxeBuilder({ page })
    .include(".dependency-plan")
    .analyze();
  expect(
    results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
});
