"use client";

import { useState } from "react";
import { BuildPanel, type BuildPanelProps } from "./BuildPanel";
import { planBuildingDependencies } from "../world-game/build-planner.js";
import {
  getContractBuildingCost,
  getContractConstructionCapacity,
  getContractRequirementsForLevel,
  projectContractUpgradeImpact,
} from "../world-game/projections.js";
import { civilizationMessages } from "../lib/civilization-locale";

type Scenario = "one-job" | "two-jobs" | "impact" | "dependency";

const resources = {
  wood: 100_000,
  clay: 100_000,
  stone: 100_000,
  gold: 100_000,
};

const plannerState = {
  chainTimestamp: 1_000_000,
  resources,
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
  Object.keys(plannerState.buildings).map((id) => [
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
  }) as ReturnType<NonNullable<BuildPanelProps["buildingPlan"]>>;
}

function constructionProps(workshop: number, jobs: number) {
  const copy = civilizationMessages("de-DE");
  const constructions = Array.from({ length: jobs }, (_, slot) => ({
    pending: true,
    buildingId: slot === 0 ? "quarry" : "timber",
    completesAt: 3_600_000,
    slot,
  }));
  return {
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
    runtimeMode: "world" as const,
    copy,
    resourceDefs: {
      wood: { label: "Holz" },
      clay: { label: "Lehm" },
      stone: { label: "Stein" },
      gold: { label: "Gold" },
    },
    format: String,
    buildDuration: () => 3_600,
    nextBuildingProduction: () => ({}),
    remainingTime: () => 3_600,
    busy: false,
  };
}

function impactProps() {
  const copy = civilizationMessages("de-DE");
  const state = {
    resources: { wood: 999, clay: 999, stone: 999, gold: 999 },
    buildings: {
      townhall: 2,
      timber: 2,
      claypit: 2,
      quarry: 2,
      warehouse: 1,
      workshop: 10,
      goldmine: 0,
      barracks: 0,
    },
    troops: { spear: 0, archer: 0, rider: 0 },
  };
  return {
    state,
    selectedBuilding: "workshop",
    buildings: Object.fromEntries(
      Object.keys(state.buildings).map((id) => [
        id,
        {
          label: id === "workshop" ? "Werkstatt" : id,
          detail: "",
          produces: {},
        },
      ]),
    ),
    requirements: () => [],
    buildingCost: () => ({ wood: 1, clay: 1, stone: 1, gold: 0 }),
    runtimeMode: "world" as const,
    copy,
    resourceDefs: {
      wood: { label: "Holz" },
      clay: { label: "Lehm" },
      stone: { label: "Stein" },
      gold: { label: "Gold" },
    },
    format: String,
    buildDuration: () => 120,
    nextBuildingProduction: () => ({}),
    upgradeImpact: (id: string) =>
      projectContractUpgradeImpact(state, id) as ReturnType<
        NonNullable<BuildPanelProps["upgradeImpact"]>
      >,
    remainingTime: () => 0,
    busy: false,
  };
}

function dependencyProps() {
  const copy = civilizationMessages("de-DE");
  return {
    state: plannerState,
    selectedBuilding: "workshop",
    buildings: plannerBuildings,
    requirements: () => [{ id: "townhall", level: 2 }],
    buildingCost: (id: string) => getContractBuildingCost(plannerState, id),
    runtimeMode: "world" as const,
    copy,
    resourceDefs: {
      wood: { label: "wood" },
      clay: { label: "clay" },
      stone: { label: "stone" },
      gold: { label: "gold" },
    },
    format: String,
    buildDuration: (_id: string, level: number) => level * 120,
    nextBuildingProduction: () => ({}),
    remainingTime: () => 0,
    busy: false,
    buildingPlan: dependencyPlan,
  };
}

/** Browser-only fixture, gated by the existing server-side E2E mode. */
export function BuildPanelE2eHarness({ scenario }: { scenario: Scenario }) {
  const [starts, setStarts] = useState(0);
  const props =
    scenario === "one-job"
      ? constructionProps(11, 1)
      : scenario === "two-jobs"
        ? constructionProps(21, 2)
        : scenario === "impact"
          ? impactProps()
          : dependencyProps();

  return (
    <main className="command-panel" data-testid="build-panel-e2e-harness">
      <output data-testid="build-panel-upgrade-starts">{starts}</output>
      <BuildPanel
        {...props}
        onUpgrade={() => setStarts((value) => value + 1)}
        onCompleteUpgrade={() => {}}
        onBoost={() => {}}
        onPrestige={() => {}}
        onOpenMarket={() => {}}
      />
    </main>
  );
}
