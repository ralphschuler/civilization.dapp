import { NativeWalletAuthDiagnostic } from '@/components/NativeWalletAuthDiagnostic';
import { runtimeConfiguration } from '@/lib/runtime-config';

export default function Home() {
  const { world } = runtimeConfiguration();
  return <NativeWalletAuthDiagnostic worldConfiguration={world} />;
}
