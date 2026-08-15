"use client";

import { useEffect, useRef } from "react";
import { startCivilizationApp, stopCivilizationApp } from "@/app";
import { WalletVillageRegistrationGate } from "@/components/CivilizationClient/WalletVillageRegistrationGate";
import { useWalletVillageRegistration } from "@/components/CivilizationClient/useWalletVillageRegistration";

/**
 * This component is reached only after the server has verified WalletAuth/SIWE.
 * Its wallet is therefore the server-verified checksum identity; it never
 * accepts an address supplied to a registration call.
 */
type CivilizationClientProps = {
  walletAddress: string;
  contractAddress: string;
};

export default function CivilizationClient({
  walletAddress,
  contractAddress,
}: CivilizationClientProps) {
  const root = useRef<HTMLDivElement>(null);
  const { busy, checked, registered, registerVillage, status, worldAdapter } =
    useWalletVillageRegistration(walletAddress, contractAddress);

  useEffect(() => {
    if (!registered || !root.current) {
      return;
    }
    startCivilizationApp({
      root: root.current,
      worldAppInstalled: true,
      worldAccessConfirmed: true,
      worldWalletAddress: walletAddress,
      worldAdapter,
    });
    return () => {
      stopCivilizationApp();
    };
  }, [registered, walletAddress, worldAdapter]);

  if (registered) {
    return <div ref={root} />;
  }
  return (
    <WalletVillageRegistrationGate
      busy={busy}
      checked={checked}
      onRegisterVillage={registerVillage}
      status={status}
    />
  );
}
