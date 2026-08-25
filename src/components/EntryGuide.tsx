"use client";

import type { civilizationMessages } from "../lib/civilization-locale";

type Copy = ReturnType<typeof civilizationMessages>;
export type EntryGuideRecommendation = {
  kind: string;
  target: "none" | "collection" | "completion" | "building" | "build-panel";
  buildingId?: string;
};

export function EntryGuide({
  copy,
  recommendation,
  onDismiss,
  onRoute,
}: {
  copy: Copy;
  recommendation: EntryGuideRecommendation;
  onDismiss: () => void;
  onRoute: (recommendation: EntryGuideRecommendation) => void;
}) {
  const detail =
    recommendation.kind === "collect"
      ? copy.entryGuideCollect
      : recommendation.kind === "complete"
        ? copy.entryGuideComplete
        : recommendation.kind === "requirements"
          ? copy.entryGuideRequirements
          : recommendation.kind === "capacity"
            ? copy.entryGuideCapacity
            : recommendation.kind === "resources"
              ? copy.entryGuideResources
              : recommendation.kind === "max-level"
                ? copy.entryGuideMaxLevel
                : recommendation.kind === "upgrade"
                  ? copy.entryGuideUpgrade
                  : copy.entryGuideUnavailable;
  const canRoute = recommendation.target !== "none";
  return (
    <aside
      className="entry-guide"
      aria-labelledby="entry-guide-title"
      data-entry-guide
    >
      <div>
        <p id="entry-guide-title">{copy.entryGuideTitle}</p>
        <span>{detail}</span>
      </div>
      <div className="entry-guide-actions">
        {canRoute ? (
          <button
            className="entry-guide-primary"
            onClick={() => onRoute(recommendation)}
            type="button"
          >
            {copy.entryGuideShow}
          </button>
        ) : null}
        <button
          aria-label={copy.entryGuideDismiss}
          className="entry-guide-dismiss"
          onClick={onDismiss}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </aside>
  );
}
