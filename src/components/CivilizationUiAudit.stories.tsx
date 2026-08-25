import { useState } from "react";
import { BuildPanel, type BuildPanelProps } from "./BuildPanel";
import { CommandNavigation, type CommandPanel } from "./CommandNavigation";
import { GameShellHud } from "./GameShellHud";
import { VillageMap } from "./VillageMap";
import { WalletAccess } from "./WalletAccess";
import { WalletVillageRegistrationGate } from "./CivilizationClient/WalletVillageRegistrationGate";
import { civilizationMessages } from "@/lib/civilization-locale";

const copy = civilizationMessages("en-US");
const villageCopy = {
  ...copy,
  mapHead: (prestigeCount: number) => copy.mapHead(String(prestigeCount)),
};
const resourceDefs = {
  wood: { label: "Wood", short: "W", color: "wood" },
  clay: { label: "Clay", short: "C", color: "clay" },
  stone: { label: "Stone", short: "S", color: "stone" },
  gold: { label: "Gold", short: "G", color: "gold" },
};
const buildings = {
  townhall: {
    label: "Town Hall",
    detail: "Directs your village and unlocks stronger infrastructure.",
  },
  timber: {
    label: "Timber Camp",
    detail: "Produces wood for construction.",
    produces: { wood: 48 },
  },
  claypit: {
    label: "Clay Pit",
    detail: "Produces clay for construction.",
    produces: { clay: 42 },
  },
  quarry: {
    label: "Quarry",
    detail: "Produces stone for construction.",
    produces: { stone: 36 },
  },
  warehouse: { label: "Warehouse", detail: "Increases your resource storage." },
  workshop: { label: "Workshop", detail: "Adds construction capacity." },
  goldmine: {
    label: "Gold Mine",
    detail: "Mints CGOLD for market trades.",
    produces: { gold: 18 },
  },
  barracks: { label: "Barracks", detail: "Trains troops for village defence." },
};
const format = (value: number) => new Intl.NumberFormat("en-US").format(value);
const buildProps: BuildPanelProps = {
  state: {
    resources: { wood: 1240, clay: 860, stone: 430, gold: 92 },
    buildings: {
      townhall: 5,
      timber: 8,
      claypit: 7,
      quarry: 6,
      warehouse: 5,
      workshop: 2,
      goldmine: 3,
      barracks: 4,
    },
    constructionCapacity: 2,
    constructionOccupied: 2,
    chainTimestamp: 1_800_000_000_000,
  },
  runtimeMode: "world",
  busy: false,
  selectedBuilding: "timber",
  buildings,
  resourceDefs,
  format,
  remainingTime: () => 4 * 60 + 28,
  buildDuration: () => 60 * 60 + 18 * 60,
  requirements: () => [],
  buildingCost: () => ({ wood: 1450, clay: 980, stone: 620, gold: 0 }),
  nextBuildingProduction: () => ({ wood: 56 }),
  upgradeImpact: () => ({
    available: true,
    production: [{ resource: "wood", before: 48, after: 56, delta: 8 }],
    unlocks: { buildings: [], troops: [] },
  }),
  buildingPlan: () => ({ ok: true, reason: "", next: null, steps: [] }),
  assetResult: { failed: [] },
  copy,
  onUpgrade: () => undefined,
  onCompleteUpgrade: () => undefined,
  onBoost: () => undefined,
  onPrestige: () => undefined,
  onOpenMarket: () => undefined,
};

function Overview() {
  const [activePanel, setActivePanel] = useState<CommandPanel>("build");
  return (
    <main className="game-shell">
      <GameShellHud
        assetResult={{ failed: [] }}
        capacity={2500}
        copy={copy}
        locale="en-US"
        onOpenSettings={() => undefined}
        production={{ wood: 56, clay: 42, stone: 36, gold: 18 }}
        resourceDefs={resourceDefs}
        resourceFormat={format}
        resources={{ wood: 1240, clay: 860, stone: 430, gold: 92 }}
        runtimeMode="world"
        tokens={{
          wood: { symbol: "WOOD" },
          clay: { symbol: "CLAY" },
          stone: { symbol: "STONE" },
          gold: { symbol: "CGOLD" },
        }}
        worldApp={{ installed: true }}
        worldBadge="WORLD"
      />
      <div className="command-layout">
        <VillageMap
          assetResult={{ failed: [] }}
          assetsLoading={false}
          buildings={buildings}
          buildingLevels={buildProps.state.buildings}
          capacity={2500}
          collectionStatus={{
            assetResult: { failed: [] },
            busy: false,
            collection: { detail: "Resources ready", locked: false },
            copy,
            locale: "en-US",
            onGather: () => undefined,
            resourceDefs,
            resourceFormat: format,
            unclaimed: { wood: 184, clay: 120, stone: 96, gold: 0 },
          }}
          copy={villageCopy}
          feedback="Timber Camp selected"
          format={format}
          onSelectBuilding={() => setActivePanel("build")}
          onSelectMarket={() => setActivePanel("market")}
          prestigeCount={1}
          runtimeMode="world"
          selectedBuilding="timber"
          activePanel={activePanel}
        />
        <aside className="command-rail">
          <CommandNavigation
            activePanel={activePanel}
            copy={copy}
            onSelectPanel={(panel) => setActivePanel(panel)}
          />
          <section className="command-panel" id="game-command-panel">
            <BuildPanel
              {...buildProps}
              collection={{
                locked: false,
                unclaimed: { wood: 184, clay: 120, stone: 96, gold: 0 },
              }}
              onGather={() => undefined}
            />
          </section>
        </aside>
      </div>
      <CommandNavigation
        mobile
        activePanel={activePanel}
        copy={copy}
        onSelectPanel={(panel) => setActivePanel(panel)}
      />
    </main>
  );
}

const meta = {
  title: "UI Audit/Civilization",
  parameters: { backgrounds: { default: "dark" } },
};
export default meta;

export const WalletAccessReady = {
  name: "WalletAccess / Ready",
  render: () => (
    <WalletAccess
      contractAddress="0x0000000000000000000000000000000000000001"
      worldTokenAddress="0x0000000000000000000000000000000000000002"
      environment="development"
      locale="en-US"
      attemptWalletAccess={async () =>
        "0x1111111111111111111111111111111111111111"
      }
    />
  ),
};
export const RegistrationState = {
  name: "WalletAccess / Registration state",
  render: () => (
    <WalletVillageRegistrationGate
      busy={false}
      checked
      checking={false}
      checkFailed={false}
      status="Your wallet has no village yet."
      locale="en-US"
      onRegisterVillage={() => undefined}
      onRetryRegistrationCheck={() => undefined}
    />
  ),
};
export const VillageBuildOverview = {
  name: "CivilizationClient / Village and build overview",
  render: () => <Overview />,
};
export const BuildingDetail = {
  name: "Building detail / Upgrade impact and costs",
  render: () => (
    <main className="game-shell">
      <section className="command-panel">
        <BuildPanel {...buildProps} />
      </section>
    </main>
  ),
};
export const NextActionCollect = {
  name: "Village build / Next action: collect first",
  render: () => (
    <main className="game-shell">
      <section className="command-panel">
        <BuildPanel
          {...buildProps}
          collection={{ locked: false, unclaimed: { wood: 184, clay: 120 } }}
          onGather={() => undefined}
        />
      </section>
    </main>
  ),
};
export const NextActionBlocked = {
  name: "Village build / Next action: resource blocker",
  render: () => (
    <main className="game-shell">
      <section className="command-panel">
        <BuildPanel
          {...buildProps}
          state={{
            ...buildProps.state,
            resources: { wood: 1, clay: 1, stone: 1, gold: 0 },
          }}
        />
      </section>
    </main>
  ),
};
export const ConstructionProgress = {
  name: "Building detail / Construction progress",
  render: () => (
    <main className="game-shell">
      <section className="command-panel">
        <BuildPanel
          {...buildProps}
          state={{
            ...buildProps.state,
            constructions: [
              { buildingId: "timber", completesAt: 1_800_000_270_000, slot: 0 },
              { buildingId: "quarry", completesAt: 1_800_000_630_000, slot: 1 },
            ],
          }}
        />
      </section>
    </main>
  ),
};
export const ConstructionReady = {
  name: "Village build / Next action: complete construction",
  render: () => (
    <main className="game-shell">
      <section className="command-panel">
        <BuildPanel
          {...buildProps}
          state={{
            ...buildProps.state,
            constructions: [
              { buildingId: "timber", completesAt: 1_799_999_999_000, slot: 0 },
            ],
          }}
          remainingTime={() => 0}
        />
      </section>
    </main>
  ),
};
export const ConstructionBoostUnavailable = {
  name: "Village build / Construction boost unavailable status",
  render: () => (
    <main className="game-shell">
      <section className="command-panel">
        <BuildPanel
          {...buildProps}
          state={{
            ...buildProps.state,
            constructions: [
              { buildingId: "timber", completesAt: 1_800_000_030_000, slot: 0 },
            ],
          }}
          remainingTime={() => 30 * 60}
        />
      </section>
    </main>
  ),
};
export const ResourceStatusHeader = {
  name: "GameShellHud / Resource and status header",
  render: () => (
    <main className="game-shell">
      <GameShellHud
        assetResult={{ failed: [] }}
        capacity={2500}
        copy={copy}
        locale="en-US"
        onOpenSettings={() => undefined}
        production={{ wood: 56, clay: 42, stone: 36, gold: 18 }}
        resourceDefs={resourceDefs}
        resourceFormat={format}
        resources={{ wood: 1240, clay: 860, stone: 430, gold: 92 }}
        runtimeMode="world"
        tokens={{
          wood: { symbol: "WOOD" },
          clay: { symbol: "CLAY" },
          stone: { symbol: "STONE" },
          gold: { symbol: "CGOLD" },
        }}
        worldApp={{ installed: true }}
        worldBadge="WORLD"
      />
    </main>
  ),
};
export const BottomNavigation = {
  name: "CommandNavigation / Mobile bottom navigation",
  render: () => (
    <main className="game-shell">
      <section id="game-command-panel" className="command-panel">
        <p>Build panel</p>
      </section>
      <CommandNavigation
        mobile
        activePanel="build"
        copy={copy}
        onSelectPanel={() => undefined}
      />
    </main>
  ),
};
