export type CommandPanel = "build" | "army" | "market" | "raid";

export type CommandNavigationCopy = {
  army: string;
  armyShort: string;
  build: string;
  buildShort: string;
  market: string;
  quickAccess: string;
  raid: string;
  villageActions: string;
};

export type CommandNavigationProps = {
  activePanel: CommandPanel;
  copy: CommandNavigationCopy;
  mobile?: boolean;
  onSelectPanel: (
    panel: CommandPanel,
    navigation: "desktop" | "mobile",
  ) => void;
};

const panels: ReadonlyArray<CommandPanel> = ["build", "army", "market", "raid"];
const panelIcons: Record<CommandPanel, string> = {
  build: "⌂",
  army: "⚔",
  market: "⇄",
  raid: "◉",
};

export function CommandNavigation({
  activePanel,
  copy,
  mobile = false,
  onSelectPanel,
}: CommandNavigationProps) {
  const navigation = mobile ? "mobile" : "desktop";
  const labelFor = (panel: CommandPanel) =>
    panel === "build"
      ? copy.build
      : panel === "army"
        ? copy.army
        : panel === "market"
          ? copy.market
          : copy.raid;
  const visibleLabelFor = (panel: CommandPanel) => {
    if (!mobile) return labelFor(panel);
    return panel === "build"
      ? copy.buildShort
      : panel === "army"
        ? copy.armyShort
        : labelFor(panel);
  };

  return (
    <nav
      aria-label={mobile ? copy.quickAccess : copy.villageActions}
      className={mobile ? "mobile-hud" : "command-tabs"}
      data-game-command-navigation={navigation}
    >
      {panels.map((panel) => {
        const selected = activePanel === panel;
        return (
          <button
            aria-controls="game-command-panel"
            aria-current={selected ? "page" : undefined}
            aria-label={labelFor(panel)}
            className={selected ? "is-active" : undefined}
            data-command-panel={panel}
            key={panel}
            onClick={() => {
              onSelectPanel(panel, navigation);
            }}
            type="button"
          >
            <span className="command-nav-icon" aria-hidden="true">
              {panelIcons[panel]}
            </span>
            <span className="command-nav-label">{visibleLabelFor(panel)}</span>
          </button>
        );
      })}
    </nav>
  );
}
