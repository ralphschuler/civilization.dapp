"use client";

import { useEffect, useRef, useState } from "react";
import {
  civilizationMessages,
  type CivilizationLocale,
} from "../lib/civilization-locale";

type SettingsCopy = Pick<
  ReturnType<typeof civilizationMessages>,
  | "account"
  | "addressCopied"
  | "addressCopyFailed"
  | "appearance"
  | "appearanceApply"
  | "appearanceApplying"
  | "appearanceClassic"
  | "appearanceDawn"
  | "appearanceDescription"
  | "appearanceDusk"
  | "appearanceReset"
  | "appearanceSaved"
  | "appearanceUnavailable"
  | "connectedWallet"
  | "completionNotifications"
  | "completionNotificationsDescription"
  | "copyAddress"
  | "english"
  | "german"
  | "language"
  | "logout"
  | "logoutFailed"
  | "logoutPending"
  | "motion"
  | "motionDescription"
  | "session"
  | "settingsClose"
  | "settingsTitle"
>;

export type SettingsDialogProps = {
  copy: SettingsCopy;
  locale: CivilizationLocale;
  onChangeLocale: (locale: CivilizationLocale) => void;
  appearance: "classic" | "dusk" | "dawn";
  appearancePending: boolean;
  appearanceStatus: string;
  onApplyAppearance: () => Promise<void> | void;
  onChangeAppearance: (appearance: "classic" | "dusk" | "dawn") => void;
  onResetAppearance: () => Promise<void> | void;
  onClose: () => void;
  onLogout: () => Promise<void> | void;
  onSetCompletionNotifications: (enabled: boolean) => void;
  onSetReducedMotion: (enabled: boolean) => void;
  completionNotificationsEnabled: boolean;
  reducedMotion: boolean;
  walletAddress: string | null;
};

function focusableElements(dialog: HTMLElement) {
  return [
    ...dialog.querySelectorAll<HTMLElement>("button, select, input"),
  ].filter((element) => !element.hasAttribute("disabled"));
}

export function SettingsDialog(props: SettingsDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const [feedback, setFeedback] = useState("");
  const [logoutPending, setLogoutPending] = useState(false);
  const walletAddress = props.walletAddress || "—";

  useEffect(() => {
    dialogRef.current
      ?.querySelector<HTMLElement>("[data-close-settings]")
      ?.focus();
  }, []);

  const copyWalletAddress = async () => {
    if (walletAddress === "—") return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("clipboard_unavailable");
      }
      await navigator.clipboard.writeText(walletAddress);
      setFeedback(props.copy.addressCopied);
    } catch {
      setFeedback(props.copy.addressCopyFailed);
    }
  };

  const logout = async () => {
    setLogoutPending(true);
    try {
      await props.onLogout();
    } catch {
      setLogoutPending(false);
      setFeedback(props.copy.logoutFailed);
    }
  };

  return (
    <>
      <div
        className="settings-backdrop"
        aria-hidden="true"
        onClick={props.onClose}
      />
      <section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        aria-describedby="settings-feedback"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            props.onClose();
            return;
          }
          if (event.key !== "Tab" || !dialogRef.current) return;
          const focusable = focusableElements(dialogRef.current);
          const first = focusable[0];
          const last = focusable.at(-1);
          if (!first || !last) return;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <header className="settings-dialog__header">
          <h2 id="settings-title">{props.copy.settingsTitle}</h2>
          <button
            type="button"
            className="settings-dialog__close"
            data-close-settings
            aria-label={props.copy.settingsClose}
            onClick={props.onClose}
          >
            ×
          </button>
        </header>
        <div className="settings-dialog__body">
          <section aria-labelledby="settings-language-title">
            <h3 id="settings-language-title">{props.copy.language}</h3>
            <label className="settings-field" htmlFor="civilization-locale">
              <span>{props.copy.language}</span>
              <select
                id="civilization-locale"
                value={props.locale}
                onChange={(event) =>
                  props.onChangeLocale(
                    event.currentTarget.value as CivilizationLocale,
                  )
                }
              >
                <option value="de-DE">{props.copy.german}</option>
                <option value="en-US">{props.copy.english}</option>
              </select>
            </label>
          </section>
          <section aria-labelledby="settings-account-title">
            <h3 id="settings-account-title">{props.copy.account}</h3>
            <p className="settings-wallet-label">
              {props.copy.connectedWallet}
            </p>
            <code className="settings-wallet-address">{walletAddress}</code>
            <button
              type="button"
              className="settings-secondary-action"
              onClick={copyWalletAddress}
            >
              {props.copy.copyAddress}
            </button>
          </section>
          <section aria-labelledby="settings-appearance-title">
            <h3 id="settings-appearance-title">{props.copy.appearance}</h3>
            <p className="settings-description">
              {props.copy.appearanceDescription}
            </p>
            <label className="settings-field" htmlFor="village-appearance">
              <span>{props.copy.appearance}</span>
              <select
                id="village-appearance"
                value={props.appearance}
                disabled={props.appearancePending}
                onChange={(event) =>
                  props.onChangeAppearance(
                    event.currentTarget.value as "classic" | "dusk" | "dawn",
                  )
                }
              >
                <option value="classic">{props.copy.appearanceClassic}</option>
                <option value="dusk">{props.copy.appearanceDusk}</option>
                <option value="dawn">{props.copy.appearanceDawn}</option>
              </select>
            </label>
            <div className="settings-appearance-actions">
              <button
                type="button"
                className="settings-primary-action"
                disabled={props.appearancePending}
                onClick={() => void props.onApplyAppearance()}
              >
                {props.appearancePending
                  ? props.copy.appearanceApplying
                  : props.copy.appearanceApply}
              </button>
              <button
                type="button"
                className="settings-appearance-reset"
                disabled={
                  props.appearancePending || props.appearance === "classic"
                }
                onClick={() => void props.onResetAppearance()}
              >
                {props.copy.appearanceReset}
              </button>
            </div>
          </section>
          <section aria-labelledby="settings-motion-title">
            <h3 id="settings-motion-title">{props.copy.motion}</h3>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={props.reducedMotion}
                onChange={(event) =>
                  props.onSetReducedMotion(event.currentTarget.checked)
                }
              />
              <span>{props.copy.motionDescription}</span>
            </label>
          </section>
          <section aria-labelledby="settings-completion-notifications-title">
            <h3 id="settings-completion-notifications-title">
              {props.copy.completionNotifications}
            </h3>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={props.completionNotificationsEnabled}
                onChange={(event) =>
                  props.onSetCompletionNotifications(
                    event.currentTarget.checked,
                  )
                }
              />
              <span>{props.copy.completionNotificationsDescription}</span>
            </label>
          </section>
          <section aria-labelledby="settings-session-title">
            <h3 id="settings-session-title">{props.copy.session}</h3>
            <button
              type="button"
              className="settings-logout"
              disabled={logoutPending}
              onClick={logout}
            >
              {logoutPending ? props.copy.logoutPending : props.copy.logout}
            </button>
          </section>
          <p
            id="settings-feedback"
            className="settings-feedback"
            role="status"
            aria-live="polite"
          >
            {feedback || props.appearanceStatus}
          </p>
        </div>
      </section>
    </>
  );
}
