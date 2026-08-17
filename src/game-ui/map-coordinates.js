/**
 * Terrain anchors are percentages of the rendered map image.  A point marks
 * the bottom centre of a building sprite, independent of that sprite's size.
 * Keeping desktop and mobile points together makes the alternate mobile atlas
 * an explicit coordinate system rather than a collection of CSS corrections.
 */
export const MAP_BUILDING_ANCHORS = Object.freeze({
  townhall: { desktop: [50, 49], mobile: [50, 53] },
  timber: { desktop: [14, 43], mobile: [24, 31] },
  claypit: { desktop: [30, 82], mobile: [28, 83] },
  quarry: { desktop: [11, 70], mobile: [12, 58] },
  warehouse: { desktop: [82, 56], mobile: [82, 52] },
  workshop: { desktop: [79, 39], mobile: [78, 34] },
  goldmine: { desktop: [78, 20], mobile: [76, 22] },
  barracks: { desktop: [53, 80], mobile: [53, 84] },
  market: { desktop: [78, 79], mobile: [80, 78] },
});

function pointStyle([x, y], viewport) {
  return `--map-anchor-x-${viewport}:${x}%;--map-anchor-y-${viewport}:${y}%;`;
}

/** Returns CSS custom properties for the two map atlases for one building. */
export function mapBuildingAnchorStyle(id) {
  const anchor = MAP_BUILDING_ANCHORS[id];
  if (!anchor) throw new Error(`unknown_map_building:${id}`);
  return `${pointStyle(anchor.desktop, "desktop")}${pointStyle(anchor.mobile, "mobile")}`;
}
