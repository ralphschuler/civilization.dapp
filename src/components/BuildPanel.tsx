"use client";

import { BUILDING_ASSETS, MAX_BUILDING_LEVEL } from "../game-ui/constants.js";
import { clock } from "../game-ui/helpers.js";
import { boostConstructionStatus } from "../game-ui/boost-status.js";
import { constructionBoostEligibility } from "../world-game/boost-eligibility.js";
import { civilizationMessages } from "../lib/civilization-locale";
import { marketPrefills } from "../world-game/market-intent.js";

type ResourceDefinition = { color?: string; short?: string; label: string };
type Building = {
  label: string;
  detail?: string;
  produces?: Record<string, number>;
};
type Construction = {
  pending?: boolean;
  buildingId: string;
  completesAt: number;
  slot?: number;
};
type GameState = {
  resources: Record<string, number>;
  buildings: Record<string, number>;
  construction?: Construction;
  constructions?: Construction[];
  constructionOccupied?: number;
  constructionCapacity?: number;
  chainTimestamp?: number;
  prestigeCount?: number;
};
type UpgradeImpact = {
  available: boolean;
  production: Array<{
    resource: string;
    before: number;
    after: number;
    delta: number;
  }>;
  capacity?: ImpactValue;
  constructionSlots?: ImpactValue;
  defense?: ImpactValue;
  unlocks: { buildings: string[]; troops: string[] };
};
type ImpactValue = { before: number; after: number; delta: number };
type PlanStep = {
  key: string;
  id: string;
  level: number;
  active?: boolean;
  completesAt: number;
  slot: number;
  duration: number;
  deficits?: Record<string, number>;
};
type BuildingPlan = {
  ok: boolean;
  reason: string;
  steps: PlanStep[];
  next: PlanStep | null;
  durationKeys?: string[];
};
export type BuildPanelProps = {
  state: GameState;
  runtimeMode: "demo" | "world";
  busy: boolean;
  selectedBuilding: string;
  buildings: Record<string, Building>;
  resourceDefs: Record<string, ResourceDefinition>;
  format: (value: number) => string;
  remainingTime: (until: number) => number;
  buildDuration: (id: string, level: number) => number | false | undefined;
  requirements: (id: string) => Array<{ id: string; level: number }>;
  buildingCost: (id: string) => Record<string, number>;
  nextBuildingProduction: (id: string) => Record<string, number>;
  upgradeImpact?: (id: string) => UpgradeImpact | null;
  buildingPlan?: () => BuildingPlan;
  requestPlanDurations?: (plan: BuildingPlan) => void;
  assetResult?: { failed: string[] };
  copy?: ReturnType<typeof civilizationMessages>;
  onUpgrade: (id: string) => void;
  onCompleteUpgrade: (slot?: number) => void;
  onBoost: (slot?: number) => void;
  onPrestige: () => void;
  onOpenMarket: (intent: {
    resource: string;
    amount: number;
    source: string;
    panel: "build";
  }) => void;
};

function CostLine({
  cost,
  props,
}: {
  cost: Record<string, number>;
  props: BuildPanelProps;
}) {
  return (
    <>
      {Object.entries(props.resourceDefs)
        .filter(([id]) => cost[id] > 0)
        .map(([id, definition]) => (
          <span key={id} className={`cost ${definition.color}`}>
            {props.format(cost[id])} {definition.short}
          </span>
        ))}
    </>
  );
}

function Impact({ props }: { props: BuildPanelProps }) {
  const {
    copy = civilizationMessages(),
    runtimeMode,
    selectedBuilding,
  } = props;
  const impact = props.upgradeImpact?.(selectedBuilding);
  if (runtimeMode !== "world" || !impact || !impact.available) {
    const text =
      runtimeMode !== "world"
        ? copy.upgradeImpactDemoUnavailable
        : !impact
          ? copy.upgradeImpactUnavailable
          : copy.upgradeImpactMaxLevel;
    return (
      <section
        className="upgrade-impact upgrade-impact-unavailable"
        aria-label={copy.upgradeImpactTitle}
      >
        <h3>{copy.upgradeImpactTitle}</h3>
        <p>{text}</p>
      </section>
    );
  }
  const rows: Array<{
    label: string;
    before?: number;
    after?: number;
    delta?: number;
    suffix?: string;
  }> = [
    ...impact.production.map(({ resource, before, after, delta }) => ({
      label: copy.upgradeImpactProduction(props.resourceDefs[resource].label),
      before,
      after,
      delta,
      suffix: `/${copy.perDay}`,
    })),
    ...(impact.capacity
      ? [{ label: copy.upgradeImpactCapacity, ...impact.capacity }]
      : []),
    ...(impact.constructionSlots
      ? [{ label: copy.upgradeImpactSlots, ...impact.constructionSlots }]
      : []),
    ...(impact.defense
      ? [{ label: copy.upgradeImpactDefense, ...impact.defense }]
      : []),
  ];
  const unlocks = [
    ...impact.unlocks.buildings.map((id: string) => props.buildings[id]?.label),
    ...impact.unlocks.troops.map(
      (id: string) => copy.troopNames[id as keyof typeof copy.troopNames],
    ),
  ].filter(Boolean);
  const note =
    selectedBuilding === "warehouse"
      ? copy.upgradeImpactCapacityRule
      : selectedBuilding === "workshop"
        ? copy.upgradeImpactSlotsRule
        : selectedBuilding === "townhall"
          ? copy.upgradeImpactDefenseRule
          : copy.upgradeImpactContractGated;
  return (
    <section className="upgrade-impact" aria-labelledby="upgrade-impact-title">
      <h3 id="upgrade-impact-title">{copy.upgradeImpactTitle}</h3>
      {rows.length ? (
        <ul>
          {rows.map((row) => (
            <li key={row.label}>
              <span>{row.label}</span>
              <b>
                {props.format(row.before!)} → {props.format(row.after!)}
              </b>
              <em>
                {row.delta! > 0 ? "+" : ""}
                {props.format(row.delta!)}
                {row.suffix}
              </em>
            </li>
          ))}
          {unlocks.length ? (
            <li className="upgrade-impact-unlocks">
              <span>{copy.upgradeImpactUnlocks}</span>
              <b>{unlocks.join(" · ")}</b>
            </li>
          ) : null}
        </ul>
      ) : (
        <p>{copy.upgradeImpactNoDirectEffect}</p>
      )}
      <p className="upgrade-impact-note">{note}</p>
    </section>
  );
}

function Plan({ props }: { props: BuildPanelProps }) {
  const { copy = civilizationMessages(), buildingPlan, runtimeMode } = props;
  if (runtimeMode !== "world" || !buildingPlan) return null;
  const plan = buildingPlan();
  props.requestPlanDurations?.(plan);
  if (!plan.ok)
    return (
      <section
        className="dependency-plan requirement-box"
        aria-labelledby="dependency-plan-title"
        role="status"
      >
        <h3 id="dependency-plan-title">{copy.dependencyPlanTitle}</h3>
        <p>{copy.dependencyPlanBlocked(plan.reason)}</p>
      </section>
    );
  return (
    <section
      className="dependency-plan"
      aria-labelledby="dependency-plan-title"
      aria-live="polite"
    >
      <h3 id="dependency-plan-title">{copy.dependencyPlanTitle}</h3>
      <p>
        {copy.dependencyPlanTarget(
          props.buildings[props.selectedBuilding].label,
          props.state.buildings[props.selectedBuilding] + 1,
        )}
      </p>
      <ol>
        {plan.steps.map((step, index) => {
          const status = step.active
            ? copy.dependencyPlanRunning
            : step === plan.next
              ? copy.dependencyPlanNext
              : copy.dependencyPlanLater;
          const time = step.active
            ? copy.dependencyPlanCompletes(
                clock(
                  Math.max(
                    0,
                    Math.ceil(
                      (step.completesAt - props.state.chainTimestamp!) / 1000,
                    ),
                  ),
                ),
              )
            : copy.dependencyPlanSlot(step.slot + 1, clock(step.duration));
          const deficits =
            step.deficits && Object.keys(step.deficits).length
              ? step.deficits
              : null;
          const deficit = deficits
            ? Object.entries(deficits)
                .map(
                  ([id, value]) =>
                    `${props.format(value as number)} ${props.resourceDefs[id].short}`,
                )
                .join(" ")
            : null;
          return (
            <li key={step.key} data-plan-step={step.key}>
              <span>
                {index + 1}. {props.buildings[step.id]?.label || step.id}{" "}
                {step.level}
              </span>
              <b>{status}</b>
              <small>{time}</small>
              {deficit ? (
                <small>
                  {copy.dependencyPlanDeficit(deficit)}
                  <span className="market-prefill-actions">
                    {marketPrefills(deficits).map(({ resource, amount }) => (
                      <button
                        key={resource}
                        type="button"
                        className="text-action"
                        onClick={() =>
                          props.onOpenMarket({
                            resource,
                            amount,
                            source: `${props.buildings[step.id]?.label || step.id} ${step.level}`,
                            panel: "build",
                          })
                        }
                      >
                        {copy.marketAcquire(
                          props.format(amount),
                          props.resourceDefs[resource].label,
                        )}
                      </button>
                    ))}
                    {!marketPrefills(deficits).length ? (
                      <span>{copy.marketGoldUnavailable}</span>
                    ) : null}
                  </span>
                </small>
              ) : null}
            </li>
          );
        })}
      </ol>
      {plan.next ? (
        <button
          className="primary-action"
          disabled={props.busy}
          onClick={() => props.onUpgrade(plan.next!.id)}
        >
          {copy.dependencyPlanStart(
            props.buildings[plan.next!.id].label,
            plan.next!.level,
          )}
        </button>
      ) : null}
    </section>
  );
}

export function BuildPanel(props: BuildPanelProps) {
  const copy = props.copy || civilizationMessages();
  const building = props.buildings[props.selectedBuilding];
  const level = props.state.buildings[props.selectedBuilding];
  const requirements = props.requirements(props.selectedBuilding);
  const cost = props.buildingCost(props.selectedBuilding);
  const jobs = props.state.constructions?.length
    ? props.state.constructions
    : props.state.construction?.pending
      ? [props.state.construction]
      : [];
  const atCapacity =
    jobs.length &&
    Number.isInteger(props.state.constructionOccupied) &&
    Number.isInteger(props.state.constructionCapacity) &&
    props.state.constructionOccupied! >= props.state.constructionCapacity!;
  const produces = building.produces
    ? Object.keys(building.produces)
        .map(
          (id) =>
            `+${props.format(props.nextBuildingProduction(props.selectedBuilding)[id])}/${props.runtimeMode === "world" ? copy.perDay : copy.perSecond} ${props.resourceDefs[id].label}`,
        )
        .join(" · ")
    : "";
  const duration = props.buildDuration(props.selectedBuilding, level + 1);
  const affordable = Object.keys(props.resourceDefs).every(
    (id) => props.state.resources[id] >= cost[id],
  );
  const upgradeDeficits = Object.fromEntries(
    Object.entries(props.resourceDefs)
      .map(([id]) => [
        id,
        Math.max(0, (cost[id] ?? 0) - (props.state.resources[id] ?? 0)),
      ])
      .filter(([, amount]) => amount),
  );
  const failed = props.assetResult?.failed.includes(
    BUILDING_ASSETS[props.selectedBuilding],
  );
  return (
    <div className="inspector build-inspector">
      <div
        className={`inspector-art ${failed ? "has-asset-error" : ""}`}
        data-asset-container
      >
        {/* The game owns asset fallback and uses its configured asset base. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BUILDING_ASSETS[props.selectedBuilding]}
          alt=""
          data-asset-fallback
        />
        <i className="asset-building-fallback" role="status">
          {copy.buildingAssetUnavailable(building.label)}
        </i>
      </div>
      <div className="inspector-title">
        <p>{copy.buildDetail}</p>
        <h2>{building.label}</h2>
        <span>
          {copy.level} {level} → {level + 1}
        </span>
      </div>
      <p className="inspector-copy">
        {building.detail}
        {produces ? copy.nextProduction(produces) : ""}
      </p>
      <div className="inspector-divider" />
      {jobs.length ? (
        <section
          className="construction-jobs"
          aria-label={copy.buildProgress}
          aria-live="polite"
        >
          {jobs.map((job, index) => {
            const seconds = props.remainingTime(job.completesAt);
            const boost = constructionBoostEligibility({
              construction: job,
              now: undefined,
              remainingSeconds: seconds,
              busy: props.busy,
            });
            const slot = Number.isInteger(job.slot) ? job.slot : undefined;
            const legacy = slot === 0 || (slot === undefined && index === 0);
            const statusId = legacy
              ? "boost-construction-status"
              : `boost-construction-status-${index}`;
            return (
              <div
                key={slot ?? index}
                className="requirement-box"
                data-construction-job
                data-construction-slot={slot}
              >
                <span>
                  {copy.buildProgress} {index + 1}/{jobs.length} ·{" "}
                  {props.buildings[job.buildingId]?.label || copy.buildDetail}
                </span>
                <b data-construction-countdown>
                  {seconds ? clock(seconds) : copy.complete}
                </b>
                <small>{copy.constructionNote}</small>
                <button
                  className="primary-action"
                  data-complete-upgrade
                  data-construction-slot={slot}
                  disabled={Boolean(seconds || props.busy)}
                  onClick={() => props.onCompleteUpgrade(slot)}
                >
                  {seconds ? copy.constructionRunning : copy.completeUpgrade}
                </button>
                <button
                  className="primary-action"
                  id={legacy ? "boost-construction" : undefined}
                  data-boost-construction
                  data-construction-slot={slot}
                  aria-describedby={statusId}
                  disabled={!boost.eligible}
                  onClick={() => props.onBoost(slot)}
                >
                  {copy.boostConstruction}
                </button>
                <small id={statusId} data-boost-construction-status>
                  {boostConstructionStatus(boost.reason, copy)}
                </small>
              </div>
            );
          })}
        </section>
      ) : null}
      {level >= MAX_BUILDING_LEVEL ? (
        <>
          <div className="requirement-box">
            <span>{copy.maxLevel}</span>
            <b>{copy.fullyUpgraded(building.label)}</b>
            <small>
              {props.selectedBuilding === "townhall"
                ? copy.prestigeDetail
                : copy.noFurtherUpgrade}
            </small>
          </div>
          {props.runtimeMode === "world" &&
          props.selectedBuilding === "townhall" ? (
            <button
              className="primary-action build-primary-action"
              id="prestige"
              disabled={props.busy}
              onClick={props.onPrestige}
            >
              {copy.prestigeStart(props.state.prestigeCount! + 1)}
            </button>
          ) : null}
        </>
      ) : requirements.length ? (
        <>
          <div className="requirement-box">
            <span>{copy.upgradeLocked}</span>
            <b>
              {requirements
                .map(
                  ({ id, level: required }) =>
                    `${props.buildings[id].label} ${required}`,
                )
                .join(" · ")}
            </b>
            <small>{copy.unlockUpgrade}</small>
          </div>
          <button
            className="primary-action build-primary-action"
            data-building={props.selectedBuilding}
            disabled
          >
            {copy.meetRequirements}
          </button>
        </>
      ) : (
        <>
          <div className="upgrade-cost">
            <span>{copy.upgradeCost(level + 1)}</span>
            <div>
              <CostLine cost={cost} props={props} />
            </div>
            {props.runtimeMode === "world" ? (
              <small className="build-duration">
                {duration == null
                  ? copy.buildDurationLoading
                  : duration === false
                    ? copy.buildDurationUnavailable
                    : copy.buildDuration(clock(duration))}
              </small>
            ) : null}
          </div>
          <button
            className="primary-action build-primary-action"
            data-building={props.selectedBuilding}
            disabled={!affordable || props.busy || Boolean(atCapacity)}
            onClick={() => props.onUpgrade(props.selectedBuilding)}
          >
            {props.runtimeMode === "world"
              ? copy.startWorldUpgrade(level + 1)
              : copy.startDemoUpgrade(level + 1)}
          </button>
          {atCapacity ? (
            <small className="construction-capacity-blocker" role="status">
              {copy.constructionSlotsOccupied(
                props.state.constructionOccupied!,
                props.state.constructionCapacity!,
              )}
            </small>
          ) : null}
        </>
      )}
      <details className="build-secondary build-impact-details">
        <summary>{copy.upgradeImpactTitle}</summary>
        <Impact props={props} />
      </details>
      {props.runtimeMode === "world" && props.buildingPlan ? (
        <details className="build-secondary build-plan-details">
          <summary>{copy.dependencyPlanTitle}</summary>
          <Plan props={props} />
        </details>
      ) : null}
      {!affordable && !requirements.length && level < MAX_BUILDING_LEVEL ? (
        <details className="build-secondary market-prefill-blocker" open>
          <summary>{copy.marketMissingResources}</summary>
          <span className="market-prefill-actions">
            {marketPrefills(upgradeDeficits).map(({ resource, amount }) => (
              <button
                key={resource}
                type="button"
                className="text-action"
                onClick={() =>
                  props.onOpenMarket({
                    resource,
                    amount,
                    source: `${building.label} ${level + 1}`,
                    panel: "build",
                  })
                }
              >
                {copy.marketAcquire(
                  props.format(amount),
                  props.resourceDefs[resource].label,
                )}
              </button>
            ))}
            {!marketPrefills(upgradeDeficits).length ? (
              <span>{copy.marketGoldUnavailable}</span>
            ) : null}
          </span>
        </details>
      ) : null}
    </div>
  );
}
