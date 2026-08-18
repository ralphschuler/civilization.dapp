"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startCivilizationApp, stopCivilizationApp } from "@/app";
import { WalletVillageRegistrationGate } from "@/components/CivilizationClient/WalletVillageRegistrationGate";
import {
  type WalletAccessLocale,
  walletAccessMessages,
} from "@/lib/wallet-access-locale";
import { WalletAccess, type WalletAccessAttempt } from "./index";

type Scenario =
  | "registered"
  | "unregistered-success"
  | "unregistered-rejected"
  | "status-loading"
  | "status-unavailable"
  | "wallet-rejected";
type Screen = "login" | "checking" | "gate" | "status-unavailable" | "game";

const TEST_WALLET_ADDRESS = "0x0000000000000000000000000000000000000001";

function E2eGameRoot() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root.current) return;
    startCivilizationApp({
      root: root.current,
      runtimeMode: "demo",
      worldAppInstalled: false,
      worldAccessConfirmed: true,
    });
    root.current.focus();
    return () => stopCivilizationApp();
  }, []);

  return (
    <div
      ref={root}
      tabIndex={-1}
      data-testid="civilization-game-root"
      aria-label="Civilization game"
    />
  );
}

/**
 * Mounted exclusively behind the server-only development E2E switch. The
 * injected WalletAuth/SIWE and registration outcomes do not invoke MiniKit,
 * fetch, SIWE, a wallet provider, or an RPC endpoint.
 */
export function WalletAccessE2eHarness() {
  const [scenario, setScenario] = useState<Scenario>("registered");
  const [locale, setLocale] = useState<WalletAccessLocale>("de-DE");
  const [screen, setScreen] = useState<Screen>("login");
  const [registering, setRegistering] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState("");
  const copy = walletAccessMessages(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = "de";
    };
  }, [locale]);

  const attempt: WalletAccessAttempt = useCallback(
    () =>
      new Promise((resolve, reject) => {
        window.setTimeout(() => {
          if (scenario === "wallet-rejected") {
            reject({ code: "user_rejected" });
            return;
          }
          resolve(TEST_WALLET_ADDRESS);
        }, 80);
      }),
    [scenario],
  );

  const checkRegistration = useCallback(() => {
    setScreen("checking");
    setRegistrationStatus("");
    window.setTimeout(() => {
      if (scenario === "status-loading") return;
      if (scenario === "status-unavailable") {
        setScreen("status-unavailable");
        return;
      }
      setScreen(scenario === "registered" ? "game" : "gate");
    }, 120);
  }, [scenario]);

  const handleAccessGranted = useCallback(() => {
    checkRegistration();
  }, [checkRegistration]);

  const registerVillage = useCallback(() => {
    setRegistering(true);
    setRegistrationStatus(copy.registration.pending);
    window.setTimeout(() => {
      setRegistering(false);
      if (scenario === "unregistered-rejected") {
        setRegistrationStatus(copy.registration.rejected);
        return;
      }
      setScreen("game");
    }, 250);
  }, [copy.registration, scenario]);

  const gateStatus = registrationStatus || copy.registration.ready;

  return (
    <>
      {screen === "login" ? (
        <WalletAccess
          contractAddress={TEST_WALLET_ADDRESS}
          worldTokenAddress="0x0000000000000000000000000000000000000002"
          environment="development"
          attemptWalletAccess={attempt}
          onWalletAccessGranted={handleAccessGranted}
          locale={locale}
        />
      ) : null}
      {screen === "gate" ? (
        <WalletVillageRegistrationGate
          busy={registering}
          checked
          checking={false}
          checkFailed={false}
          onRegisterVillage={registerVillage}
          onRetryRegistrationCheck={checkRegistration}
          status={gateStatus}
          locale={locale}
        />
      ) : null}
      {screen === "checking" || screen === "status-unavailable" ? (
        <WalletVillageRegistrationGate
          busy={false}
          checked={false}
          checking={screen === "checking"}
          checkFailed={screen === "status-unavailable"}
          onRegisterVillage={() => {}}
          onRetryRegistrationCheck={checkRegistration}
          status=""
          locale={locale}
        />
      ) : null}
      {screen === "game" ? <E2eGameRoot /> : null}
      <aside className="wallet-access-e2e-controls" aria-label="E2E controls">
        <label htmlFor="wallet-access-e2e-scenario">Test scenario</label>
        <select
          id="wallet-access-e2e-scenario"
          data-testid="wallet-access-e2e-scenario"
          value={scenario}
          onChange={(event) => setScenario(event.target.value as Scenario)}
        >
          <option value="registered">Already registered</option>
          <option value="unregistered-success">Registration succeeds</option>
          <option value="unregistered-rejected">Registration rejected</option>
          <option value="status-loading">On-chain status loading</option>
          <option value="status-unavailable">
            On-chain status unavailable
          </option>
          <option value="wallet-rejected">Wallet rejected</option>
        </select>
        <label htmlFor="wallet-access-e2e-locale">Test locale</label>
        <select
          id="wallet-access-e2e-locale"
          data-testid="wallet-access-e2e-locale"
          value={locale}
          onChange={(event) =>
            setLocale(event.target.value as WalletAccessLocale)
          }
        >
          <option value="de-DE">de-DE</option>
          <option value="en-US">en-US</option>
        </select>
      </aside>
    </>
  );
}
