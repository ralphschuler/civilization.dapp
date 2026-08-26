"use client";

import { RaidPanel } from "./RaidPanel";
import { civilizationMessages } from "../lib/civilization-locale";

/** Browser-only fixture, reachable solely through the server-gated E2E mode. */
export function RaidHistoryE2eHarness() {
  const copy = civilizationMessages("de-DE");
  return (
    <main className="game-shell" data-testid="raid-history-e2e-harness">
      <section className="command-panel">
        <RaidPanel
          state={{ troops: { spear: 3 } }}
          runtimeMode="world"
          busy={false}
          troops={{ spear: { label: "Speerträger" } }}
          resourceDefs={{ wood: { short: "Holz" }, clay: { short: "Lehm" } }}
          format={(value) => String(value)}
          remainingTime={() => 0}
          raidDraft={{ army: {}, targetAddress: "", targetId: "" }}
          selectedOpponent={null}
          copy={copy}
          onDraftChange={() => undefined}
          onPickOpponent={() => undefined}
          onSendRaid={() => undefined}
          onResolveRaid={() => undefined}
        />
      </section>
    </main>
  );
}
