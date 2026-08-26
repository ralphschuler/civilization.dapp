"use client";

import { ArmyPanel, type ArmyPanelProps } from "./ArmyPanel";
import { BuildPanel, type BuildPanelProps } from "./BuildPanel";
import {
  CompletionReadyNotice,
  type CompletionReadyNoticeProps,
} from "./CompletionReadyNotice";
import {
  CommandNavigation,
  type CommandNavigationProps,
  type CommandPanel,
} from "./CommandNavigation";
import { EntryGuide, type EntryGuideRecommendation } from "./EntryGuide";
import { GameFooter, type GameFooterProps } from "./GameFooter";
import { GameShellHud, type GameShellHudProps } from "./GameShellHud";
import { MarketPanel, type MarketPanelProps } from "./MarketPanel";
import { RaidPanel, type RaidPanelProps } from "./RaidPanel";
import { SettingsDialog, type SettingsDialogProps } from "./SettingsDialog";
import { VillageMap, type VillageMapProps } from "./VillageMap";
import {
  WalletReviewDialog,
  type WalletReviewDialogProps,
} from "./WalletReviewDialog";

export type GameShellFrameProps = {
  activePanel: CommandPanel;
  appearance?: "classic" | "dusk";
  army: ArmyPanelProps;
  build: BuildPanelProps;
  completionReady: CompletionReadyNoticeProps | null;
  desktopNavigation: Omit<CommandNavigationProps, "mobile">;
  entryGuide: {
    copy: Parameters<typeof EntryGuide>[0]["copy"];
    recommendation: EntryGuideRecommendation;
    onDismiss: () => void;
    onRoute: (recommendation: EntryGuideRecommendation) => void;
  } | null;
  footer: GameFooterProps;
  hud: GameShellHudProps;
  market: MarketPanelProps;
  mobileNavigation: Omit<CommandNavigationProps, "mobile">;
  raid: RaidPanelProps;
  reducedMotion: boolean;
  settings: SettingsDialogProps | null;
  villageMap: VillageMapProps;
  walletReview: WalletReviewDialogProps | null;
};

/**
 * The stable game document. The controller supplies all live state and
 * callbacks; this frame deliberately owns no game state of its own.
 */
export function GameShellFrame(props: GameShellFrameProps) {
  return (
    <section
      className={`game-shell village-shell ${props.reducedMotion ? "motion-reduced" : ""}`}
      data-village-appearance={props.appearance || "classic"}
    >
      <div data-game-shell-hud>
        <GameShellHud {...props.hud} />
      </div>
      <div data-entry-guide-mount>
        {props.entryGuide ? <EntryGuide {...props.entryGuide} /> : null}
      </div>
      <div data-completion-ready-notice>
        {props.completionReady ? (
          <CompletionReadyNotice {...props.completionReady} />
        ) : null}
      </div>
      <main className="command-layout">
        <div data-game-village-map>
          <VillageMap {...props.villageMap} />
        </div>
        <aside className="command-rail">
          <div data-game-command-navigation-mount="desktop">
            <CommandNavigation {...props.desktopNavigation} />
          </div>
          <section className="command-panel" id="game-command-panel">
            <div data-game-build-panel hidden={props.activePanel !== "build"}>
              <BuildPanel
                {...props.build}
                active={props.activePanel === "build"}
              />
            </div>
            <div data-game-army-panel hidden={props.activePanel !== "army"}>
              <ArmyPanel {...props.army} />
            </div>
            <div data-game-market-panel hidden={props.activePanel !== "market"}>
              <MarketPanel {...props.market} />
            </div>
            <div data-game-raid-panel hidden={props.activePanel !== "raid"}>
              <RaidPanel {...props.raid} />
            </div>
          </section>
        </aside>
      </main>
      <div data-game-footer>
        <GameFooter {...props.footer} />
      </div>
      <div data-game-command-navigation-mount="mobile">
        <CommandNavigation {...props.mobileNavigation} mobile />
      </div>
      <div data-game-settings-dialog>
        {props.settings ? <SettingsDialog {...props.settings} /> : null}
      </div>
      <div data-wallet-review-dialog>
        {props.walletReview ? (
          <WalletReviewDialog {...props.walletReview} />
        ) : null}
      </div>
    </section>
  );
}
