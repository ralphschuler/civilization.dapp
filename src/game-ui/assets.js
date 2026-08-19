import { BUILDING_ASSETS, CITY_MAPS, RESOURCE_ASSETS } from "./constants.js";

/** Assets needed before the interactive village is useful. */
export const CRITICAL_START_ASSETS = [
  CITY_MAPS.desktop,
  CITY_MAPS.mobile,
  ...Object.values(BUILDING_ASSETS),
  ...Object.values(RESOURCE_ASSETS),
];

let criticalAssetsPromise = null;

function loadAsset(src, createImage) {
  return new Promise((resolve) => {
    const image = createImage();
    const finish = (ok) => resolve({ src, ok });
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = src;
    // Browser memory-cache hits are already complete and do not consistently
    // dispatch a later load event in every embedding webview.
    if (image.complete) finish(image.naturalWidth > 0);
  });
}

/**
 * Preload once per document so rerenders and remounts reuse the browser cache.
 * Failures are reported to the caller instead of blocking the game forever.
 */
export function loadCriticalAssets({ createImage = () => new Image() } = {}) {
  if (!criticalAssetsPromise) {
    criticalAssetsPromise = Promise.all(
      CRITICAL_START_ASSETS.map((src) => loadAsset(src, createImage)),
    ).then((assets) => ({
      failed: assets.filter(({ ok }) => !ok).map(({ src }) => src),
    }));
  }
  return criticalAssetsPromise;
}

export function resetCriticalAssetCacheForTest() {
  criticalAssetsPromise = null;
}
