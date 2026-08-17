"use client";
import { MiniKitProvider } from "@worldcoin/minikit-js/minikit-provider";
import type { MiniKitProviderConfiguration } from "@/lib/minikit-configuration";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const ErudaProvider = dynamic(
  () => import("@/providers/Eruda").then((c) => c.ErudaProvider),
  { ssr: false },
);

// Define props for ClientProviders
interface ClientProvidersProps {
  children: ReactNode;
  miniKit: MiniKitProviderConfiguration | null;
}

/**
 * ClientProvider wraps the app with essential context providers.
 *
 * - ErudaProvider:
 *     - Should be used only in development.
 *     - Enables an in-browser console for logging and debugging.
 *
 * - MiniKitProvider:
 *     - Required for MiniKit functionality.
 *
 * This component ensures both providers are available to all child components.
 */
export default function ClientProviders({
  children,
  miniKit,
}: ClientProvidersProps) {
  const content = <ErudaProvider>{children}</ErudaProvider>;

  if (miniKit === null) {
    return content;
  }

  return <MiniKitProvider props={miniKit}>{content}</MiniKitProvider>;
}
