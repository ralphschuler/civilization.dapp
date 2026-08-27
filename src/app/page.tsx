import { WalletAccess } from "@/components/WalletAccess";
import { WalletAccessE2eHarness } from "@/components/WalletAccess/WalletAccessE2eHarness";
import { BuildPanelE2eHarness } from "@/components/BuildPanelE2eHarness";
import { EntryGuideE2eHarness } from "@/components/EntryGuideE2eHarness";
import { RaidHistoryE2eHarness } from "@/components/RaidHistoryE2eHarness";
import { runtimeConfiguration } from "@/lib/runtime-config";
import { walletAccessE2eModeEnabled } from "@/lib/wallet-access-e2e-mode";
import { civilizationMessages } from "@/lib/civilization-locale";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    buildPanelE2e?: string;
    appearanceE2e?: string;
    entryGuideE2e?: string;
    feedbackE2e?: string;
    raidHistoryE2e?: string;
  }>;
}) {
  if (walletAccessE2eModeEnabled()) {
    const {
      appearanceE2e,
      buildPanelE2e,
      entryGuideE2e,
      feedbackE2e,
      raidHistoryE2e,
    } = await searchParams;
    if (entryGuideE2e === "mobile-focus") return <EntryGuideE2eHarness />;
    if (raidHistoryE2e === "reports") return <RaidHistoryE2eHarness />;
    if (
      buildPanelE2e === "one-job" ||
      buildPanelE2e === "two-jobs" ||
      buildPanelE2e === "ready-with-claimable" ||
      buildPanelE2e === "impact" ||
      buildPanelE2e === "dependency"
    ) {
      return <BuildPanelE2eHarness scenario={buildPanelE2e} />;
    }
    return (
      <WalletAccessE2eHarness
        appearanceE2e={appearanceE2e === "world"}
        initialFeedback={feedbackE2e}
      />
    );
  }
  const configuration = runtimeConfiguration();
  if (!configuration.ready) {
    // The server has no selected client locale. The documented German default
    // is still sourced from the typed catalog rather than duplicated here.
    const copy = civilizationMessages("de-DE");
    return (
      <main>
        <h1>{copy.unavailable}</h1>
        <p>{copy.unavailableDetail}</p>
      </main>
    );
  }
  const { world } = configuration;
  return (
    <WalletAccess
      contractAddress={world.civilizationContractAddress}
      worldTokenAddress={world.worldTokenAddress}
      environment={world.environment}
    />
  );
}
