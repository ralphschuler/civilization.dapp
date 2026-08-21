"use client";

import { clock } from "../game-ui/helpers.js";
import { civilizationMessages } from "../lib/civilization-locale";

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
    </div>
  );
}
