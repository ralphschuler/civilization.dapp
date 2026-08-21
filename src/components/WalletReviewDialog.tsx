"use client";

import { useEffect, useRef } from "react";
import { civilizationMessages } from "../lib/civilization-locale";

type WalletReviewCopy = Pick<
  ReturnType<typeof civilizationMessages>,
  | "reviewCancel"
  | "reviewConfirm"
  | "reviewFinality"
  | "reviewInvalidated"
  | "reviewInvalidatedTitle"
  | "reviewNotice"
  | "reviewTitle"
>;

export type WalletReviewDialogState = {
  intent: { details: readonly string[] } | null;
  status: "reviewing" | "invalidated" | "confirming" | "pending";
};

export type WalletReviewDialogProps = {
  copy: WalletReviewCopy;
  onCancel: () => void;
  onConfirm: () => void;
  review: WalletReviewDialogState;
};

function focusableElements(dialog: HTMLElement) {
  return [...dialog.querySelectorAll<HTMLElement>("button:not([disabled])")];
}

export function WalletReviewDialog(props: WalletReviewDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const unavailable = props.review.status === "invalidated";
  const waiting =
    props.review.status === "confirming" || props.review.status === "pending";
  const title = unavailable
    ? props.copy.reviewInvalidatedTitle
    : props.copy.reviewTitle;
  const note = unavailable
    ? props.copy.reviewInvalidated
    : waiting
      ? props.copy.reviewFinality
      : props.copy.reviewNotice;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    (
      dialog.querySelector<HTMLElement>("[data-confirm-wallet-review]") ??
      dialog.querySelector<HTMLElement>("[data-cancel-wallet-review]") ??
      dialog
    ).focus();
  }, [props.review.status]);

  return (
    <>
      <div className="settings-backdrop" aria-hidden="true" />
      <section
        ref={dialogRef}
        className="settings-dialog wallet-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-review-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !waiting) {
            event.preventDefault();
            props.onCancel();
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
          <h2 id="wallet-review-title">{title}</h2>
        </header>
        <div className="settings-dialog__body">
          <p>{note}</p>
          <ul>
            {props.review.intent?.details.map((detail, index) => (
              <li key={`${index}-${detail}`}>{detail}</li>
            ))}
          </ul>
          {!waiting && (
            <footer className="wallet-review-actions">
              <button
                type="button"
                data-cancel-wallet-review
                onClick={props.onCancel}
              >
                {props.copy.reviewCancel}
              </button>
              <button
                type="button"
                className="primary-action"
                data-confirm-wallet-review
                disabled={unavailable}
                onClick={props.onConfirm}
              >
                {props.copy.reviewConfirm}
              </button>
            </footer>
          )}
        </div>
      </section>
    </>
  );
}
