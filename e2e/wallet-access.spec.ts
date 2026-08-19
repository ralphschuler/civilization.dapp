import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const loginAction = (page: Page) => page.locator(".civilization-login__action");
const gateAction = (page: Page) => page.locator(".game-access-action");
const unexpectedRequests = new WeakMap<Page, string[]>();
const testOrigin = `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "31058"}`;

async function expectNoSeriousAxe(page: Page, selector: string) {
  const results = await new AxeBuilder({ page }).include(selector).analyze();
  expect(
    results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
}

async function expectReachable(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(
    await page
      .locator("html")
      .evaluate((node) => node.scrollWidth <= window.innerWidth),
  ).toBe(true);
}

async function enterGame(page: Page, scenario: string) {
  await page.getByTestId("wallet-access-e2e-scenario").selectOption(scenario);
  await loginAction(page).click();
}

test.beforeEach(async ({ page }) => {
  const unexpectedApi: string[] = [];
  unexpectedRequests.set(page, unexpectedApi);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== testOrigin) {
      await route.abort();
      return;
    }
    if (url.pathname.startsWith("/api/")) unexpectedApi.push(url.pathname);
    await route.continue();
  });
  await page.goto("/");
});

test.afterEach(async ({ page }) => {
  expect(unexpectedRequests.get(page)).toEqual([]);
});

test("login is keyboard reachable, localized in German, and accessible", async ({
  page,
}) => {
  for (let tabPresses = 0; tabPresses < 4; tabPresses += 1) {
    await page.keyboard.press("Tab");
    if (
      await loginAction(page).evaluate(
        (node) => document.activeElement === node,
      )
    )
      break;
  }
  await expect(loginAction(page)).toBeFocused();
  await expect(loginAction(page)).toHaveText("Mit World Wallet fortfahren");
  await expectReachable(page, loginAction(page));
  await expectNoSeriousAxe(page, ".civilization-login");
});

test("native WalletAuth/SIWE seam reaches an already registered game on the same page", async ({
  page,
}) => {
  await enterGame(page, "registered");
  const root = page.getByTestId("civilization-game-root");
  await expect(root).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#gather")).toBeVisible();
  await expectReachable(page, page.locator("#gather"));
  await page.locator("#gather").press("Enter");
  await expectNoSeriousAxe(page, "[data-testid='civilization-game-root']");
});

test("settings dialog traps focus, closes by Escape, and keeps motion preference locally", async ({
  page,
}) => {
  await enterGame(page, "registered");
  const settings = page.getByRole("button", { name: "Einstellungen" });
  await settings.click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog).toBeVisible();
  await expectNoSeriousAxe(page, ".settings-dialog");
  await expect(dialog.getByRole("button", { name: "Schließen" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Abmelden" })).toBeFocused();
  await dialog.getByRole("checkbox").check();
  await expect(page.locator(".game-shell")).toHaveClass(/motion-reduced/);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("civilization-reduced-motion")),
    )
    .toBe("true");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
});

test("settings stay within a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterGame(page, "registered");
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await expectReachable(
    page,
    page.getByRole("dialog", { name: "Einstellungen" }),
  );
  expect(
    await page
      .locator("html")
      .evaluate((node) => node.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("settings language persists without leaving the running game", async ({
  page,
}) => {
  await enterGame(page, "registered");
  const root = page.getByTestId("civilization-game-root");
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.locator("#civilization-locale").selectOption("en-US");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expect(root.locator("#gather")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("civilization-locale")),
    )
    .toBe("en-US");
});

test("an in-progress on-chain read cannot offer village creation", async ({
  page,
}) => {
  await enterGame(page, "status-loading");
  await expect(page.getByTestId("registration-gate-heading")).toHaveText(
    "On-chain-Dorf wird geprüft",
  );
  await expect(gateAction(page)).toHaveText("On-chain-Status wird geprüft …");
  await expect(gateAction(page)).toBeDisabled();
});

test("an unavailable on-chain read stays out of the registration flow and can be retried", async ({
  page,
}) => {
  await enterGame(page, "status-unavailable");
  const heading = page.getByTestId("registration-gate-heading");
  await expect(heading).toHaveText("On-chain-Status nicht verfügbar");
  await expect(gateAction(page)).toHaveText("Status erneut prüfen");
  await expect(gateAction(page)).toBeEnabled();

  await page
    .getByTestId("wallet-access-e2e-scenario")
    .selectOption("registered");
  await gateAction(page).press("Enter");
  await expect(heading).toHaveText("On-chain-Dorf wird geprüft");
  await expect(page.getByTestId("civilization-game-root")).toBeFocused();
});

test("a page reload starts a new authoritative status check without a registration request", async ({
  page,
}) => {
  await enterGame(page, "unregistered-success");
  await expect(page.getByTestId("registration-gate-heading")).toHaveText(
    "Dein Dorf erstellen",
  );
  await page.reload();
  await enterGame(page, "registered");
  await expect(page.getByTestId("civilization-game-root")).toBeFocused();
});

test("unregistered wallet shows the gate, rejects, and retries to the game", async ({
  page,
}) => {
  await enterGame(page, "unregistered-rejected");
  const heading = page.getByTestId("registration-gate-heading");
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expectReachable(page, gateAction(page));
  await expectNoSeriousAxe(page, ".game-access-gate");

  await gateAction(page).press("Enter");
  await expect(gateAction(page)).toBeDisabled();
  await expect(heading).toBeFocused();
  await expect(page.getByRole("status")).toContainText("nicht bestätigt");
  await page
    .getByTestId("wallet-access-e2e-scenario")
    .selectOption("unregistered-success");
  await gateAction(page).press("Enter");
  await expect(page.getByTestId("civilization-game-root")).toBeFocused();
});

test("wallet rejection remains retryable without auth or chain requests", async ({
  page,
}) => {
  await enterGame(page, "wallet-rejected");
  await expect(page.locator("#wallet-access-status")).toHaveAttribute(
    "data-state",
    "cancelled",
  );
  await page
    .getByTestId("wallet-access-e2e-scenario")
    .selectOption("registered");
  await loginAction(page).press("Enter");
  await expect(page.getByTestId("civilization-game-root")).toBeFocused();
});

test("English is an explicit test locale with locale-specific formatting", async ({
  page,
}) => {
  await page.getByTestId("wallet-access-e2e-locale").selectOption("en-US");
  await expect(loginAction(page)).toHaveText("Continue with World Wallet");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await enterGame(page, "unregistered-success");
  await expect(page.getByTestId("registration-gate-heading")).toHaveText(
    "Create your village",
  );
  await expect(gateAction(page)).toHaveText("Create village on-chain");
});

test("reduced motion disables the animated registration surface", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterGame(page, "unregistered-success");
  await expect(page.locator(".game-access-gate")).toHaveCSS(
    "animation-name",
    "none",
  );
});
