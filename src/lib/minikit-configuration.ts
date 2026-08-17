import type { RuntimeConfiguration } from "@/lib/runtime-config";

export type MiniKitProviderConfiguration = Readonly<{
  appId: string;
}>;

/** Never expose MiniKit initialization data until the runtime profile is ready. */
export function miniKitProviderConfiguration(
  configuration: RuntimeConfiguration,
): MiniKitProviderConfiguration | null {
  return configuration.ready ? { appId: configuration.world.worldAppId } : null;
}
