import type { ReactNode } from "react";

export type NextTaskCardAction = {
  kind: string;
  label: string;
  onClick: () => void;
  disabled: boolean;
  buildingId?: string;
  id?: string;
};

export type NextTaskCardProps = {
  title: string;
  kind: string;
  reason: ReactNode;
  relevantFacts?: ReactNode;
  action?: NextTaskCardAction;
  detailsLabel: string;
  children: ReactNode;
};

/** The single, mobile-first decision point for the selected building. */
export function NextTaskCard({
  title,
  kind,
  reason,
  relevantFacts,
  action,
  detailsLabel,
  children,
}: NextTaskCardProps) {
  return (
    <section
      className="next-action next-task-card"
      aria-labelledby="next-action-title"
      data-next-action={kind}
    >
      <span id="next-action-title">{title}</span>
      <p>{reason}</p>
      {relevantFacts ? (
        <div className="next-task-facts">{relevantFacts}</div>
      ) : null}
      {action ? (
        <button
          type="button"
          className="primary-action build-primary-action"
          id={action.id}
          data-building={action.buildingId}
          data-next-action-button={action.kind}
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
      <details className="build-secondary next-task-details">
        <summary>{detailsLabel}</summary>
        <div className="next-task-details-content">{children}</div>
      </details>
    </section>
  );
}
