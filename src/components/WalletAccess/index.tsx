"use client";

import { MiniKit } from "@worldcoin/minikit-js";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { verifyWalletForDirectGame } from "@/lib/direct-wallet-game-flow";
import {
  type WalletAccessLocale,
  walletAccessMessages,
} from "@/lib/wallet-access-locale";
import {
  CIVILIZATION_LOCALE_STORAGE_KEY,
  civilizationMessages,
  localeLanguageTag,
  resolveCivilizationLocale,
  type CivilizationLocale,
} from "@/lib/civilization-locale";

const CivilizationClient = dynamic(
  () => import("@/components/CivilizationClient"),
  { ssr: false },
);

type WalletAccessProps = {
  contractAddress: string;
  worldTokenAddress: string;
  environment: "production" | "development";
  /** Test-only dependency supplied by the server-gated E2E harness. */
  attemptWalletAccess?: WalletAccessAttempt;
  /** Keeps the E2E harness on the success state instead of loading the game. */
  onWalletAccessGranted?: (walletAddress: string) => void;
  locale?: WalletAccessLocale;
};

export type WalletAccessAttempt = () => Promise<string>;

type AccessStatus = "idle" | "pending" | "success" | "cancelled" | "failure";
type SessionState = "restoring" | "ready";

function wasCancelled(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "user_rejected")
  );
}

export const WalletAccess = ({
  contractAddress,
  worldTokenAddress,
  environment,
  attemptWalletAccess,
  onWalletAccessGranted,
  locale: controlledLocale,
}: WalletAccessProps) => {
  const [selectedLocale, setSelectedLocale] = useState<CivilizationLocale>(
    () => {
      if (typeof window === "undefined") return "en-US";
      const queryLocale = new URLSearchParams(window.location.search).get(
        "lang",
      );
      return resolveCivilizationLocale(
        queryLocale ??
          window.localStorage.getItem(CIVILIZATION_LOCALE_STORAGE_KEY),
      );
    },
  );
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [verifiedWalletAddress, setVerifiedWalletAddress] = useState<
    string | null
  >(null);
  const [sessionState, setSessionState] = useState<SessionState>(() =>
    attemptWalletAccess ? "ready" : "restoring",
  );
  const [status, setStatus] = useState<AccessStatus>("idle");
  const attemptInFlight = useRef(false);

  const locale = controlledLocale ?? selectedLocale;
  const gameCopy = civilizationMessages(locale);

  useEffect(() => {
    document.documentElement.lang = localeLanguageTag(locale);
  }, [locale]);

  useEffect(() => {
    if (attemptWalletAccess) return;
    let active = true;
    void fetch("/api/wallet-auth/session", { cache: "no-store" })
      .then(async (response) => {
        const session = await response.json().catch(() => null);
        if (
          response.ok &&
          session?.isValid === true &&
          typeof session.address === "string"
        ) {
          return session.address;
        }
        return null;
      })
      .catch(() => null)
      .then((address) => {
        if (!active) return;
        if (address) setWalletAddress(address);
        setSessionState("ready");
      });
    return () => {
      active = false;
    };
  }, [attemptWalletAccess]);

  const changeLocale = (nextLocale: CivilizationLocale) => {
    window.localStorage.setItem(CIVILIZATION_LOCALE_STORAGE_KEY, nextLocale);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", nextLocale === "en-US" ? "en" : "de");
    window.history.replaceState(null, "", url);
    setSelectedLocale(nextLocale);
  };

  useEffect(() => {
    if (!verifiedWalletAddress) return;
    if (onWalletAccessGranted) {
      onWalletAccessGranted(verifiedWalletAddress);
      return;
    }
    const nextScreen = window.setTimeout(
      () => setWalletAddress(verifiedWalletAddress),
      250,
    );
    return () => window.clearTimeout(nextScreen);
  }, [onWalletAccessGranted, verifiedWalletAddress]);

  const handleWalletAccess = async () => {
    if (attemptInFlight.current) {
      return;
    }
    attemptInFlight.current = true;
    setStatus("pending");
    try {
      const verifyWallet =
        attemptWalletAccess ??
        (() =>
          verifyWalletForDirectGame({
            fetchImpl: fetch,
            walletAuth: (input: Parameters<typeof MiniKit.walletAuth>[0]) =>
              MiniKit.walletAuth(input),
          }));
      setVerifiedWalletAddress(await verifyWallet());
      setStatus("success");
    } catch (error) {
      setStatus(wasCancelled(error) ? "cancelled" : "failure");
    } finally {
      attemptInFlight.current = false;
    }
  };
  if (walletAddress) {
    return (
      <CivilizationClient
        key={`${contractAddress}:${walletAddress}`}
        walletAddress={walletAddress}
        contractAddress={contractAddress}
        worldTokenAddress={worldTokenAddress}
        locale={locale}
        onLocaleChange={changeLocale}
      />
    );
  }

  // Keep the login gate out of the first paint until the server has checked
  // the HttpOnly cookie; this avoids a login-to-game hydration flash.
  if (sessionState === "restoring") {
    return <main className="civilization-login" aria-busy="true" />;
  }

  const isPending = status === "pending";
  const isLocked = isPending || status === "success";
  const copy = walletAccessMessages(locale).login;
  const statusCopy = {
    idle: { action: copy.action, message: "" },
    pending: { action: copy.pendingAction, message: copy.pending },
    success: { action: copy.successAction, message: copy.success },
    cancelled: { action: copy.retryAction, message: copy.cancelled },
    failure: { action: copy.retryAction, message: copy.failure },
  }[status];

  return (
    <main className="civilization-login" aria-busy={isPending}>
      <div className="civilization-login__backdrop" aria-hidden="true" />
      <section
        className="civilization-login__card"
        aria-labelledby="civilization-login-title"
      >
        <header className="civilization-login__header">
          <span className="civilization-login__mark" aria-hidden="true">
            CD
          </span>
          <div>
            <p className="civilization-login__eyebrow">Civilization</p>
            <p className="civilization-login__product">WORLD MINI APP</p>
          </div>
          {!controlledLocale ? (
            <label>
              <span className="sr-only">{gameCopy.language}</span>
              <select
                value={locale}
                onChange={(event) =>
                  changeLocale(event.target.value as CivilizationLocale)
                }
                aria-label={gameCopy.language}
              >
                <option value="de-DE">{gameCopy.german}</option>
                <option value="en-US">{gameCopy.english}</option>
              </select>
            </label>
          ) : null}
          {environment === "development" ? (
            <span className="civilization-login__dev">DEV</span>
          ) : null}
        </header>
        <div className="civilization-login__intro">
          <h1 id="civilization-login-title">{gameCopy.loginTitle}</h1>
          <p>{gameCopy.loginIntro}</p>
        </div>
        <section
          className="civilization-login__wallet"
          aria-label={gameCopy.walletAccess}
        >
          <p>{gameCopy.walletExplanation}</p>
          <p className="civilization-login__safety" role="note">
            {gameCopy.walletSafetyContract}
          </p>
          <p className="civilization-login__safety" role="note">
            {gameCopy.walletSafetySecret}
          </p>
          <button
            type="button"
            onClick={handleWalletAccess}
            disabled={isLocked}
            className="civilization-login__action"
            aria-describedby="wallet-access-status"
          >
            {statusCopy.action}
          </button>
          <p
            id="wallet-access-status"
            className="civilization-login__status"
            data-state={status}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {statusCopy.message}
          </p>
        </section>
      </section>
    </main>
  );
};
