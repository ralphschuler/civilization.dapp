"use client";

import { useEffect, useRef } from "react";
import {
  type WalletAccessLocale,
  walletAccessMessages,
} from "@/lib/wallet-access-locale";
import { civilizationMessages } from "@/lib/civilization-locale";

type WalletVillageRegistrationGateProps = {
  busy: boolean;
  checked: boolean;
  checking: boolean;
  checkFailed: boolean;
  onRegisterVillage: () => void;
  onRetryRegistrationCheck: () => void;
  status: string;
  locale?: WalletAccessLocale;
};

export function WalletVillageRegistrationGate({
  busy,
  checked,
  checking,
  checkFailed,
  onRegisterVillage,
  onRetryRegistrationCheck,
  status,
  locale = "de-DE",
}: WalletVillageRegistrationGateProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const copy = walletAccessMessages(locale).registration;
  const gameCopy = civilizationMessages(locale);
  const isRegistrationReady = checked && !checking && !checkFailed;
  const action = checkFailed
    ? copy.retryCheckAction
    : checking
      ? copy.checkingAction
      : busy
        ? copy.pendingAction
        : copy.action;
  const statusMessage = checkFailed
    ? copy.unavailable
    : checking
      ? copy.checking
      : status;
  const title = checkFailed
    ? copy.unavailableHeading
    : checking
      ? copy.checkingHeading
      : copy.heading;

  useEffect(() => {
    heading.current?.focus();
  }, [busy, checking, checkFailed, status]);

  return (
    <main className="game-access-gate" aria-busy={busy || checking}>
      <div className="game-access-card">
        <span className="game-access-mark">CD</span>
        <p>WORLD MINI APP</p>
        <h1 ref={heading} tabIndex={-1} data-testid="registration-gate-heading">
          {title}
        </h1>
        <p>{gameCopy.registrationPublic}</p>
        <span role="status" aria-live="polite" aria-atomic="true">
          {statusMessage}
        </span>
        <button
          className="game-access-action"
          onClick={checkFailed ? onRetryRegistrationCheck : onRegisterVillage}
          disabled={checking || busy || (!checkFailed && !isRegistrationReady)}
        >
          {action}
        </button>
      </div>
    </main>
  );
}
