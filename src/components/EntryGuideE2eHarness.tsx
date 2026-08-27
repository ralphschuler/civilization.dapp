"use client";

import { useRef, useState } from "react";
import { civilizationMessages } from "../lib/civilization-locale";
import { BuildPanel, type BuildPanelProps } from "./BuildPanel";
import { EntryGuide } from "./EntryGuide";

const completionProps: BuildPanelProps = {
  state: {
    resources: { wood: 999, clay: 999, stone: 999, gold: 999 },
    buildings: { timber: 1 },
    construction: {
      pending: true,
      buildingId: "timber",
      completesAt: 0,
      slot: 0,
    },
    constructions: [
      { pending: true, buildingId: "timber", completesAt: 0, slot: 0 },
    ],
    constructionOccupied: 1,
    constructionCapacity: 1,
  },
  runtimeMode: "world",
  busy: false,
  selectedBuilding: "timber",
  buildings: {
    timber: { label: "Holzfäller", detail: "Erzeugt Holz.", produces: {} },
  },
  resourceDefs: {
    wood: { label: "Holz" },
    clay: { label: "Lehm" },
    stone: { label: "Stein" },
    gold: { label: "Gold" },
  },
  format: String,
  remainingTime: () => 0,
  buildDuration: () => 3_600,
  requirements: () => [],
  buildingCost: () => ({ wood: 1, clay: 1, stone: 1, gold: 0 }),
  nextBuildingProduction: () => ({}),
  copy: civilizationMessages("de-DE"),
  onUpgrade: () => undefined,
  onCompleteUpgrade: () => undefined,
  onBoost: () => undefined,
  onPrestige: () => undefined,
  onOpenMarket: () => undefined,
};

/** Browser-only fixture for the mobile entry-guide Storybook flow. */
export function EntryGuideE2eHarness() {
  const shell = useRef<HTMLElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const [activePanel, setActivePanel] = useState<"none" | "build">("none");
  const routeToCompletion = () => {
    setActivePanel("build");
    setDismissed(true);
    requestAnimationFrame(() =>
      shell.current
        ?.querySelector<HTMLButtonElement>("[data-complete-upgrade]")
        ?.focus(),
    );
  };

  return (
    <main
      className="game-shell"
      data-testid="entry-guide-e2e-harness"
      ref={shell}
    >
      {dismissed ? null : (
        <EntryGuide
          copy={civilizationMessages("de-DE")}
          recommendation={{ kind: "complete", target: "completion" }}
          onDismiss={() => setDismissed(true)}
          onRoute={routeToCompletion}
        />
      )}
      {activePanel === "build" ? (
        <section className="command-panel" data-active-panel="build">
          <BuildPanel {...completionProps} />
        </section>
      ) : null}
    </main>
  );
}
