"use client";

import { RESOURCE_ASSETS } from "../game-ui/constants.js";
import {
  compactResourceValue,
  productionRateText,
} from "../game-ui/helpers.js";
import type { CivilizationLocale } from "../lib/civilization-locale";

type ResourceDefinition = { color: string; label: string };
type ResourceToken = { symbol: string };
type ResourceValues = Record<string, number | undefined>;

export type GameShellHudProps = {
  assetResult: { failed: string[] };
  capacity: number;
  copy: {
    perDay: string;
    perSecond: string;
    production: string;
    resourceAssetUnavailable: (name: string) => string;
    resourceNames: Record<string, string | undefined>;
    settings: string;
    storage: string;
    storageAccessible: string;
    from: string;
    villageOf: string;
    wallet: string;
    walletBalance: string;
  };
  locale: CivilizationLocale;
  onOpenSettings: () => void;
  production: ResourceValues;
  resourceDefs: Record<string, ResourceDefinition>;
  resourceFormat: (value: number) => string;
  resources: ResourceValues;
  runtimeMode: "demo" | "world";
  tokens: Record<string, ResourceToken>;
  worldApp: { installed: boolean };
  worldBadge: string;
};

function assetFailed(
  assetResult: GameShellHudProps["assetResult"],
  src: string,
) {
  return assetResult.failed.includes(src);
}

function ResourceHudItem({
  id,
  definition,
  props,
}: {
  id: string;
  definition: ResourceDefinition;
  props: GameShellHudProps;
}) {
  const {
    assetResult,
    capacity,
    copy,
    locale,
    production,
    resourceFormat,
    resources,
    runtimeMode,
    tokens,
  } = props;
  const label = copy.resourceNames[id] || definition.label;
  const stored = Number.isFinite(resources[id]) ? (resources[id] ?? 0) : 0;
  const storageCapacity = Number.isFinite(capacity) ? capacity : 0;
  const compactValue = (value: number) =>
    compactResourceValue(value, resourceFormat, locale);
  const exactValue = (value: number) => resourceFormat(value);
  const productionText = productionRateText({
    resourceId: id,
    rate: production[id],
    mode: runtimeMode,
    formatValue: compactValue,
    dayUnit: copy.perDay,
    secondUnit: copy.perSecond,
  });
  const accessibleProductionText = productionRateText({
    resourceId: id,
    rate: production[id],
    mode: runtimeMode,
    formatValue: exactValue,
    dayUnit: copy.perDay,
    secondUnit: copy.perSecond,
  });
  const hasProduction = productionText !== "";
  const gold = runtimeMode === "world" && id === "gold";

  return (
    <div
      className={`resource ${definition.color} ${assetFailed(assetResult, RESOURCE_ASSETS[id]) ? "has-asset-error" : ""}`}
      data-resource={id}
      data-asset-container
      role="group"
      aria-label={label}
    >
      {/* The game uses its asset-base fallback loader, not Next's image pipeline. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={RESOURCE_ASSETS[id]}
        alt=""
        aria-hidden="true"
        data-asset-fallback
        onError={(event) =>
          event.currentTarget
            .closest("[data-asset-container]")
            ?.classList.add("has-asset-error")
        }
      />
      <span className="asset-icon-fallback" role="status">
        {copy.resourceAssetUnavailable(label)}
      </span>
      <span className="resource-values" aria-hidden="true">
        <small>
          {gold ? "CGOLD" : tokens[id].symbol} ·{" "}
          {gold ? copy.wallet : copy.storage}
        </small>
        <strong data-resource-value>{compactValue(stored)}</strong>
        {!gold && (
          <>
            <b className="storage-capacity" data-resource-capacity>
              /{compactValue(storageCapacity)}
            </b>
            <div
              className={`storage-progress ${stored >= storageCapacity ? "is-full" : ""}`}
            >
              <i
                data-resource-progress
                style={{
                  transform: `scaleX(${storageCapacity ? Math.min(1, stored / storageCapacity) : 0})`,
                }}
              />
            </div>
          </>
        )}
      </span>
      <em
        className="resource-production"
        data-resource-production
        aria-hidden="true"
        hidden={!hasProduction}
      >
        <span className="resource-production-label">{copy.production} </span>
        <span data-resource-production-value>{productionText}</span>
      </em>
      <span className="resource-accessibility">
        {gold ? (
          <span>
            {copy.walletBalance}: {exactValue(stored)}.
          </span>
        ) : (
          <span
            role="progressbar"
            aria-label={`${label}-${copy.storageAccessible}`}
            aria-valuemin={0}
            aria-valuemax={storageCapacity}
            aria-valuenow={stored}
            aria-valuetext={`${exactValue(stored)} ${copy.from} ${exactValue(storageCapacity)}`}
          />
        )}
        <span data-resource-accessible-production hidden={!hasProduction}>
          {hasProduction
            ? `${copy.production}: ${accessibleProductionText}`
            : ""}
        </span>
      </span>
    </div>
  );
}

export function GameShellHud(props: GameShellHudProps) {
  return (
    <header className="hud village-hud">
      <div className="game-mark">
        <span>CD</span>
        <div>
          <b>CIVILIZATION</b>
          <small>DAPP · {props.copy.villageOf}</small>
        </div>
      </div>
      <button
        type="button"
        className="resource-settings"
        data-open-settings
        aria-haspopup="dialog"
        aria-label={props.copy.settings}
        title={props.copy.settings}
        onClick={(event) => {
          event.stopPropagation();
          props.onOpenSettings();
        }}
      >
        <span aria-hidden="true">⚙</span>
      </button>
      <div className="resource-hud">
        {Object.entries(props.resourceDefs).map(([id, definition]) => (
          <ResourceHudItem
            key={id}
            id={id}
            definition={definition}
            props={props}
          />
        ))}
      </div>
      <span
        className={`demo-badge ${props.worldApp.installed ? "is-world" : ""}`}
      >
        {props.worldBadge}
      </span>
    </header>
  );
}
