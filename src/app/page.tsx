import { WalletAccess } from "@/components/WalletAccess";
import { WalletAccessE2eHarness } from "@/components/WalletAccess/WalletAccessE2eHarness";
import { runtimeConfiguration } from "@/lib/runtime-config";
import { walletAccessE2eModeEnabled } from "@/lib/wallet-access-e2e-mode";

export default function Home() {
  if (walletAccessE2eModeEnabled()) {
    return <WalletAccessE2eHarness />;
  }
  const configuration = runtimeConfiguration();
  if (!configuration.ready) {
    return (
      <main>
        <h1>Civilization ist vorübergehend nicht verfügbar.</h1>
        <p>Die sichere World-Chain-Konfiguration fehlt oder ist ungültig.</p>
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
