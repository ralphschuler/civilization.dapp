"use client";

import { RESOURCE_ASSETS } from "../game-ui/constants.js";
import { compactResourceValue } from "../game-ui/helpers.js";
import type { CivilizationLocale } from "../lib/civilization-locale";

type ResourceDefinition = { label: string };
type ResourceValues = Record<string, number | undefined>;

export type CollectionStatusProps = {
  assetResult: { failed: string[] };
  busy: boolean;
  collection: { detail: string; label?: string; locked: boolean };
  copy: {
    collect: string;
    fieldResources: string;
    resourceAssetUnavailable: (name: string) => string;
    resourceNames: Record<string, string | undefined>;
  };
  locale: CivilizationLocale;
  onGather: () => void;
  resourceDefs: Record<string, ResourceDefinition>;
  resourceFormat: (value: number) => string;
  unclaimed: ResourceValues;
};

function fieldStock(value: number | undefined) {
  return Number.isFinite(value) ? (value ?? 0) : 0;
}

export function CollectionStatus(props: CollectionStatusProps) {
  const disabled = props.collection.locked || props.busy;
  const resources = Object.entries(props.resourceDefs).map(
    ([id, definition]) => ({
      id,
      label: props.copy.resourceNames[id] || definition.label,
      value: fieldStock(props.unclaimed[id]),
    }),
  );
  const total = resources.reduce((sum, resource) => sum + resource.value, 0);
  const claimText = props.collection.locked
    ? props.collection.label || props.collection.detail
    : `${props.resourceFormat(total)} ${props.copy.collect}`;
  const compactValue = (value: number) =>
    compactResourceValue(value, props.resourceFormat, props.locale);

  return (
    <button
      type="button"
      className="collect-button"
      id="gather"
      disabled={disabled}
      onClick={props.onGather}
    >
      <span data-collection-status>{props.collection.detail}</span>
      <b data-ready-to-claim aria-hidden="true">
        {claimText}
      </b>
      <span className="collection-resources" aria-hidden="true">
        {resources.map(({ id, label, value }) => (
          <span
            key={id}
            className={`collection-resource ${props.assetResult.failed.includes(RESOURCE_ASSETS[id]) ? "has-asset-error" : ""}`}
            data-collection-resource={id}
            data-asset-container
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
              {props.copy.resourceAssetUnavailable(label)}
            </span>
            <b data-collection-resource-value>{compactValue(value)}</b>
          </span>
        ))}
      </span>
      <span className="collection-accessibility" data-ready-to-claim-accessible>
        {claimText}. {props.copy.fieldResources}:{" "}
        {resources.map(({ id, label, value }, index) => (
          <span key={id}>
            {index > 0 ? "; " : ""}
            {label}{" "}
            <span data-collection-resource-accessible={id}>
              {props.resourceFormat(value)}
            </span>
          </span>
        ))}
        .
      </span>
    </button>
  );
}
