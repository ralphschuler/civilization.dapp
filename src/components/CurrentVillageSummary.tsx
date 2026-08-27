"use client";

import type { civilizationMessages } from "../lib/civilization-locale";

type Copy = ReturnType<typeof civilizationMessages>;
export type CurrentVillageSummaryProps = {
  copy: Copy;
  buildingNames: Record<string, string | undefined>;
  summary: {
    ready: { buildingId: string; slot: number } | null;
    collectible: boolean;
    showBuild: boolean;
  };
  onCollect: () => void;
  onOpenBuild: () => void;
  onOpenCompletion: (slot: number) => void;
};

/** A non-modal routing surface. All state and callbacks are supplied by the shell. */
export function CurrentVillageSummary(props: CurrentVillageSummaryProps) {
  const { summary } = props;
  const status =
    summary.ready && summary.collectible
      ? props.copy.villageNowReadyAndCollectible
      : summary.ready
        ? props.copy.villageNowReady
        : summary.collectible
          ? props.copy.villageNowCollectible
          : props.copy.villageNowBuildStatus;
  const actions = [
    summary.ready
      ? {
          key: "complete",
          label: props.copy.villageNowComplete(
            props.buildingNames[summary.ready.buildingId] ||
              summary.ready.buildingId,
          ),
          onClick: () => props.onOpenCompletion(summary.ready!.slot),
        }
      : null,
    summary.collectible
      ? {
          key: "collect",
          label: props.copy.villageNowCollect,
          onClick: props.onCollect,
        }
      : null,
    summary.showBuild
      ? {
          key: "build",
          label: props.copy.villageNowBuild,
          onClick: props.onOpenBuild,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    onClick: () => void;
  }>;

  if (!actions.length) return null;
  return (
    <aside
      className="current-village-summary"
      aria-labelledby="current-village-title"
      data-current-village-summary
    >
      <div className="current-village-heading">
        <p id="current-village-title">{props.copy.villageNowTitle}</p>
        <span>{status}</span>
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
