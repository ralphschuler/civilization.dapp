"use client";

import { useEffect, useRef } from "react";
import {
  type WalletAccessLocale,
  walletAccessMessages,
} from "@/lib/wallet-access-locale";

type WalletVillageRegistrationGateProps = {
  busy: boolean;
  checked: boolean;
  onRegisterVillage: () => void;
  status: string;
  locale?: WalletAccessLocale;
};

export function WalletVillageRegistrationGate({
  busy,
  checked,
  onRegisterVillage,
  status,
  locale = "de-DE",
}: WalletVillageRegistrationGateProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const copy = walletAccessMessages(locale).registration;

  useEffect(() => {
    heading.current?.focus();
  }, [busy, status]);

  return (
    <main className="game-access-gate" aria-busy={busy}>
      <div className="game-access-card">
        <span className="game-access-mark">CD</span>
        <p>WORLD MINI APP</p>
        <h1 ref={heading} tabIndex={-1} data-testid="registration-gate-heading">
          {copy.heading}
        </h1>
        <p>
          Die Registrierung ist öffentlich: Der Contract registriert nur die
          World Wallet, die diese Transaktion signiert. WalletAuth autorisiert
          den Contract nicht.
        </p>
        <span role="status" aria-live="polite" aria-atomic="true">
          {status}
        </span>
        <button
          className="game-access-action"
          onClick={onRegisterVillage}
          disabled={busy || !checked}
        >
          {busy ? copy.pendingAction : copy.action}
        </button>
      </div>
    </main>
  );
}
