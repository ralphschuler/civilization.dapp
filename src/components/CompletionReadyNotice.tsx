"use client";

export type CompletionReadyNoticeProps = {
  copy: {
    completionReady: (building: string) => string;
    completionReadyAction: string;
    completionReadyTitle: string;
  };
  notices: Array<{ buildingId: string }>;
  buildingNames: Record<string, string | undefined>;
  onOpenCompletion: () => void;
};

export function CompletionReadyNotice(props: CompletionReadyNoticeProps) {
  if (!props.notices.length) return null;
  const building =
    props.buildingNames[props.notices[0].buildingId] ||
    props.notices[0].buildingId;
  const additional = props.notices.length - 1;
  return (
    <section
      className="completion-ready-notice"
      role="status"
      aria-live="polite"
    >
      <div>
        <b>{props.copy.completionReadyTitle}</b>
        <span>
          {props.copy.completionReady(building)}
          {additional ? ` +${additional}` : ""}
        </span>
      </div>
      <button type="button" onClick={props.onOpenCompletion}>
        {props.copy.completionReadyAction}
      </button>
    </section>
  );
}
