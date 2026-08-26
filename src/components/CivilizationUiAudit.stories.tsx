import { useRef, useState } from "react";
import { BuildPanel, type BuildPanelProps } from "./BuildPanel";
import { ArmyPanel, type ArmyPanelProps } from "./ArmyPanel";
import { CommandNavigation, type CommandPanel } from "./CommandNavigation";
import { GameShellHud } from "./GameShellHud";
import { GameShellFrame } from "./GameShellFrame";
import { GameFooter } from "./GameFooter";
import { EntryGuide } from "./EntryGuide";
import { MarketPanel, type MarketPanelProps } from "./MarketPanel";
import { VillageMap } from "./VillageMap";
import { WalletAccess } from "./WalletAccess";
import { WalletReviewDialog } from "./WalletReviewDialog";
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

const armyProps: ArmyPanelProps = {
  state: {
    resources: { wood: 120, clay: 80, stone: 40, gold: 20 },
    troops: { spear: 3, archer: 0, rider: 0 },
  },
  troops: {
    spear: { label: "Spearman", attack: 12, cost: { wood: 20, clay: 10 } },
    archer: { label: "Archer", attack: 18, cost: { wood: 25, clay: 15 } },
    rider: {
      label: "Rider",
      attack: 30,
      cost: { wood: 40, clay: 20, gold: 10 },
    },
  },
  resourceDefs,
  buildings,
  assetResult: { failed: [] },
  format,
  troopRequirements: () => [],
  busy: false,
  copy,
  onTrain: () => undefined,
  onOpenMarket: () => undefined,
};

function ArmyTrainingFixture({
  resources = armyProps.state.resources,
}: {
  resources?: Record<string, number>;
}) {
  return (
    <main className="game-shell">
      <section className="command-panel">
        <ArmyPanel {...armyProps} state={{ ...armyProps.state, resources }} />
      </section>
    </main>
  );
}

function EntryGuideFixture({
  recommendation,
}: {
  recommendation: {
    kind: string;
    target: "none" | "collection" | "completion" | "building" | "build-panel";
  };
}) {
  const [dismissed, setDismissed] = useState(false);
  return dismissed ? null : (
    <EntryGuide
      copy={copy}
      recommendation={recommendation}
      onDismiss={() => setDismissed(true)}
      onRoute={() => undefined}
    />
  );
}

function StableGameShellFrameFixture() {
  const [activePanel, setActivePanel] = useState<CommandPanel>("build");
  const [entryGuideDismissed, setEntryGuideDismissed] = useState(false);
  const selectPanel = (panel: CommandPanel) => setActivePanel(panel);
  return (
    <GameShellFrame
      activePanel={activePanel}
      army={armyProps}
      build={{
        ...buildProps,
        collection: {
          locked: false,
          unclaimed: { wood: 184, clay: 120, stone: 96, gold: 0 },
        },
        onGather: () => undefined,
      }}
      desktopNavigation={{
        activePanel,
        copy,
        onSelectPanel: (panel) => selectPanel(panel),
      }}
      entryGuide={
        entryGuideDismissed
          ? null
          : {
              copy,
              recommendation: { kind: "upgrade", target: "build-panel" },
              onDismiss: () => setEntryGuideDismissed(true),
              onRoute: () => {
                setEntryGuideDismissed(true);
                selectPanel("build");
              },
            }
      }
      footer={{
        authority: copy.gameAuthority,
        resetLabel: copy.demoReset,
        runtimeMode: "world",
        status: copy.worldFooter("1"),
      }}
      hud={{
        assetResult: { failed: [] },
        capacity: 2500,
        copy,
        locale: "en-US",
        onOpenSettings: () => undefined,
        production: { wood: 56, clay: 42, stone: 36, gold: 18 },
        resourceDefs,
        resourceFormat: format,
        resources: buildProps.state.resources,
        runtimeMode: "world",
        tokens: {
          wood: { symbol: "WOOD" },
          clay: { symbol: "CLAY" },
          stone: { symbol: "STONE" },
          gold: { symbol: "CGOLD" },
        },
        worldApp: { installed: true },
        worldBadge: "WORLD",
      }}
      market={{
        runtimeMode: "world",
        tokens: {},
        marketDraft: { resource: "wood", from: "wood", to: "clay", amount: 1 },
        marketQuote: null,
        busy: false,
        copy,
        onDraftChange: () => undefined,
        onQuote: () => undefined,
        onOrder: () => undefined,
        onSwap: () => undefined,
      }}
      mobileNavigation={{
        activePanel,
        copy,
        onSelectPanel: (panel) => selectPanel(panel),
      }}
      raid={{
        state: { troops: armyProps.state.troops },
        runtimeMode: "world",
        busy: false,
        troops: armyProps.troops,
        resourceDefs,
        format,
        remainingTime: () => 0,
        raidDraft: {
          army: { spear: 0, archer: 0, rider: 0 },
          targetAddress: "",
          targetId: "",
        },
        selectedOpponent: null,
        copy,
        onDraftChange: () => undefined,
        onPickOpponent: () => undefined,
        onSendRaid: () => undefined,
        onResolveRaid: () => undefined,
      }}
      reducedMotion={false}
      settings={null}
      villageMap={{
        assetResult: { failed: [] },
        assetsLoading: false,
        buildings,
        buildingLevels: buildProps.state.buildings,
        capacity: 2500,
        collectionStatus: {
          assetResult: { failed: [] },
          busy: false,
          collection: { detail: "Resources ready", locked: false },
          copy,
          locale: "en-US",
          onGather: () => undefined,
          resourceDefs,
          resourceFormat: format,
          unclaimed: { wood: 184, clay: 120, stone: 96, gold: 0 },
        },
        copy: villageCopy,
        feedback: "Timber Camp selected",
        format,
        onSelectBuilding: () => selectPanel("build"),
        onSelectMarket: () => selectPanel("market"),
        prestigeCount: 1,
        runtimeMode: "world",
        selectedBuilding: "timber",
        activePanel,
      }}
      walletReview={null}
    />
  );
}

function Overview({
  showCollectionGuide = false,
}: {
  showCollectionGuide?: boolean;
}) {
  const shell = useRef<HTMLElement>(null);
  const [activePanel, setActivePanel] = useState<CommandPanel>("build");
  const [entryGuideDismissed, setEntryGuideDismissed] = useState(false);
  const selectPanel = (
    panel: CommandPanel,
    navigation: "desktop" | "mobile",
  ) => {
    setActivePanel(panel);
    if (navigation !== "mobile") return;
    requestAnimationFrame(() => {
      const commandPanel = shell.current?.querySelector<HTMLElement>(
        "#game-command-panel",
      );
      if (!commandPanel) return;
      commandPanel.tabIndex = -1;
      commandPanel.focus({ preventScroll: true });
      commandPanel.scrollIntoView({
        behavior: "auto",
        block: "start",
        inline: "nearest",
      });
      const hud = shell.current?.querySelector<HTMLElement>(".hud");
      if (!hud) return;
      const panelTop = commandPanel.getBoundingClientRect().top;
      const hudBottom = hud.getBoundingClientRect().bottom;
      if (panelTop < hudBottom) window.scrollBy({ top: panelTop - hudBottom });
    });
  };
  return (
    <main className="game-shell" ref={shell}>
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
      {showCollectionGuide && !entryGuideDismissed ? (
        <EntryGuide
          copy={copy}
          recommendation={{ kind: "collect", target: "collection" }}
          onDismiss={() => setEntryGuideDismissed(true)}
          onRoute={() => undefined}
        />
      ) : null}
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
            onSelectPanel={selectPanel}
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
        onSelectPanel={selectPanel}
      />
    </main>
  );
}

function MobileBuildActionFocusFixture() {
  const shell = useRef<HTMLElement>(null);
  const [entryGuideDismissed, setEntryGuideDismissed] = useState(false);
  const actionProps: BuildPanelProps = {
    ...buildProps,
    state: {
      ...buildProps.state,
      constructions: [
        { buildingId: "timber", completesAt: 1_799_999_999_000, slot: 0 },
      ],
    },
    remainingTime: () => 0,
  };
  const focusBuildAction = () => {
    requestAnimationFrame(() =>
      shell.current
        ?.querySelector<HTMLButtonElement>(
          '[data-next-action-button="complete"]',
        )
        ?.focus(),
    );
  };
  const routeToBuildAction = () => {
    setEntryGuideDismissed(true);
    focusBuildAction();
  };
  return (
    <main
      className="game-shell"
      data-mobile-build-action-focus-audit
      ref={shell}
    >
      <GameShellHud
        assetResult={{ failed: [] }}
        capacity={2500}
        copy={copy}
        locale="en-US"
        onOpenSettings={() => undefined}
        production={{ wood: 56, clay: 42, stone: 36, gold: 18 }}
        resourceDefs={resourceDefs}
        resourceFormat={format}
        resources={actionProps.state.resources}
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
      {entryGuideDismissed ? null : (
        <EntryGuide
          copy={copy}
          recommendation={{ kind: "complete", target: "completion" }}
          onDismiss={() => setEntryGuideDismissed(true)}
          onRoute={routeToBuildAction}
        />
      )}
      <div className="command-layout">
        <VillageMap
          assetResult={{ failed: [] }}
          assetsLoading={false}
          buildings={buildings}
          buildingLevels={actionProps.state.buildings}
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
          onSelectBuilding={() => undefined}
          onSelectMarket={() => undefined}
          prestigeCount={1}
          runtimeMode="world"
          selectedBuilding="timber"
          activePanel="build"
        />
        <aside className="command-rail">
          <CommandNavigation
            activePanel="build"
            copy={copy}
            onSelectPanel={() => undefined}
          />
          <section
            className="command-panel"
            data-build-action-focus-panel
            id="game-command-panel"
          >
            <BuildPanel {...actionProps} />
          </section>
        </aside>
      </div>
      <CommandNavigation
        mobile
        activePanel="build"
        copy={copy}
        onSelectPanel={() => undefined}
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

export const StableGameShellFrameMobile = {
  name: "GameShellFrame / Build, entry guide, and mobile navigation",
  render: () => <StableGameShellFrameFixture />,
};

export const MobileVillageBuildNavigation = {
  name: "Village build / Mobile navigation reveals command panel",
  render: () => <Overview />,
};
export const MobileCollectionWayfinding = {
  name: "Village map / Mobile collection wayfinding",
  render: () => <Overview />,
};
export const MobileCollectionGuide = {
  name: "Village map / Mobile collection guide uses visible collect action",
  render: () => <Overview showCollectionGuide />,
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
export const EntryGuideCollect = {
  name: "Entry guide / Collection recommendation",
  render: () => (
    <main className="game-shell">
      <EntryGuideFixture
        recommendation={{ kind: "collect", target: "collection" }}
      />
    </main>
  ),
};
export const EntryGuideUnclearState = {
  name: "Entry guide / Unclear runtime state",
  render: () => (
    <main className="game-shell">
      <EntryGuideFixture
        recommendation={{ kind: "unavailable", target: "none" }}
      />
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

export const DemoFooter = {
  name: "GameFooter / Demo reset action",
  render: () => (
    <main className="game-shell">
      <GameFooter
        authority={copy.demoStorage}
        onReset={() => undefined}
        resetLabel={copy.demoReset}
        runtimeMode="demo"
        status={copy.demoFooter("3")}
      />
      <CommandNavigation
        mobile
        activePanel="build"
        copy={copy}
        onSelectPanel={() => undefined}
      />
    </main>
  ),
};

export const WorldFooter = {
  name: "GameFooter / World authority status",
  render: () => (
    <main className="game-shell">
      <GameFooter
        authority={copy.gameAuthority}
        resetLabel={copy.demoReset}
        runtimeMode="world"
        status={copy.worldFooter("2")}
      />
      <CommandNavigation
        mobile
        activePanel="build"
        copy={copy}
        onSelectPanel={() => undefined}
      />
    </main>
  ),
};

export const ArmyTrainingMobilePlusOne = {
  name: "Army training / Mobile +1 default",
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => <ArmyTrainingFixture />,
};

export const ArmyTrainingQuantityChoice = {
  name: "Army training / Quantity choice and total cost",
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => <ArmyTrainingFixture />,
};

export const ArmyTrainingResourceLimit = {
  name: "Army training / Resource limit",
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <ArmyTrainingFixture
      resources={{ wood: 39, clay: 19, stone: 0, gold: 0 }}
    />
  ),
};

export const ArmyTrainingReviewSummary = {
  name: "Army training / Wallet review summary",
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <main className="game-shell">
      <WalletReviewDialog
        copy={copy}
        review={{
          status: "reviewing",
          intent: { details: ["Train 3 Spearman", "Total cost: 60 W · 30 C"] },
        }}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    </main>
  ),
};

export const MobileBuildActionFocus = {
  name: "Village build / Mobile next-action focus above bottom navigation",
  render: () => <MobileBuildActionFocusFixture />,
};

function WorldMarketAuditFixture() {
  const [marketDraft, setMarketDraft] = useState<
    MarketPanelProps["marketDraft"]
  >({
    resource: "wood" as const,
    from: "wood" as const,
    to: "clay" as const,
    amount: 120,
  });
  return (
    <main className="game-shell">
      <section id="game-command-panel" className="command-panel">
        <MarketPanel
          runtimeMode="world"
          tokens={{}}
          marketDraft={marketDraft}
          marketQuote={null}
          marketOrigin={{
            source: "Village map",
            resource: "wood",
            amount: 184,
          }}
          busy={false}
          copy={copy}
          onDraftChange={(draft) =>
            setMarketDraft((current) => ({ ...current, ...draft }))
          }
          onOrder={() => undefined}
          onQuote={() => undefined}
          onSwap={() => undefined}
        />
      </section>
      <CommandNavigation
        mobile
        activePanel="market"
        copy={copy}
        onSelectPanel={() => undefined}
      />
    </main>
  );
}

export const WorldMarketMobile = {
  name: "World market / Mobile liquidity disclosure",
  render: () => <WorldMarketAuditFixture />,
};
