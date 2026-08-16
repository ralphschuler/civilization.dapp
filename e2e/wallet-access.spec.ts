import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const action = (page: Page) =>
  page.getByRole("button", {
    name: /^(Mit World Wallet fortfahren|Wallet-Bestätigung wird geöffnet …|Wallet bestätigt|Erneut versuchen)$/,
  });

const apiRequests = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const requests: string[] = [];
  apiRequests.set(page, requests);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === "http://127.0.0.1:31058" &&
      url.pathname.startsWith("/api/")
    ) {
      requests.push(url.pathname);
    }
  });
  await page.goto("/");
});

test.afterEach(async ({ page }) => {
  expect(apiRequests.get(page)).toEqual([]);
});

test("is ready for keyboard access and has no serious axe violations", async ({
  page,
}) => {
  for (let tabPresses = 0; tabPresses < 3; tabPresses += 1) {
    await page.keyboard.press("Tab");
    if (
      await action(page).evaluate((button) => document.activeElement === button)
    ) {
      break;
    }
  }
  await expect(action(page)).toBeFocused();

  const results = await new AxeBuilder({ page })
    .include(".civilization-login")
    .analyze();
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious).toEqual([]);
});

test("shows pending and success without contacting a wallet or auth endpoint", async ({
  page,
}) => {
  await action(page).press("Enter");
  await expect(page.locator("#wallet-access-status")).toHaveAttribute(
    "data-state",
    "pending",
  );
  await expect(action(page)).toBeDisabled();
  await expect(page.locator("#wallet-access-status")).toHaveAttribute(
    "data-state",
    "success",
  );
});

test("recovers from a user rejection and retries", async ({ page }) => {
  await page.getByTestId("wallet-access-e2e-scenario").selectOption("rejected");
  await action(page).click();
  await expect(page.locator("#wallet-access-status")).toHaveAttribute(
    "data-state",
    "cancelled",
  );

  await page.getByTestId("wallet-access-e2e-scenario").selectOption("success");
  await action(page).click();
  await expect(page.locator("#wallet-access-status")).toHaveAttribute(
    "data-state",
    "success",
  );
});

test("disables login motion when reduced motion is preferred", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(action(page)).toHaveCSS("transition-duration", "0s");
});
