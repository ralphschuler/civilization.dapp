"use client";

export type GameFooterProps = {
  authority: string;
  onReset?: () => void;
  resetLabel: string;
  runtimeMode: "demo" | "world";
  status: string;
};

/** The controller supplies all live footer values; this island owns only reset. */
export function GameFooter({
  authority,
  onReset,
  resetLabel,
  runtimeMode,
  status,
}: GameFooterProps) {
  return (
    <footer className="game-footer">
      <span>
        <i aria-hidden="true" /> {authority}
      </span>
      <span>{status}</span>
      {runtimeMode === "demo" ? (
        <button onClick={onReset} type="button">
          {resetLabel}
        </button>
      ) : null}
    </footer>
  );
}
