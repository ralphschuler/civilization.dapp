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
 * This component is reached after WalletAuth/SIWE binds the UI to a checksum
 * wallet. That off-chain binding is not contract authorization: every state
 * mutation is separately signed by the World wallet, and registerWallet is
 * publicly callable by any wallet for itself.
 */
type CivilizationClientProps = {
  walletAddress: string;
  contractAddress: string;
  worldTokenAddress: string;
  environment: "production" | "development";
  worldIdAppId: string;
  worldIdAction: string;
};

export default function CivilizationClient({
  walletAddress,
  contractAddress,
  worldTokenAddress,
  environment,
  worldIdAppId,
  worldIdAction,
}: CivilizationClientProps) {
  if (environment === "development")
    return (
      <DevelopmentCivilizationClient
        walletAddress={walletAddress}
        contractAddress={contractAddress}
        worldTokenAddress={worldTokenAddress}
        worldIdAppId={worldIdAppId}
        worldIdAction={worldIdAction}
      />
    );
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

function DevelopmentCivilizationClient({
  walletAddress,
  contractAddress,
  worldTokenAddress,
  worldIdAppId,
  worldIdAction,
}: Pick<
  CivilizationClientProps,
  | "walletAddress"
  | "contractAddress"
  | "worldTokenAddress"
  | "worldIdAppId"
  | "worldIdAction"
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
        worldTokenAddress,
        pollReceipt: poll,
      }),
    [walletAddress, contractAddress, worldTokenAddress, poll],
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
