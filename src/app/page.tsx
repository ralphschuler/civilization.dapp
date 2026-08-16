import { WalletAccess } from "@/components/WalletAccess";
import { WalletAccessE2eHarness } from "@/components/WalletAccess/WalletAccessE2eHarness";
import { runtimeConfiguration } from "@/lib/runtime-config";
import { walletAccessE2eModeEnabled } from "@/lib/wallet-access-e2e-mode";

export default function Home() {
  if (walletAccessE2eModeEnabled()) {
    return <WalletAccessE2eHarness />;
  }
  const { world } = runtimeConfiguration();
  return (
    <WalletAccess
      contractAddress={world.civilizationContractAddress}
      environment={world.environment}
      worldIdAppId={world.worldIdAppId}
      worldIdAction={world.worldIdAction}
    />
  );
}
