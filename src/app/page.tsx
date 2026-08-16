import { WalletAccess } from "@/components/WalletAccess";
import { runtimeConfiguration } from "@/lib/runtime-config";

export default function Home() {
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
