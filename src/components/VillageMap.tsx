"use client";

import type { CSSProperties } from "react";
import {
  BUILDING_ASSETS,
  BUILDING_IDS,
  CITY_MAPS,
} from "../game-ui/constants.js";
import { MAP_BUILDING_ANCHORS } from "../game-ui/map-coordinates.js";
import { CollectionStatus } from "./CollectionStatus";
import type { CollectionStatusProps } from "./CollectionStatus";

type BuildingDefinition = { label: string };
type BuildingLevels = Record<string, number | undefined>;

export type VillageMapProps = {
  assetResult: { failed: string[] };
  assetsLoading: boolean;
  buildings: Record<string, BuildingDefinition>;
  buildingLevels: BuildingLevels;
  capacity: number;
  collectionStatus: CollectionStatusProps;
  copy: {
    assetsLoading: string;
    buildingAssetUnavailable: (name: string) => string;
    buildingNames: Record<string, string | undefined>;
    interactiveMap: string;
    level: string;
    mapAssetUnavailable: string;
    mapHead: (prestigeCount: number) => string;
    marketBadge: string;
    openMarket: string;
    villageOf: string;
    yourVillage: string;
  };
  feedback: string;
  format: (value: number) => string;
  onSelectBuilding: (id: string) => void;
  onSelectMarket: () => void;
  prestigeCount: number;
  runtimeMode: "demo" | "world";
  selectedBuilding: string;
  activePanel: string;
  appearance?: "classic" | "dusk";
};

function assetFailed(assetResult: VillageMapProps["assetResult"], src: string) {
  return assetResult.failed.includes(src);
}

function anchorStyle(id: keyof typeof MAP_BUILDING_ANCHORS): CSSProperties {
  const anchor = MAP_BUILDING_ANCHORS[id];
  return {
    "--map-anchor-x-desktop": `${anchor.desktop[0]}%`,
    "--map-anchor-y-desktop": `${anchor.desktop[1]}%`,
    "--map-anchor-x-mobile": `${anchor.mobile[0]}%`,
    "--map-anchor-y-mobile": `${anchor.mobile[1]}%`,
  } as CSSProperties;
}

function BuildingMarker({
  id,
  props,
}: {
  id: (typeof BUILDING_IDS)[number];
  props: VillageMapProps;
}) {
  const label = props.copy.buildingNames[id] || props.buildings[id].label;
  const level = props.buildingLevels[id] ?? 0;
  const failed = assetFailed(props.assetResult, BUILDING_ASSETS[id]);
  return (
    <button
      type="button"
      className={`map-building map-${id} ${props.selectedBuilding === id && props.activePanel === "build" ? "is-selected" : ""} ${failed ? "has-asset-error" : ""}`}
      data-map-building={id}
      data-map-anchor="bottom-center"
      style={anchorStyle(id as keyof typeof MAP_BUILDING_ANCHORS)}
      aria-label={`${label}, ${props.copy.level} ${level}`}
      data-asset-container
      onClick={() => props.onSelectBuilding(id)}
    >
      {/* The game uses its asset-base fallback loader, not Next's image pipeline. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BUILDING_ASSETS[id]}
        alt=""
        data-asset-fallback
        onError={(event) =>
          event.currentTarget
            .closest("[data-asset-container]")
            ?.classList.add("has-asset-error")
        }
      />
      <i className="asset-building-fallback" role="status">
        {props.copy.buildingAssetUnavailable(label)}
      </i>
      <span>
        <b>{label}</b>
        <small>LVL {level}</small>
      </span>
    </button>
  );
}

export function VillageMap(props: VillageMapProps) {
  const mapAssetFailed =
    assetFailed(props.assetResult, CITY_MAPS.desktop) ||
    assetFailed(props.assetResult, CITY_MAPS.mobile);
  const marketFailed = assetFailed(props.assetResult, BUILDING_ASSETS.market);
  const marketLabel = props.copy.buildingNames.market || "Market";

  return (
    <section
      className={`village-map ${mapAssetFailed ? "has-asset-error" : ""}`}
      data-village-appearance={
        mapAssetFailed ? "classic" : props.appearance || "classic"
      }
      id="dorf"
      aria-label={props.copy.interactiveMap}
      data-asset-container
    >
      <picture className="village-map-terrain">
        <source media="(max-width: 640px)" srcSet={CITY_MAPS.mobile} />
        <img
          src={CITY_MAPS.desktop}
          alt=""
          width="1672"
          height="941"
          fetchPriority="high"
          data-asset-fallback
          onError={(event) =>
            event.currentTarget
              .closest("[data-asset-container]")
              ?.classList.add("has-asset-error")
          }
        />
      </picture>
      <p className="asset-loading" role="status" hidden={!props.assetsLoading}>
        {props.copy.assetsLoading}
      </p>
      <p className="asset-fallback" role="status">
        {props.copy.mapAssetUnavailable}
      </p>
      <div className="map-head">
        <p>{props.copy.villageOf}</p>
        <h1>{props.copy.yourVillage}</h1>
        <span>
          {props.copy.buildingNames.townhall}{" "}
          {props.buildingLevels.townhall ?? 0}
          {" · "}
          {props.copy.buildingNames.warehouse} {props.format(props.capacity)}
          {props.runtimeMode === "world"
            ? props.copy.mapHead(props.prestigeCount)
            : ""}
        </span>
      </div>
      <CollectionStatus {...props.collectionStatus} />
      <div className="map-buildings">
        {BUILDING_IDS.map((id) => (
          <BuildingMarker key={id} id={id} props={props} />
        ))}
        <button
          type="button"
          className={`map-building map-market ${props.activePanel === "market" ? "is-selected" : ""} ${marketFailed ? "has-asset-error" : ""}`}
          data-map-panel="market"
          data-map-anchor="bottom-center"
          style={anchorStyle("market")}
          aria-label={props.copy.openMarket}
          data-asset-container
          onClick={props.onSelectMarket}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={BUILDING_ASSETS.market}
            alt=""
            data-asset-fallback
            onError={(event) =>
              event.currentTarget
                .closest("[data-asset-container]")
                ?.classList.add("has-asset-error")
            }
          />
          <i className="asset-building-fallback" role="status">
            {props.copy.buildingAssetUnavailable(marketLabel)}
          </i>
          <span>
            <b>{marketLabel}</b>
            <small>
              {props.runtimeMode === "world" ? "CGOLD" : props.copy.marketBadge}
            </small>
          </span>
        </button>
      </div>
      <p className="map-feedback" aria-live="polite">
        {props.feedback}
      </p>
    </section>
  );
}
