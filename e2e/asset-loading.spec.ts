import { expect, test } from "@playwright/test";

test("slow critical map keeps an accessible loading fallback until the village is ready", async ({
  page,
}) => {
  let releaseMap: (() => void) | undefined;
  const mapReleased = new Promise<void>((resolve) => {
    releaseMap = resolve;
  });
  await page.route("**/assets/maps/*", async (route) => {
    await mapReleased;
    await route.continue();
  });
  await page.goto("/");
  await page
    .getByTestId("wallet-access-e2e-scenario")
    .selectOption("registered");
  await page.locator(".civilization-login__action").click();
  await expect(page.getByRole("status")).toContainText(
    "Karte, Gebäude und Ressourcen werden geladen",
  );
  await expect(page.locator("#gather")).toBeEnabled();
  await page.locator("#gather").press("Enter");
  releaseMap?.();
  await expect(page.locator("#gather")).toBeVisible();
});

test("a failed map has a visible accessible fallback while village controls remain usable", async ({
  page,
}) => {
  await page.route("**/assets/maps/*", (route) => route.abort("failed"));
  await page.goto("/");
  await page
    .getByTestId("wallet-access-e2e-scenario")
    .selectOption("registered");
  await page.locator(".civilization-login__action").click();
  await expect(page.locator(".asset-fallback")).toBeVisible();
  await expect(page.locator(".asset-fallback")).toHaveText(
    /Kartenbild nicht verfügbar/,
  );
  await expect(page.locator("#gather")).toBeVisible();
});

test("failed building and resource sprites keep their controls usable", async ({
  page,
}) => {
  await page.route("**/assets/village-v2/buildings/townhall.png", (route) =>
    route.abort("failed"),
  );
  await page.route("**/assets/village-v2/resources/wood.png", (route) =>
    route.abort("failed"),
  );
  await page.goto("/");
  await page
    .getByTestId("wallet-access-e2e-scenario")
    .selectOption("registered");
  await page.locator(".civilization-login__action").click();
  await expect(page.locator(".map-townhall")).toHaveClass(/has-asset-error/);
  await expect(page.locator('[data-resource="wood"]')).toHaveClass(
    /has-asset-error/,
  );
  await expect(
    page.locator(".map-townhall .asset-building-fallback"),
  ).toContainText("Rathaus-Symbol nicht verfügbar");
  await page.locator(".map-townhall").click();
  await expect(page.locator("#gather")).toBeEnabled();
  await page.locator("#gather").press("Enter");
});

test("React-owned resource HUD renders formatted state and retains its settings control", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByTestId("wallet-access-e2e-scenario")
    .selectOption("registered");
  await page.locator(".civilization-login__action").click();

  const wood = page.locator('[data-resource="wood"]');
  await expect(wood).toContainText("HOLZ · SPEICHER");
  await expect(wood.locator("[data-resource-value]")).toHaveText("240");
  await expect(wood.locator("[data-resource-production-value]")).toHaveText(
    "+0,6/s",
  );
  await page.locator("[data-open-settings]").click();
  await expect(page.locator(".settings-dialog")).toBeVisible();
});
