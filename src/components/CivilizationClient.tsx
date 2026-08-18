"use client";

import { useEffect, useRef } from "react";
import { startCivilizationApp, stopCivilizationApp } from "@/app";
import { WalletVillageRegistrationGate } from "@/components/CivilizationClient/WalletVillageRegistrationGate";
import { useWalletVillageRegistration } from "@/components/CivilizationClient/useWalletVillageRegistration";
import type { CivilizationLocale } from "@/lib/civilization-locale";

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
  locale: CivilizationLocale;
  onLocaleChange: (locale: CivilizationLocale) => void;
};

export default function CivilizationClient({
  walletAddress,
  contractAddress,
  worldTokenAddress,
  locale,
  onLocaleChange,
}: CivilizationClientProps) {
  return (
    <ProductionCivilizationClient
      walletAddress={walletAddress}
      contractAddress={contractAddress}
      worldTokenAddress={worldTokenAddress}
      locale={locale}
      onLocaleChange={onLocaleChange}
    />
  );
}

function ProductionCivilizationClient({
  walletAddress,
  contractAddress,
  worldTokenAddress,
  locale,
  onLocaleChange,
}: Pick<
  CivilizationClientProps,
  | "walletAddress"
  | "contractAddress"
  | "worldTokenAddress"
  | "locale"
  | "onLocaleChange"
>) {
  const root = useRef<HTMLDivElement>(null);
  const {
    busy,
    checked,
    checking,
    checkFailed,
    registered,
    retryRegistrationCheck,
    registerVillage,
    status,
    worldAdapter,
  } = useWalletVillageRegistration(
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
      locale,
      onLocaleChange,
    });
    return () => {
      stopCivilizationApp();
    };
  }, [registered, walletAddress, worldAdapter, locale, onLocaleChange]);

  if (registered) {
    return <div ref={root} />;
  }
  return (
    <WalletVillageRegistrationGate
      busy={busy}
      checked={checked}
      checking={checking}
      checkFailed={checkFailed}
      onRegisterVillage={registerVillage}
      onRetryRegistrationCheck={retryRegistrationCheck}
      status={status}
      locale={locale}
    />
  );
}
