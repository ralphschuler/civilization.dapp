import { expect, test } from "@playwright/test";

test("dynamic feedback remains literal text in the browser DOM", async ({
  page,
}) => {
  const feedback =
    '<img src=x onerror="globalThis.feedbackXss=1"> "quotes" & Käse 🏰';

  await page.goto(`/?feedbackE2e=${encodeURIComponent(feedback)}`);
  await page
    .getByTestId("wallet-access-e2e-scenario")
    .selectOption("registered");
  await page.locator(".civilization-login__action").click();

  const feedbackElement = page.locator(".map-feedback");
  await expect(feedbackElement).toHaveText(feedback);
  await expect(feedbackElement.locator("img")).toHaveCount(0);
  await expect(feedbackElement.locator("[onerror]")).toHaveCount(0);
  await expect(page.locator("img[onerror]")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (globalThis as { feedbackXss?: number }).feedbackXss,
    ),
  ).toBeUndefined();
});
