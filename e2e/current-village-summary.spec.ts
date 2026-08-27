import { expect, test } from "@playwright/test";

test("current village routes ready and collect independently without dispatching on render", async ({
  page,
}) => {
  await page.goto("/?currentVillageE2e=actions");
  await expect(page.getByTestId("current-village-e2e-harness")).toBeVisible();
  await expect(page.getByTestId("wallet-dispatches")).toHaveText("0");
  const summary = page.locator("[data-current-village-summary]");
  await expect(
    summary.locator('[data-current-village-action="complete"]'),
  ).toBeVisible();
  await expect(
    summary.locator('[data-current-village-action="collect"]'),
  ).toBeVisible();
  await summary.locator('[data-current-village-action="complete"]').click();
  await expect(page.locator('[data-complete-upgrade-slot="1"]')).toBeFocused();
  await summary.locator('[data-current-village-action="collect"]').click();
  await expect(page.getByTestId("wallet-dispatches")).toHaveText("1");
  await expect(page.locator('[data-complete-upgrade-slot="1"]')).toBeVisible();
  await page.locator('[data-complete-upgrade-slot="1"]').click();
  await expect(page.getByTestId("completion-dispatches")).toHaveText("1");
});

test("current village stays within the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/?currentVillageE2e=actions");
  await expect(page.locator("[data-current-village-summary]")).toBeVisible();
  expect(
    await page
      .locator("html")
      .evaluate((node) => node.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("current village opens the existing build decision without starting an upgrade", async ({
  page,
}) => {
  await page.goto("/?currentVillageE2e=build");
  await expect(page.getByTestId("wallet-dispatches")).toHaveText("0");
  await page.locator('[data-current-village-action="build"]').click();
  await expect(page.locator("[data-build-decision]")).toBeFocused();
  await expect(page.getByTestId("wallet-dispatches")).toHaveText("0");
  await expect(page.getByTestId("completion-dispatches")).toHaveText("0");
});
