"use client";

import { useState } from "react";
import { TROOP_ASSETS } from "../game-ui/constants.js";
import { civilizationMessages } from "../lib/civilization-locale";
import { marketPrefills } from "../world-game/market-intent.js";
import {
  maxTrainableAmount,
  trainingCost,
  validateTrainingAmount,
} from "../world-game/training-quantity.js";

type ResourceDefinition = { color?: string; short?: string; label: string };
type Troop = { attack: number; cost: Record<string, number>; label: string };
type Requirement = { id: string; level: number };
type ArmyState = {
  resources: Record<string, number>;
  troops: Record<string, number>;
};

export type ArmyPanelProps = {
  state: ArmyState;
  troops: Record<string, Troop>;
  resourceDefs: Record<string, ResourceDefinition>;
  buildings: Record<string, { label: string }>;
  assetResult?: { failed: string[] };
  format: (value: number) => string;
  troopRequirements: (id: string) => Requirement[];
  busy: boolean;
  copy?: ReturnType<typeof civilizationMessages>;
  onTrain: (id: string, amount: number) => void;
  onOpenMarket: (intent: {
    resource: string;
    amount: number;
    source: string;
    panel: "army";
  }) => void;
};

function CostLine({
  cost,
  resourceDefs,
  format,
}: {
  cost: Record<string, number>;
  resourceDefs: Record<string, ResourceDefinition>;
  format: (value: number) => string;
}) {
  return (
    <>
      {Object.entries(resourceDefs)
        .filter(([id]) => cost[id] > 0)
        .map(([id, resource]) => (
          <span key={id} className={`cost ${resource.color ?? ""}`}>
            {format(cost[id])} {resource.short}
          </span>
        ))}
    </>
  );
}

function TrainingControl({
  id,
  troop,
  resources,
  resourceDefs,
  format,
  busy,
  onTrain,
  copy,
}: {
  id: string;
  troop: Troop;
  resources: Record<string, number>;
  resourceDefs: Record<string, ResourceDefinition>;
  format: (value: number) => string;
  busy: boolean;
  onTrain: (id: string, amount: number) => void;
  copy: ReturnType<typeof civilizationMessages>;
}) {
  const [draft, setDraft] = useState("1");
  const maximum = maxTrainableAmount(resources, troop.cost);
  const amount = /^\d+$/.test(draft) ? Number(draft) : Number.NaN;
  const validation = validateTrainingAmount(amount, maximum);
  const total = validation.ok
    ? trainingCost(troop.cost, validation.amount)
    : null;
  const error = !validation.ok
    ? validation.reason === "invalid"
      ? copy.trainingAmountInvalid
      : copy.trainingAmountUnavailable(format(maximum))
    : null;
  const actionLabel = validation.ok
    ? validation.amount === 1
      ? copy.trainOne(troop.label)
      : copy.trainAmount(String(validation.amount), troop.label)
    : copy.trainAmount("0", troop.label);

  return (
    <div className="training-control">
      <label htmlFor={`training-amount-${id}`}>{copy.trainingQuantity}</label>
      <input
        id={`training-amount-${id}`}
        data-training-amount={id}
        type="number"
        inputMode="numeric"
        min="1"
        step="1"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-describedby={`training-help-${id}`}
        aria-invalid={Boolean(error)}
        disabled={busy || maximum < 1}
      />
      <span id={`training-help-${id}`} className="training-help">
        {copy.trainingMaximum(format(maximum))}
      </span>
      {total ? (
        <span className="training-total" data-training-total={id}>
          {copy.trainingTotalCost}:{" "}
          <CostLine cost={total} resourceDefs={resourceDefs} format={format} />
        </span>
      ) : null}
      {error ? (
        <span className="training-error" role="alert">
          {error}
        </span>
      ) : null}
      <button
        type="button"
        className="primary-action training-submit"
        data-train={id}
        disabled={!validation.ok || busy}
        onClick={() => validation.ok && onTrain(id, validation.amount)}
        aria-label={actionLabel}
      >
        {actionLabel}
      </button>
    </div>
  );
}

export function ArmyPanel(props: ArmyPanelProps) {
  const copy = props.copy || civilizationMessages();
  const readyTroops = Object.values(props.state.troops).reduce(
    (total, amount) => total + amount,
    0,
  );

  return (
    <div className="inspector army-inspector">
      <div className="inspector-title">
        <p>{copy.barracksTitle}</p>
        <h2>{copy.trainArmy}</h2>
        <span>{copy.unitsReady(String(readyTroops))}</span>
      </div>
      <div className="troop-list">
        {Object.entries(props.troops).map(([id, troop]) => {
          const asset = TROOP_ASSETS[id as keyof typeof TROOP_ASSETS];
          const requirements = props.troopRequirements(id);
          const maximum = maxTrainableAmount(props.state.resources, troop.cost);
          const affordable = maximum >= 1;
          const locked = requirements.length > 0;
          const deficits = Object.fromEntries(
            Object.entries(props.resourceDefs)
              .map(([resource]) => [
                resource,
                Math.max(
                  0,
                  (troop.cost[resource] ?? 0) -
                    (props.state.resources[resource] ?? 0),
                ),
              ])
              .filter(([, amount]) => amount),
          );
          const requirementsText = requirements
            .map(({ id: required, level }) =>
              props.buildings[required]
                ? `${props.buildings[required].label} ${level}`
                : `${required} ${level}`,
            )
            .join(" · ");

          return (
            <article
              key={id}
              className={`troop-card ${locked ? "is-locked" : ""} ${props.assetResult?.failed.includes(asset) ? "has-asset-error" : ""}`}
              data-asset-container
            >
              {/* The panel owns its fallback because it mounts after imperative bindings. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset}
                alt={troop.label}
                onError={(event) =>
                  event.currentTarget
                    .closest("[data-asset-container]")
                    ?.classList.add("has-asset-error")
                }
              />
              <i className="asset-building-fallback" role="status">
                {copy.troopAssetUnavailable(troop.label)}
              </i>
              <div>
                <b>{troop.label}</b>
                <small>
                  {copy.attackAndReady(
                    String(troop.attack),
                    String(props.state.troops[id]),
                  )}
                </small>
                <em>
                  {locked ? (
                    requirementsText
                  ) : (
                    <CostLine
                      cost={troop.cost}
                      resourceDefs={props.resourceDefs}
                      format={props.format}
                    />
                  )}
                </em>
                {!locked && !affordable ? (
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
                            source: `1 ${troop.label}`,
                            panel: "army",
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
                ) : null}
              </div>
              {!locked ? (
                <TrainingControl
                  id={id}
                  troop={troop}
                  resources={props.state.resources}
                  resourceDefs={props.resourceDefs}
                  format={props.format}
                  busy={props.busy}
                  onTrain={props.onTrain}
                  copy={copy}
                />
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
