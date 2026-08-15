"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUserOperationReceipt } from "@worldcoin/minikit-react";
import { startCivilizationApp, stopCivilizationApp } from "@/app";
import { WalletVillageRegistrationGate } from "@/components/CivilizationClient/WalletVillageRegistrationGate";
import { useWalletVillageRegistration } from "@/components/CivilizationClient/useWalletVillageRegistration";
import { DevelopmentWorldIdRegistration } from "@/components/CivilizationClient/DevelopmentWorldIdRegistration";
import {
  createWorldGameAdapter,
  readCivilizationState,
  worldGameClient,
} from "@/world-game";

/**
 * This component is reached only after the server has verified WalletAuth/SIWE.
 * Its wallet is therefore the server-verified checksum identity; it never
 * accepts an address supplied to a registration call.
 */
type CivilizationClientProps = {
  walletAddress: string;
  contractAddress: string;
  environment: "production" | "development";
  worldIdAppId: string;
  worldIdAction: string;
};

export default function CivilizationClient({
  walletAddress,
  contractAddress,
  environment,
  worldIdAppId,
  worldIdAction,
}: CivilizationClientProps) {
  if (environment === "development")
    return (
      <DevelopmentCivilizationClient
        walletAddress={walletAddress}
        contractAddress={contractAddress}
        worldIdAppId={worldIdAppId}
        worldIdAction={worldIdAction}
      />
    );
  return (
    <ProductionCivilizationClient
      walletAddress={walletAddress}
      contractAddress={contractAddress}
    />
  );
}

function ProductionCivilizationClient({
  walletAddress,
  contractAddress,
}: Pick<CivilizationClientProps, "walletAddress" | "contractAddress">) {
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

function DevelopmentCivilizationClient({
  walletAddress,
  contractAddress,
  worldIdAppId,
  worldIdAction,
}: Pick<
  CivilizationClientProps,
  "walletAddress" | "contractAddress" | "worldIdAppId" | "worldIdAction"
>) {
  const root = useRef<HTMLDivElement>(null);
  const [registered, setRegistered] = useState(false);
  const { poll } = useUserOperationReceipt({
    client: worldGameClient,
    confirmations: 1,
    timeout: 45_000,
  });
  const worldAdapter = useMemo(
    () =>
      createWorldGameAdapter({
        walletAddress,
        contractAddress,
        pollReceipt: poll,
      }),
    [walletAddress, contractAddress, poll],
  );
  useEffect(() => {
    readCivilizationState(walletAddress, contractAddress)
      .then((state) => setRegistered(state.registered))
      .catch(() => setRegistered(false));
  }, [walletAddress, contractAddress]);
  useEffect(() => {
    if (!registered || !root.current) return;
    startCivilizationApp({
      root: root.current,
      worldAppInstalled: true,
      worldAccessConfirmed: true,
      worldWalletAddress: walletAddress,
      worldAdapter,
    });
    return () => stopCivilizationApp();
  }, [registered, walletAddress, worldAdapter]);
  if (registered) return <div ref={root} />;
  return (
    <DevelopmentWorldIdRegistration
      walletAddress={walletAddress}
      contractAddress={contractAddress}
      appId={worldIdAppId}
      action={worldIdAction}
      onRegistered={() => setRegistered(true)}
    />
  );
}
