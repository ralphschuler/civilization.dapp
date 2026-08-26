"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clock } from "../game-ui/helpers.js";
import { civilizationMessages } from "../lib/civilization-locale";
import {
  appendStoredRaidReports,
  mapStoredRaidHistory,
  raidHistoryFailureStatus,
  type RaidHistoryPresentationState,
} from "./raid-history";

type Troop = { label: string };
type ResourceDefinition = { short?: string };
type RaidDraft = {
  army: Record<string, number>;
  targetAddress: string;
  targetId: string;
};
type RaidResult = {
  ok: boolean;
  target: string;
  attack: number;
  defense: number;
  stolen: Record<string, number>;
  casualties: Record<string, number>;
};
type RaidTarget = {
  id: string;
  name: string;
  defense: number;
  unclaimed: Record<string, number>;
};
type RaidState = {
  troops: Record<string, number>;
  targets?: RaidTarget[];
  lastRaid?: RaidResult | null;
  pendingRaid?: {
    targetId: string;
    arrivesAt: number;
  } | null;
};
type Opponent = { username: string; address: string } | null;

export type RaidPanelProps = {
  state: RaidState;
  runtimeMode: "demo" | "world";
  busy: boolean;
  troops: Record<string, Troop>;
  resourceDefs: Record<string, ResourceDefinition>;
  format: (value: number) => string;
  remainingTime: (until: number) => number;
  raidDraft: RaidDraft;
  selectedOpponent: Opponent;
  copy?: ReturnType<typeof civilizationMessages>;
  onDraftChange: (changes: Partial<RaidDraft>) => void;
  onPickOpponent: () => void;
  onSendRaid: (targetId: string, army: Record<string, number>) => void;
  onResolveRaid: () => void;
  /** Injectable only for controlled presentation fixtures; production uses fetch. */
  requestRaidHistory?: typeof fetch;
  /**
   * Presentation-only, sanitized history state for static UI fixtures. This
   * bypasses the controller and must never contain API events or raw cursors.
   */
  raidHistoryPresentation?: RaidHistoryPresentationState;
};

function RaidReport({ props }: { props: RaidPanelProps }) {
  const {
    copy = civilizationMessages(),
    state,
    troops,
    resourceDefs,
    format,
  } = props;
  if (!state.lastRaid) {
    const target =
      props.runtimeMode === "world"
        ? copy.worldRaidTarget
        : copy.demoRaidTarget;
    return (
      <div className="raid-result">
        <span>{copy.lastReport}</span>
        <b>{copy.noTroopsSent}</b>
        <small>{copy.chooseRaidTarget(target)}</small>
      </div>
    );
  }

  const result = state.lastRaid;
  const losses =
    Object.entries(result.casualties)
      .filter(([, amount]) => amount)
      .map(([id, amount]) => `${amount} ${troops[id]?.label ?? id}`)
      .join(", ") || copy.noLosses;
  const loot = Object.entries(result.stolen)
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => `${format(amount)} ${resourceDefs[id]?.short ?? id}`)
    .join(" ");
  const victory = result.ok;

  return (
    <div className={`raid-result ${victory ? "success" : "failure"}`}>
      <span>LETZTER BERICHT · {victory ? copy.victory : copy.retreat}</span>
      <b>
        {result.target}:{" "}
        {copy.attackAgainst(String(result.attack), String(result.defense))}
      </b>
      <small>{copy.raidSummary(loot || copy.noLoot, losses)}</small>
    </div>
  );
}

export function RaidHistoryView({
  copy,
  resourceDefs,
  history,
  onLoadMore,
  onRetry,
}: {
  copy: ReturnType<typeof civilizationMessages>;
  resourceDefs: Record<string, ResourceDefinition>;
  history: RaidHistoryPresentationState;
  onLoadMore?: () => void;
  onRetry?: () => void;
}) {
  const message =
    history.status === "loading"
      ? copy.raidHistoryLoading
      : history.status === "empty"
        ? copy.raidHistoryEmpty
        : history.status === "session"
          ? copy.raidHistorySessionExpired
          : history.status === "error"
            ? copy.raidHistoryUnavailable
            : "";
  return (
    <section
      className="raid-history"
      aria-labelledby="raid-history-title"
      data-raid-history-status={history.status}
      data-raid-history-updated={history.updated || undefined}
    >
      <div className="raid-history-heading">
        <span id="raid-history-title">{copy.raidHistoryTitle}</span>
        <small>{copy.raidHistoryCoverage}</small>
      </div>
      <p className="raid-history-status" role="status" aria-live="polite">
        {history.updated ? copy.raidHistoryUpdated : message}
      </p>
      {history.reports.map((report) => {
        const won =
          report.role === "attacker" ? report.attackerWon : !report.attackerWon;
        const resources = Object.entries(report.resources)
          .filter(([, amount]) => amount !== "0")
          .map(
            ([resource, amount]) =>
              `${amount} ${resourceDefs[resource]?.short ?? resource}`,
          )
          .join(" · ");
        return (
          <article
            className={`raid-history-report ${won ? "success" : "failure"}`}
            key={report.dedupeId}
          >
            <span>{copy.raidHistoryFinalized}</span>
            <b>{won ? copy.victory : copy.retreat}</b>
            <small>
              {report.role === "attacker"
                ? copy.raidHistoryYouAttacked
                : copy.raidHistoryYouDefended}{" "}
              {copy.raidHistoryAgainst(report.counterpartyLabel)}
            </small>
            {resources ? (
              <small>{copy.raidHistoryResources(resources)}</small>
            ) : null}
          </article>
        );
      })}
      {history.cursor === "more" ? (
        <button
          type="button"
          className="raid-history-more"
          disabled={history.status === "loading"}
          onClick={onLoadMore}
        >
          {copy.raidHistoryLoadMore}
        </button>
      ) : null}
      {history.status === "error" ? (
        <button type="button" className="raid-history-retry" onClick={onRetry}>
          {copy.raidHistoryRetry}
        </button>
      ) : null}
    </section>
  );
}

type RaidHistoryControllerState = RaidHistoryPresentationState & {
  nextCursor: string | null;
};

function RaidHistoryController({ props }: { props: RaidPanelProps }) {
  const copy = props.copy || civilizationMessages();
  const [history, setHistory] = useState<RaidHistoryControllerState>({
    reports: [],
    nextCursor: null,
    cursor: null,
    status: "idle",
    updated: false,
  });
  const requesting = useRef(false);
  const loadRef = useRef<(cursor: string | null) => Promise<void>>(
    async () => undefined,
  );

  const load = useCallback(
    async (cursor: string | null) => {
      if (requesting.current) return;
      requesting.current = true;
      setHistory((current) => ({
        ...current,
        status: "loading",
        ...(cursor ? {} : { reports: [], nextCursor: null, cursor: null }),
      }));
      try {
        const query = new URLSearchParams({ limit: "20" });
        if (cursor) query.set("cursor", cursor);
        const request = props.requestRaidHistory ?? fetch;
        const response = await request(`/api/history/raids?${query}`, {
          credentials: "same-origin",
        });
        if (response.status === 409 && cursor) {
          requesting.current = false;
          setHistory({
            reports: [],
            nextCursor: null,
            cursor: null,
            status: "loading",
            updated: true,
          });
          await loadRef.current(null);
          return;
        }
        if (response.status === 401) {
          // An expired session must not leave a stale report or cursor actionable.
          setHistory({
            reports: [],
            nextCursor: null,
            cursor: null,
            status: raidHistoryFailureStatus(response.status),
            updated: false,
          });
          return;
        }
        if (!response.ok) {
          setHistory({
            reports: [],
            nextCursor: null,
            cursor: null,
            status: raidHistoryFailureStatus(response.status),
            updated: false,
          });
          return;
        }
        const page = mapStoredRaidHistory(await response.json());
        if (!page) {
          setHistory({
            reports: [],
            nextCursor: null,
            cursor: null,
            status: "error",
            updated: false,
          });
          return;
        }
        setHistory((current) => {
          const reports = cursor
            ? appendStoredRaidReports(current.reports, page.reports)
            : page.reports;
          return {
            reports,
            nextCursor: page.nextCursor,
            cursor: page.nextCursor ? "more" : null,
            status: reports.length ? "ready" : "empty",
            updated: current.updated,
          };
        });
      } catch {
        setHistory({
          reports: [],
          nextCursor: null,
          cursor: null,
          status: "error",
          updated: false,
        });
      } finally {
        requesting.current = false;
      }
    },
    [props.requestRaidHistory],
  );

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    const request = window.setTimeout(() => void loadRef.current(null), 0);
    return () => window.clearTimeout(request);
  }, [load]);

  return (
    <RaidHistoryView
      copy={copy}
      resourceDefs={props.resourceDefs}
      history={history}
      onLoadMore={
        history.nextCursor ? () => void load(history.nextCursor) : undefined
      }
      onRetry={history.status === "error" ? () => void load(null) : undefined}
    />
  );
}

function RaidHistory({ props }: { props: RaidPanelProps }) {
  const copy = props.copy || civilizationMessages();
  return props.raidHistoryPresentation ? (
    <RaidHistoryView
      copy={copy}
      resourceDefs={props.resourceDefs}
      history={props.raidHistoryPresentation}
    />
  ) : (
    <RaidHistoryController props={props} />
  );
}

function ArmyInputs({ props }: { props: RaidPanelProps }) {
  const { copy = civilizationMessages() } = props;
  return (
    <div className="army-inputs">
      {Object.entries(props.troops).map(([id, troop]) => (
        <label key={id}>
          <span>
            {troop.label}
            <b>{copy.troopsReady(String(props.state.troops[id] ?? 0))}</b>
          </span>
          <input
            id={`raid-${id}`}
            type="number"
            min="0"
            max={props.state.troops[id] ?? 0}
            value={props.raidDraft.army[id] ?? 0}
            inputMode="numeric"
            onChange={(event) =>
              props.onDraftChange({
                army: {
                  ...props.raidDraft.army,
                  [id]: Number(event.currentTarget.value),
                },
              })
            }
          />
        </label>
      ))}
    </div>
  );
}

function PendingRaid({ props }: { props: RaidPanelProps }) {
  const { copy = civilizationMessages(), state } = props;
  const pending = state.pendingRaid!;
  const seconds = props.remainingTime(pending.arrivesAt);
  const demoTarget = state.targets?.find(
    (target) => target.id === pending.targetId,
  );
  const target =
    props.runtimeMode === "demo"
      ? demoTarget?.name || copy.targetLocation
      : `${pending.targetId.slice(0, 6)}…${pending.targetId.slice(-4)}`;
  const ready = seconds === 0;
  return (
    <div className="inspector raid-inspector">
      <div className="inspector-title">
        <p>{copy.raidTitle}</p>
        <h2>{copy.marchEnRoute}</h2>
        <span>{copy.noFurtherMarch}</span>
      </div>
      <div className="march-status">
        <span>{copy.marchTo(target.toUpperCase())}</span>
        <b data-raid-countdown>{clock(seconds)}</b>
        <small>
          {props.runtimeMode === "world"
            ? copy.resolveWorldRaid
            : copy.resolveDemoRaid}
        </small>
      </div>
      {props.runtimeMode === "world" ? (
        <button
          type="button"
          className="primary-action"
          id="resolve-raid"
          disabled={!ready || props.busy}
          onClick={props.onResolveRaid}
        >
          {ready ? copy.resolveBattle : copy.constructionRunning}
        </button>
      ) : (
        <button type="button" className="primary-action" disabled>
          {copy.constructionRunning}
        </button>
      )}
      <RaidReport props={props} />
      {props.runtimeMode === "world" ? <RaidHistory props={props} /> : null}
    </div>
  );
}

export function RaidPanel(props: RaidPanelProps) {
  const copy = props.copy || civilizationMessages();
  if (props.state.pendingRaid) return <PendingRaid props={props} />;

  const targets = props.state.targets || [];
  const selectedTarget = props.raidDraft.targetId || targets[0]?.id || "";
  const unavailable = props.runtimeMode === "demo" && targets.length === 0;
  const targetId =
    props.runtimeMode === "world"
      ? props.raidDraft.targetAddress.trim()
      : selectedTarget;

  return (
    <div className="inspector raid-inspector">
      <div className="inspector-title">
        <p>{copy.raidTitle}</p>
        <h2>{copy.planMarch}</h2>
        <span>
          {props.runtimeMode === "world"
            ? copy.worldRaidDescription
            : copy.demoRaidDescription}
        </span>
      </div>
      {props.runtimeMode === "world" ? (
        <>
          {props.selectedOpponent ? (
            <div className="requirement-box">
              <span>{copy.selectedContact}</span>
              <b>{props.selectedOpponent.username}</b>
              <small>{props.selectedOpponent.address}</small>
            </div>
          ) : null}
          <button
            type="button"
            className="primary-action"
            id="pick-raid-contact"
            disabled={props.busy}
            onClick={props.onPickOpponent}
          >
            {copy.chooseWorldContact}
          </button>
          <label className="target-select">
            {copy.orWalletAddress}
            <input
              id="raid-target-address"
              type="text"
              value={props.raidDraft.targetAddress}
              placeholder="0x…"
              autoComplete="off"
              onChange={(event) =>
                props.onDraftChange({
                  targetAddress: event.currentTarget.value,
                })
              }
            />
          </label>
        </>
      ) : (
        <label className="target-select">
          {copy.targetLocation}
          <select
            id="raid-target"
            value={selectedTarget}
            disabled={unavailable}
            onChange={(event) =>
              props.onDraftChange({ targetId: event.currentTarget.value })
            }
          >
            {targets.length ? (
              targets.map((target) => {
                const stock = Object.values(target.unclaimed).reduce(
                  (total, amount) => total + amount,
                  0,
                );
                return (
                  <option key={target.id} value={target.id}>
                    {target.name} ·{" "}
                    {copy.targetOption(
                      String(target.defense),
                      props.format(stock),
                    )}
                  </option>
                );
              })
            ) : (
              <option>{copy.noDemoVillages}</option>
            )}
          </select>
        </label>
      )}
      <ArmyInputs props={props} />
      <button
        type="button"
        className="primary-action"
        id="send-raid"
        disabled={props.busy || unavailable}
        onClick={() => props.onSendRaid(targetId, props.raidDraft.army)}
      >
        {copy.startMarch}
      </button>
      <RaidReport props={props} />
      {props.runtimeMode === "world" ? <RaidHistory props={props} /> : null}
    </div>
  );
}
