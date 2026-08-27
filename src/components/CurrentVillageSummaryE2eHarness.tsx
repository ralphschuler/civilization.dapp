"use client";

import { useRef, useState } from "react";
import { civilizationMessages } from "../lib/civilization-locale";
import { CurrentVillageSummary } from "./CurrentVillageSummary";
import { BuildPanel, type BuildPanelProps } from "./BuildPanel";

const copy = civilizationMessages("en-US");
const buildProps: BuildPanelProps = {
  state: {
    resources: { wood: 999, clay: 999, stone: 999, gold: 999 },
    buildings: { timber: 1, quarry: 1 },
    constructions: [
      { pending: true, buildingId: "quarry", completesAt: 1, slot: 1 },
    ],
  },
  runtimeMode: "world",
  busy: false,
  selectedBuilding: "timber",
  buildings: { timber: { label: "Timber Camp" }, quarry: { label: "Quarry" } },
  resourceDefs: {
    wood: { label: "Wood" },
    clay: { label: "Clay" },
    stone: { label: "Stone" },
    gold: { label: "Gold" },
  },
  format: String,
  remainingTime: () => 0,
  buildDuration: () => 60,
  requirements: () => [],
  buildingCost: () => ({ wood: 1, clay: 1, stone: 1, gold: 0 }),
  nextBuildingProduction: () => ({}),
  onUpgrade: () => undefined,
  onCompleteUpgrade: () => undefined,
  onBoost: () => undefined,
  onPrestige: () => undefined,
  onOpenMarket: () => undefined,
};

/** Browser fixture: the render itself must not dispatch a wallet action. */
export function CurrentVillageSummaryE2eHarness() {
  const shell = useRef<HTMLElement>(null);
  const [collects, setCollects] = useState(0);
  const [completions, setCompletions] = useState(0);
  return (
    <main
      className="game-shell"
      data-testid="current-village-e2e-harness"
      ref={shell}
    >
      <output data-testid="wallet-dispatches">{collects}</output>
      <output data-testid="completion-dispatches">{completions}</output>
      <CurrentVillageSummary
        copy={copy}
        buildingNames={copy.buildingNames}
        summary={{ ready: { buildingId: "quarry", slot: 1 } }}
        onCollect={() => setCollects((value) => value + 1)}
        onOpenCompletion={(slot) =>
          shell.current
            ?.querySelector<HTMLButtonElement>(
              `[data-complete-upgrade-slot="${slot}"]`,
            )
            ?.focus()
        }
      />
      <section className="command-panel">
        <BuildPanel
          {...buildProps}
          onCompleteUpgrade={() => setCompletions((value) => value + 1)}
        />
      </section>
    </main>
  );
}
