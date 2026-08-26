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
  await expect(target).toBeInViewport({ ratio: 1 });
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
    if (
      url.pathname.startsWith("/api/") &&
      url.pathname !== "/api/security/csp-report"
    ) {
      unexpectedApi.push(url.pathname);
    }
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

test("game teardown does not render a nested panel after its runtime is cleared", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await enterGame(page, "registered");
  await expect(page.locator("#game-command-panel")).toBeVisible();
  await page.goto("about:blank");
  await page.waitForTimeout(100);

  expect(pageErrors).toEqual([]);
});

test("the owning React client remounts one live game frame with usable navigation", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await enterGame(page, "registered");
  await expect(page.locator(".game-shell")).toHaveCount(1);
  await page.getByTestId("civilization-game-remount").click();
  await expect(page.locator(".game-shell")).toHaveCount(1);

  const navigation = page.getByRole("navigation", {
    name:
      (page.viewportSize()?.width ?? 0) <= 960
        ? "Schnellzugriff"
        : "Dorfaktionen",
  });
  const marketAction = navigation.locator('[data-command-panel="market"]');
  await marketAction.press("Enter");
  await expect(marketAction).toHaveAttribute("aria-current", "page");
  await expect(page.locator("[data-game-market-panel]")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("game area navigation announces its current area, keeps keyboard focus, and fits narrow layouts", async ({
  page,
}) => {
  await enterGame(page, "registered");
  const desktopNavigation = page.getByRole("navigation", {
    name: "Dorfaktionen",
  });
  const mobileNavigation = page.getByRole("navigation", {
    name: "Schnellzugriff",
  });
  const navigation =
    (page.viewportSize()?.width ?? 0) <= 960
      ? mobileNavigation
      : desktopNavigation;
  const buildAction = navigation.locator('[data-command-panel="build"]');
  const marketAction = navigation.locator('[data-command-panel="market"]');

  await expect(buildAction).toHaveAttribute("aria-current", "page");
  await marketAction.press("Enter");
  await expect(marketAction).toHaveAttribute("aria-current", "page");
  await expect(buildAction).not.toHaveAttribute("aria-current", "page");

  if ((page.viewportSize()?.width ?? 0) <= 960) {
    await expect(page.locator("#game-command-panel")).toBeFocused();
    await page.setViewportSize({ width: 320, height: 700 });
    await expect(mobileNavigation).toBeVisible();
    const mobileMarket = mobileNavigation.getByRole("button", {
      name: "Markt",
    });
    expect(
      await mobileMarket.evaluate((button) => {
        const { width, height } = button.getBoundingClientRect();
        return width >= 44 && height >= 44;
      }),
    ).toBe(true);
    expect(
      await page
        .locator("html")
        .evaluate((node) => node.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await page.setViewportSize({ width: 720, height: 900 });
    expect(
      await page
        .locator("html")
        .evaluate((node) => node.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } else {
    await expect(marketAction).toBeFocused();
    await expect(marketAction).toHaveCSS("outline-style", "solid");
  }
  await expectNoSeriousAxe(page, "[data-testid='civilization-game-root']");
});

test("mobile bottom navigation reveals its selected panel at 195 by 422", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium-390",
    "This regression covers the mobile-only bottom navigation.",
  );
  await page.setViewportSize({ width: 195, height: 422 });
  await enterGame(page, "registered");

  const mobileNavigation = page.getByRole("navigation", {
    name: "Schnellzugriff",
  });
  const marketAction = mobileNavigation.getByRole("button", { name: "Markt" });
  await marketAction.click();
  await expect(marketAction).toHaveAttribute("aria-current", "page");

  const commandPanel = page.locator("#game-command-panel");
  const selectedPanelHeading = commandPanel.getByRole("heading").first();
  await expect(commandPanel).toBeFocused();
  await expect(selectedPanelHeading).toBeVisible();
  await expect(selectedPanelHeading).toBeInViewport({ ratio: 1 });
  expect(
    await page.evaluate(() => {
      const heading = document.querySelector("#game-command-panel h2");
      if (!(heading instanceof HTMLElement)) return false;
      const headingRect = heading.getBoundingClientRect();
      const hitTarget = document.elementFromPoint(
        headingRect.left + headingRect.width / 2,
        headingRect.top + headingRect.height / 2,
      );
      const overlays = [".hud", ".mobile-hud"]
        .map((selector) => document.querySelector(selector))
        .filter(
          (overlay): overlay is HTMLElement => overlay instanceof HTMLElement,
        );
      return (
        !hitTarget?.closest(".hud, .mobile-hud") &&
        overlays.every((overlay) => {
          const overlayRect = overlay.getBoundingClientRect();
          return (
            headingRect.bottom <= overlayRect.top ||
            headingRect.top >= overlayRect.bottom ||
            headingRect.right <= overlayRect.left ||
            headingRect.left >= overlayRect.right
          );
        }) &&
        document.documentElement.scrollWidth <= window.innerWidth
      );
    }),
  ).toBe(true);
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
  const reducedMotion = dialog.getByRole("checkbox", {
    name: "Animationen in Civilization reduzieren.",
  });
  const completionNotices = dialog.getByRole("checkbox", {
    name: "Hinweis anzeigen, wenn ein laufender Ausbau laut Chain-Zeit abgeschlossen werden kann.",
  });
  await expect(completionNotices).toBeVisible();
  await expect(completionNotices).not.toBeChecked();
  await reducedMotion.check();
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
  const settings = page.getByRole("button", { name: "Einstellungen" });
  await expect(settings).toHaveAttribute("title", "Einstellungen");
  await expect(settings).toHaveText("⚙");
  expect(
    await settings.evaluate((button) => {
      const resources = document.querySelector(".resource-hud");
      if (!resources) return false;
      const buttonRect = button.getBoundingClientRect();
      const resourcesRect = resources.getBoundingClientRect();
      return (
        buttonRect.width >= 44 &&
        buttonRect.height >= 44 &&
        buttonRect.bottom <= resourcesRect.top
      );
    }),
  ).toBe(true);
  await settings.click();
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
  await expect(page.getByRole("status")).toHaveText(
    "Der On-chain-Status konnte nicht gelesen werden. Prüfe deine Verbindung und versuche es erneut.",
  );
  await expect(page.locator(".game-access-card > p").last()).toHaveText(
    "Die Registrierung ist öffentlich: Der Contract registriert nur die World Wallet, die diese Transaktion signiert. WalletAuth autorisiert den Contract nicht.",
  );
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

test("auth availability states are localized, safe, retryable, and fit mobile widths", async ({
  page,
}) => {
  const cases = [
    [
      "minikit-unavailable",
      "minikit-unavailable",
      "Öffne Civilization in der World App und versuche es erneut.",
    ],
    [
      "nonce-unavailable",
      "nonce-unavailable",
      "Der sichere Zugang ist gerade nicht verfügbar. Bitte versuche es erneut.",
    ],
    [
      "wallet-rejected",
      "cancelled",
      "Die Wallet-Bestätigung wurde abgebrochen. Du kannst es erneut versuchen.",
    ],
    [
      "siwe-rejected",
      "siwe-rejected",
      "Die Wallet-Bestätigung wurde abgelehnt. Du kannst es erneut versuchen.",
    ],
    [
      "siwe-rejected-message",
      "failure",
      "Die Wallet-Bestätigung war nicht möglich. Bitte versuche es noch einmal.",
    ],
    [
      "wallet-failed",
      "failure",
      "Die Wallet-Bestätigung war nicht möglich. Bitte versuche es noch einmal.",
    ],
  ] as const;
  for (const [scenario, state, message] of cases) {
    await page.getByTestId("wallet-access-e2e-scenario").selectOption(scenario);
    await loginAction(page).click();
    const status = page.locator("#wallet-access-status");
    await expect(status).toHaveAttribute("data-state", state);
    await expect(status).toHaveText(message);
    await expect(status).not.toContainText(
      /nonce|signature|payload|0x|message|wallet_auth|invalid_or_expired/i,
    );
    await expect(loginAction(page)).toHaveText("Erneut versuchen");
  }
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expectReachable(page, loginAction(page));
    await expectNoSeriousAxe(page, ".civilization-login");
  }
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

  await page.reload();
  await page.getByTestId("wallet-access-e2e-locale").selectOption("en-US");
  await enterGame(page, "status-unavailable");
  await expect(page.getByTestId("registration-gate-heading")).toHaveText(
    "On-chain status unavailable",
  );
  await expect(page.getByRole("status")).toHaveText(
    "The on-chain status could not be read. Check your connection and try again.",
  );
  await expect(page.locator(".game-access-card > p").last()).toHaveText(
    "Registration is public: the contract only registers the World Wallet that signs this transaction. WalletAuth does not authorize the contract.",
  );
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
