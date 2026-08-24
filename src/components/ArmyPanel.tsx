"use client";

import { TROOP_ASSETS } from "../game-ui/constants.js";
import { civilizationMessages } from "../lib/civilization-locale";
import { marketPrefills } from "../world-game/market-intent.js";

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
  onTrain: (id: string) => void;
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
          const affordable = Object.keys(props.resourceDefs).every(
            (resource) =>
              props.state.resources[resource] >= (troop.cost[resource] ?? 0),
          );
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
              <button
                type="button"
                data-train={id}
                disabled={locked || !affordable || props.busy}
                onClick={() => props.onTrain(id)}
                aria-label={`1 ${troop.label}`}
              >
                +1
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
