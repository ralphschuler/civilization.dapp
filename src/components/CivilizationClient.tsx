"use client";

import { useEffect, useRef } from "react";
import { startCivilizationApp, stopCivilizationApp } from "@/app";
import { WalletVillageRegistrationGate } from "@/components/CivilizationClient/WalletVillageRegistrationGate";
import { useWalletVillageRegistration } from "@/components/CivilizationClient/useWalletVillageRegistration";

/**
 * This component is reached after WalletAuth/SIWE binds the UI to a checksum
 * wallet. That off-chain binding is not contract authorization: every state
 * mutation is separately signed by the World wallet, and registerWallet is
 * publicly callable by any wallet for itself.
 */
type CivilizationClientProps = {
  walletAddress: string;
  contractAddress: string;
  worldTokenAddress: string;
};

export default function CivilizationClient({
  walletAddress,
  contractAddress,
  worldTokenAddress,
}: CivilizationClientProps) {
  return (
    <ProductionCivilizationClient
      walletAddress={walletAddress}
      contractAddress={contractAddress}
      worldTokenAddress={worldTokenAddress}
    />
  );
}

function ProductionCivilizationClient({
  walletAddress,
  contractAddress,
  worldTokenAddress,
}: Pick<
  CivilizationClientProps,
  "walletAddress" | "contractAddress" | "worldTokenAddress"
>) {
  const root = useRef<HTMLDivElement>(null);
  const { busy, checked, registered, registerVillage, status, worldAdapter } =
    useWalletVillageRegistration(
      walletAddress,
      contractAddress,
      worldTokenAddress,
    );

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
