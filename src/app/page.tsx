import { WalletAccess } from "@/components/WalletAccess";
import { WalletAccessE2eHarness } from "@/components/WalletAccess/WalletAccessE2eHarness";
import { runtimeConfiguration } from "@/lib/runtime-config";
import { walletAccessE2eModeEnabled } from "@/lib/wallet-access-e2e-mode";
import { civilizationMessages } from "@/lib/civilization-locale";

export default function Home() {
  if (walletAccessE2eModeEnabled()) {
    return <WalletAccessE2eHarness />;
  }
  const configuration = runtimeConfiguration();
  if (!configuration.ready) {
    const copy = civilizationMessages();
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
