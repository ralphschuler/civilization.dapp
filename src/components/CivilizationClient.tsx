"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startCivilizationApp, stopCivilizationApp } from "@/app";
import {
  CivilizationRuntimeGate,
  type CivilizationGateState,
} from "@/components/CivilizationClient/CivilizationRuntimeGate";
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
  onLogout: () => Promise<void>;
};

export default function CivilizationClient({
  walletAddress,
  contractAddress,
  worldTokenAddress,
  locale,
  onLocaleChange,
  onLogout,
}: CivilizationClientProps) {
  return (
    <ProductionCivilizationClient
      walletAddress={walletAddress}
      contractAddress={contractAddress}
      worldTokenAddress={worldTokenAddress}
      locale={locale}
      onLocaleChange={onLocaleChange}
      onLogout={onLogout}
    />
  );
}

function ProductionCivilizationClient({
  walletAddress,
  contractAddress,
  worldTokenAddress,
  locale,
  onLocaleChange,
  onLogout,
}: Pick<
  CivilizationClientProps,
  | "walletAddress"
  | "contractAddress"
  | "worldTokenAddress"
  | "locale"
  | "onLocaleChange"
  | "onLogout"
>) {
  const root = useRef<HTMLDivElement>(null);
  const localeRef = useRef(locale);
  const onLocaleChangeRef = useRef(onLocaleChange);
  const onLogoutRef = useRef(onLogout);
  const [gate, setGate] = useState<CivilizationGateState | null>(null);
  const [retryGate, setRetryGate] = useState<(() => void) | null>(null);
  const onGateStateChange = useCallback(
    (nextGate: CivilizationGateState | null, retry: (() => void) | null) => {
      setRetryGate(() => retry);
      setGate(nextGate);
    },
    [],
  );
  useEffect(() => {
    localeRef.current = locale;
    onLocaleChangeRef.current = onLocaleChange;
    onLogoutRef.current = onLogout;
  }, [locale, onLocaleChange, onLogout]);
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
    locale,
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
      locale: localeRef.current,
      onLocaleChange: (nextLocale) => onLocaleChangeRef.current(nextLocale),
      onLogout: () => onLogoutRef.current(),
      onGateStateChange,
    });
    return () => {
      stopCivilizationApp();
    };
  }, [registered, walletAddress, worldAdapter, onGateStateChange]);

  if (registered) {
    return (
      <>
        <div ref={root} />
        <CivilizationRuntimeGate gate={gate} onRetry={retryGate} />
      </>
    );
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
