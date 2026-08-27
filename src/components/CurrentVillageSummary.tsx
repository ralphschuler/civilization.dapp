"use client";

import type { civilizationMessages } from "../lib/civilization-locale";

type Copy = ReturnType<typeof civilizationMessages>;
export type CurrentVillageSummaryProps = {
  copy: Copy;
  buildingNames: Record<string, string | undefined>;
  summary: {
    ready: { buildingId: string; slot: number };
  };
  onCollect: () => void;
  onOpenCompletion: (slot: number) => void;
};

/** A non-modal routing surface. All state and callbacks are supplied by the shell. */
export function CurrentVillageSummary(props: CurrentVillageSummaryProps) {
  const { summary } = props;
  const actions = [
    {
      key: "complete",
      label: props.copy.villageNowComplete(
        props.buildingNames[summary.ready.buildingId] ||
          summary.ready.buildingId,
      ),
      onClick: () => props.onOpenCompletion(summary.ready.slot),
    },
    {
      key: "collect",
      label: props.copy.villageNowCollect,
      onClick: props.onCollect,
    },
  ] satisfies Array<{
    key: string;
    label: string;
    onClick: () => void;
  }>;
  return (
    <aside
      className="current-village-summary"
      aria-labelledby="current-village-title"
      data-current-village-summary
    >
      <div className="current-village-heading">
        <p id="current-village-title">{props.copy.villageNowTitle}</p>
        <span>{props.copy.villageNowReadyAndCollectible}</span>
      </div>
      <div className="current-village-actions">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            data-current-village-action={action.key}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
