import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "@playwright/test";

const output = join(process.cwd(), "artefacts", "storybook-ui-audit");
const root = join(output, "storybook-static");
const visualReview = join(process.cwd(), "visual-review");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = normalize(
    join(root, pathname === "/" ? "index.html" : pathname),
  );
  if (!file.startsWith(root) || !existsSync(file))
    return response.writeHead(404).end();
  response.writeHead(200, {
    "content-type": mime[extname(file)] || "application/octet-stream",
  });
  createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(6006, "127.0.0.1", resolve));
mkdirSync(visualReview, { recursive: true });
const browser = await chromium.launch({ headless: true });
const footerMeasurements = [];
const mobileAuditMeasurements = [];
const resourceHeaderMeasurements = [];
const allShots = [
  [
    "desktop-village-build-overview.png",
    "ui-audit-civilization--village-build-overview",
    { width: 1440, height: 1000 },
  ],
  [
    "mobile-village-build-overview-390.png",
    "ui-audit-civilization--village-build-overview",
    { width: 390, height: 844 },
  ],
  [
    "mobile-stable-game-shell-frame-195.png",
    "ui-audit-civilization--stable-game-shell-frame-mobile",
    { width: 195, height: 422 },
  ],
  [
    "mobile-village-build-navigation-195.png",
    "ui-audit-civilization--mobile-village-build-navigation",
    { width: 195, height: 422 },
  ],
  [
    "mobile-village-build-navigation-320.png",
    "ui-audit-civilization--mobile-village-build-navigation",
    { width: 320, height: 844 },
  ],
  [
    "mobile-village-build-navigation-390.png",
    "ui-audit-civilization--mobile-village-build-navigation",
    { width: 390, height: 844 },
  ],
  [
    "mobile-demo-footer-320.png",
    "ui-audit-civilization--demo-footer",
    { width: 320, height: 844 },
  ],
  [
    "mobile-demo-footer-390.png",
    "ui-audit-civilization--demo-footer",
    { width: 390, height: 844 },
  ],
  [
    "mobile-world-footer-320.png",
    "ui-audit-civilization--world-footer",
    { width: 320, height: 844 },
  ],
  [
    "mobile-world-footer-390.png",
    "ui-audit-civilization--world-footer",
    { width: 390, height: 844 },
  ],
  [
    "mobile-demo-footer-390-200-zoom.png",
    "ui-audit-civilization--demo-footer",
    { width: 390, height: 844, zoom: 2 },
  ],
  [
    "mobile-collection-wayfinding-320.png",
    "ui-audit-civilization--mobile-collection-wayfinding",
    { width: 320, height: 844 },
  ],
  [
    "mobile-collection-wayfinding-390.png",
    "ui-audit-civilization--mobile-collection-wayfinding",
    { width: 390, height: 844 },
  ],
  [
    "mobile-resource-header-195.png",
    "ui-audit-civilization--resource-status-header",
    { width: 195, height: 422 },
  ],
  [
    "mobile-resource-header-320.png",
    "ui-audit-civilization--resource-status-header",
    { width: 320, height: 844 },
  ],
  [
    "mobile-resource-header-390.png",
    "ui-audit-civilization--resource-status-header",
    { width: 390, height: 844 },
  ],
  [
    "mobile-next-action-blocked-320.png",
    "ui-audit-civilization--next-action-blocked",
    { width: 320, height: 844 },
  ],
  [
    "mobile-next-action-blocked-390.png",
    "ui-audit-civilization--next-action-blocked",
    { width: 390, height: 844 },
  ],
  [
    "mobile-collection-guide-320.png",
    "ui-audit-civilization--mobile-collection-guide",
    { width: 320, height: 844 },
  ],
  [
    "mobile-collection-guide-390.png",
    "ui-audit-civilization--mobile-collection-guide",
    { width: 390, height: 844 },
  ],
  [
    "mobile-construction-ready-320.png",
    "ui-audit-civilization--construction-ready",
    { width: 320, height: 844 },
  ],
  [
    "mobile-construction-ready-390.png",
    "ui-audit-civilization--construction-ready",
    { width: 390, height: 844 },
  ],
  [
    "mobile-completion-ready-notice-390.png",
    "ui-audit-civilization--completion-ready-notice-visible",
    { width: 390, height: 844 },
  ],
  [
    "mobile-village-appearance-dusk-settings-320.png",
    "ui-audit-civilization--village-appearance-dusk-settings",
    { width: 320, height: 844 },
  ],
  [
    "mobile-village-appearance-dusk-settings-390.png",
    "ui-audit-civilization--village-appearance-dusk-settings",
    { width: 390, height: 844 },
  ],
  [
    "mobile-village-appearance-dawn-settings-320.png",
    "ui-audit-civilization--village-appearance-dawn-settings",
    { width: 320, height: 844 },
  ],
  [
    "mobile-village-appearance-dawn-settings-390.png",
    "ui-audit-civilization--village-appearance-dawn-settings",
    { width: 390, height: 844 },
  ],
  [
    "mobile-bottom-navigation-390.png",
    "ui-audit-civilization--bottom-navigation",
    { width: 390, height: 844 },
  ],
  [
    "mobile-bottom-navigation-320.png",
    "ui-audit-civilization--bottom-navigation",
    { width: 320, height: 844 },
  ],
  [
    "mobile-bottom-navigation-195.png",
    "ui-audit-civilization--bottom-navigation",
    { width: 195, height: 422 },
  ],
  [
    "mobile-build-action-focus-320.png",
    "ui-audit-civilization--mobile-build-action-focus",
    { width: 320, height: 844 },
  ],
  [
    "mobile-build-action-focus-390.png",
    "ui-audit-civilization--mobile-build-action-focus",
    { width: 390, height: 844 },
  ],
  [
    "mobile-world-market-320.png",
    "ui-audit-civilization--world-market-mobile",
    { width: 320, height: 844 },
  ],
  [
    "mobile-world-market-390.png",
    "ui-audit-civilization--world-market-mobile",
    { width: 390, height: 844 },
  ],
  [
    "mobile-army-training-plus-one-320.png",
    "ui-audit-civilization--army-training-mobile-plus-one",
    { width: 320, height: 844 },
  ],
  [
    "mobile-army-training-plus-one-390.png",
    "ui-audit-civilization--army-training-mobile-plus-one",
    { width: 390, height: 844 },
  ],
  [
    "mobile-army-training-quantity-320.png",
    "ui-audit-civilization--army-training-quantity-choice",
    { width: 320, height: 844 },
  ],
  [
    "mobile-army-training-quantity-390.png",
    "ui-audit-civilization--army-training-quantity-choice",
    { width: 390, height: 844 },
  ],
  [
    "mobile-army-training-resource-limit-320.png",
    "ui-audit-civilization--army-training-resource-limit",
    { width: 320, height: 844 },
  ],
  [
    "mobile-army-training-resource-limit-390.png",
    "ui-audit-civilization--army-training-resource-limit",
    { width: 390, height: 844 },
  ],
  [
    "mobile-army-training-review-320.png",
    "ui-audit-civilization--army-training-review-summary",
    { width: 320, height: 844 },
  ],
  [
    "mobile-army-training-review-390.png",
    "ui-audit-civilization--army-training-review-summary",
    { width: 390, height: 844 },
  ],
  [
    "mobile-raid-history-loaded-390.png",
    "ui-audit-civilization--raid-history-loaded",
    { width: 390, height: 844 },
  ],
  [
    "mobile-raid-history-updated-390.png",
    "ui-audit-civilization--raid-history-updated-final-state",
    { width: 390, height: 844 },
  ],
];
// The targeted command is deliberately static: the dynamic 409 story remains
// available for behavior inspection but is never a visual-capture input.
const shots = process.argv.includes("--raid-history")
  ? allShots.filter(([, id]) =>
      id.startsWith("ui-audit-civilization--raid-history-"),
    )
  : allShots;
for (const [name, id, viewport] of shots) {
  const page = await browser.newPage({ viewport });
  let screenshotTaken = false;
  await page.goto(`http://127.0.0.1:6006/iframe.html?id=${id}&viewMode=story`, {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  if (viewport.zoom)
    await page.evaluate(
      (zoom) => (document.body.style.zoom = zoom),
      viewport.zoom,
    );
  if (id === "ui-audit-civilization--raid-history-loaded")
    await page
      .locator('.raid-history[data-raid-history-status="ready"]')
      .waitFor();
  if (id === "ui-audit-civilization--raid-history-updated-final-state")
    await page
      .locator(
        '.raid-history[data-raid-history-status="ready"][data-raid-history-updated="true"]',
      )
      .waitFor();
  if (
    id === "ui-audit-civilization--raid-history-loaded" ||
    id === "ui-audit-civilization--raid-history-updated-final-state"
  ) {
    await page.evaluate(async () => {
      await document.fonts.ready;
      const snapshot = () => {
        const history = document.querySelector(".raid-history");
        const sendRaid = document.querySelector("#send-raid");
        const result = document.querySelector(".raid-result");
        if (!history || !sendRaid || !result) return null;
        const rect = (element) => {
          const { width, height } = element.getBoundingClientRect();
          return { width, height };
        };
        const reports = Array.from(
          history.querySelectorAll(".raid-history-report"),
          (report) => ({
            ...rect(report),
            clipped: report.scrollHeight > report.clientHeight + 1,
          }),
        );
        const geometry = {
          history: rect(history),
          sendRaid: rect(sendRaid),
          result: rect(result),
          reports,
          sendRaidText: sendRaid.textContent?.trim(),
          resultText: result.textContent?.trim(),
        };
        const sensible =
          geometry.history.width >= 280 &&
          geometry.sendRaid.width >= 280 &&
          geometry.sendRaid.height >= 44 &&
          geometry.result.width >= 280 &&
          geometry.result.height >= 44 &&
          Boolean(geometry.sendRaidText) &&
          Boolean(geometry.resultText) &&
          reports.length > 0 &&
          reports.every(
            (report) =>
              report.width >= 280 && report.height >= 44 && !report.clipped,
          );
        return sensible ? JSON.stringify(geometry) : null;
      };
      let stableFrames = 0;
      let previous = null;
      await new Promise((resolve, reject) => {
        const deadline = performance.now() + 5_000;
        const check = () => {
          const current = snapshot();
          stableFrames = current && current === previous ? stableFrames + 1 : 0;
          previous = current;
          if (stableFrames >= 10) return resolve(undefined);
          if (performance.now() >= deadline)
            return reject(
              new Error(
                "Raid history did not reach a stable, readable mobile layout",
              ),
            );
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      });
    });
    const layout = await page.evaluate(() => {
      const history = document.querySelector(".raid-history");
      const sendRaid = document.querySelector("#send-raid");
      const result = document.querySelector(".raid-result");
      if (!history || !sendRaid || !result)
        throw new Error("Missing raid-history audit fixture");
      const rect = (element) => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      };
      return {
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        actions: Array.from(history.querySelectorAll("button"), rect),
        loadMoreActions: Array.from(
          history.querySelectorAll(".raid-history-more"),
          rect,
        ),
        sendRaid: rect(sendRaid),
        result: rect(result),
        reports: Array.from(
          history.querySelectorAll(".raid-history-report"),
          (report) => ({
            ...rect(report),
            clipped: report.scrollHeight > report.clientHeight + 1,
          }),
        ),
        status: history.querySelector(".raid-history-status")?.textContent,
      };
    });
    if (layout.scrollWidth > layout.viewportWidth)
      throw new Error("Mobile raid history has horizontal overflow");
    if (
      id === "ui-audit-civilization--raid-history-loaded" &&
      (layout.actions.length !== 1 || layout.loadMoreActions.length !== 1)
    )
      throw new Error(
        "Loaded mobile raid history must expose one load-more action",
      );
    if (
      layout.actions.some((action) => action.width < 44 || action.height < 44)
    )
      throw new Error("Raid history action is smaller than 44px");
    if (
      layout.sendRaid.width < 280 ||
      layout.sendRaid.height < 44 ||
      layout.result.width < 280 ||
      layout.result.height < 44 ||
      !layout.reports.length ||
      layout.reports.some(
        (report) => report.width < 280 || report.height < 44 || report.clipped,
      )
    )
      throw new Error("Raid history mobile layout is collapsed or clipped");
    if (
      id === "ui-audit-civilization--raid-history-updated-final-state" &&
      (!layout.status?.trim() || layout.loadMoreActions.length !== 0)
    )
      throw new Error(
        "Updated raid history must visibly show the reset page after 409",
      );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const gameShell = page.locator(".game-shell");
    const raidPanel = page.locator(".command-panel");
    if ((await gameShell.count()) !== 1 || (await raidPanel.count()) !== 1)
      throw new Error("Raid history audit fixture must expose one game shell");
    await raidPanel.screenshot({ path: join(visualReview, name) });
    screenshotTaken = true;
  }
  if (id.includes("footer")) {
    const layout = await page.evaluate(() => {
      const rect = (element) => {
        const { top, right, bottom, left, width, height } =
          element.getBoundingClientRect();
        return { top, right, bottom, left, width, height };
      };
      const footer = document.querySelector(".game-footer");
      const nav = document.querySelector(".mobile-hud");
      if (!footer || !nav) throw new Error("Missing footer audit fixture");
      return {
        footer: rect(footer),
        nav: rect(nav),
        resetButtons: Array.from(footer.querySelectorAll("button"), rect),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });
    if (layout.scrollWidth > layout.viewportWidth)
      throw new Error("Footer has horizontal overflow");
    if (layout.footer.bottom > layout.nav.top)
      throw new Error("Footer is obstructed by bottom navigation");
    if (id.includes("demo-footer")) {
      if (layout.resetButtons.length !== 1)
        throw new Error("Demo footer must expose exactly one reset action");
      if (
        layout.resetButtons[0].width < 44 ||
        layout.resetButtons[0].height < 44
      )
        throw new Error("Footer reset action is smaller than 44px");
      const focus = await page.evaluate(() => {
        const button = document.querySelector(".game-footer button");
        if (!(button instanceof HTMLButtonElement))
          throw new Error("Missing demo footer reset button");
        button.focus();
        return {
          focused: document.activeElement === button,
          outlineStyle: getComputedStyle(button).outlineStyle,
        };
      });
      if (!focus.focused || focus.outlineStyle === "none")
        throw new Error("Footer reset has no visible keyboard focus");
    } else if (layout.resetButtons.length !== 0) {
      throw new Error("World footer must not expose reset");
    }
    footerMeasurements.push({
      name,
      viewport,
      footerBottom: layout.footer.bottom,
      mobileNavTop: layout.nav.top,
      resetTargets: layout.resetButtons,
      scrollWidth: layout.scrollWidth,
      viewportWidth: layout.viewportWidth,
    });
  }
  if (id === "ui-audit-civilization--mobile-village-build-navigation") {
    await page
      .locator(
        '[data-game-command-navigation="mobile"] [data-command-panel="build"]',
      )
      .click();
    await page.waitForFunction(
      () => document.activeElement?.id === "game-command-panel",
    );
    const layout = await page.evaluate(() => {
      const panel = document.querySelector("#game-command-panel");
      const heading = panel?.querySelector(".inspector-title h2");
      const hud = document.querySelector(".hud");
      const nav = document.querySelector(".mobile-hud");
      if (!(panel instanceof HTMLElement) || !heading || !hud || !nav)
        throw new Error("Missing Village/Build mobile navigation fixture");
      const rect = (element) => {
        const { top, right, bottom, left, width, height } =
          element.getBoundingClientRect();
        return { top, right, bottom, left, width, height };
      };
      const headingRect = heading.getBoundingClientRect();
      const hit = document.elementFromPoint(
        headingRect.left + headingRect.width / 2,
        headingRect.top + headingRect.height / 2,
      );
      return {
        focused: document.activeElement === panel,
        heading: rect(heading),
        hud: rect(hud),
        headingHitIsHud: Boolean(hit?.closest(".hud")),
        headingHitIsNav: Boolean(hit?.closest(".mobile-hud button")),
        mobileNav: rect(nav),
        navControls: Array.from(nav.querySelectorAll("button"), rect),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });
    if (!layout.focused)
      throw new Error("Mobile navigation did not focus the command panel");
    if (layout.scrollWidth > layout.viewportWidth)
      throw new Error(
        "Village/Build mobile navigation has horizontal overflow",
      );
    if (
      layout.heading.top < layout.hud.bottom ||
      layout.heading.bottom > layout.mobileNav.top ||
      layout.headingHitIsHud ||
      layout.headingHitIsNav
    )
      throw new Error(
        "Visible BuildPanel heading is covered by sticky HUD or bottom navigation",
      );
    if (
      layout.navControls.some(
        (control) => control.width < 44 || control.height < 44,
      )
    )
      throw new Error("Bottom navigation control is smaller than 44px");
    await page.screenshot({ path: join(output, name) });
    screenshotTaken = true;
  }
  if (id === "ui-audit-civilization--stable-game-shell-frame-mobile") {
    const layout = await page.evaluate(() => ({
      entryGuide: Boolean(document.querySelector("[data-entry-guide]")),
      mobileNavigation: Boolean(
        document.querySelector('[data-game-command-navigation="mobile"]'),
      ),
      buildPanel: Boolean(document.querySelector("[data-game-build-panel]")),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    if (!layout.entryGuide || !layout.mobileNavigation || !layout.buildPanel)
      throw new Error("Stable GameShellFrame is missing its mobile landmarks");
    if (layout.scrollWidth > layout.viewportWidth)
      throw new Error("Stable GameShellFrame has horizontal overflow");
  }
  if (
    id === "ui-audit-civilization--village-appearance-dusk-settings" ||
    id === "ui-audit-civilization--village-appearance-dawn-settings"
  ) {
    const layout = await page.evaluate(() => {
      const dialog = document.querySelector(".settings-dialog");
      const select = document.querySelector("#village-appearance");
      const actions = Array.from(
        document.querySelectorAll(".settings-appearance-actions button"),
      );
      const apply = document.querySelector(".settings-primary-action");
      const reset = document.querySelector(".settings-appearance-reset");
      if (
        !dialog ||
        !(select instanceof HTMLSelectElement) ||
        actions.length !== 2 ||
        !(apply instanceof HTMLButtonElement) ||
        !(reset instanceof HTMLButtonElement) ||
        actions[0] !== apply ||
        actions[1] !== reset
      )
        throw new Error("Missing village appearance settings audit fixture");
      const rect = (element) => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      };
      return {
        dialog: rect(dialog),
        select: rect(select),
        actions: actions.map(rect),
        apply: {
          background: getComputedStyle(apply).backgroundImage,
          focus: (() => {
            apply.focus();
            return document.activeElement === apply
              ? getComputedStyle(apply).outlineStyle
              : "none";
          })(),
        },
        reset: {
          background: getComputedStyle(reset).backgroundImage,
          focus: (() => {
            reset.focus();
            return document.activeElement === reset
              ? getComputedStyle(reset).outlineStyle
              : "none";
          })(),
        },
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });
    if (layout.scrollWidth > layout.viewportWidth)
      throw new Error("Village appearance settings have horizontal overflow");
    if (
      layout.dialog.width <= 0 ||
      layout.select.width <= 0 ||
      layout.select.height < 44 ||
      layout.actions.some((action) => action.width <= 0 || action.height < 44)
    )
      throw new Error(
        "Village appearance select or Apply/Reset action is not a readable 44px target",
      );
    if (
      layout.apply.background === "none" ||
      layout.reset.background !== "none"
    )
      throw new Error(
        "Village appearance Apply must be visually primary and Reset visually secondary",
      );
    if (layout.apply.focus === "none" || layout.reset.focus === "none")
      throw new Error(
        "Village appearance actions have no visible keyboard focus",
      );
    await page.screenshot({ path: join(visualReview, name), fullPage: true });
    screenshotTaken = true;
  }
  if (id === "ui-audit-civilization--resource-status-header") {
    const layout = await page.evaluate(() => {
      const rect = (element) => {
        const { top, right, bottom, left, width, height } =
          element.getBoundingClientRect();
        return { top, right, bottom, left, width, height };
      };
      const hud = document.querySelector(".resource-hud");
      const settings = document.querySelector(".resource-settings");
      if (!hud || !settings) throw new Error("Missing resource header fixture");
      return {
        resources: Array.from(
          hud.querySelectorAll(".resource"),
          (resource) => ({
            id: resource.getAttribute("data-resource"),
            rect: rect(resource),
            content: Array.from(
              resource.querySelectorAll(
                "img, .asset-icon-fallback, .resource-values, .resource-values *, .resource-production, .resource-production *",
              ),
              (element) => ({
                name: element.className || element.tagName,
                rect: rect(element),
                visible: element.checkVisibility(),
              }),
            ),
          }),
        ),
        settings: rect(settings),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });
    const distinctPositions = (values) =>
      values.reduce(
        (positions, value) =>
          positions.some((position) => Math.abs(position - value) < 1)
            ? positions
            : [...positions, value],
        [],
      );
    const rows = distinctPositions(
      layout.resources.map(({ rect }) => rect.top),
    );
    const columns = distinctPositions(
      layout.resources.map(({ rect }) => rect.left),
    );
    if (layout.resources.length !== 4)
      throw new Error("Resource header must show four resources");
    if (layout.scrollWidth > layout.viewportWidth)
      throw new Error("Resource header has horizontal overflow");
    if (layout.settings.width < 44 || layout.settings.height < 44)
      throw new Error("Resource settings control is smaller than 44px");
    for (const resource of layout.resources) {
      for (const content of resource.content) {
        if (
          content.visible &&
          (content.rect.left < resource.rect.left - 0.5 ||
            content.rect.right > resource.rect.right + 0.5 ||
            content.rect.top < resource.rect.top - 0.5 ||
            content.rect.bottom > resource.rect.bottom + 0.5)
        )
          throw new Error(
            `Resource ${resource.id} ${content.name} extends outside its tile`,
          );
      }
    }
    if (viewport.width <= 220) {
      if (rows.length !== 2 || columns.length !== 2)
        throw new Error("Narrow resource header must use a two-by-two grid");
      if (
        rows.some(
          (row) =>
            layout.resources.filter(({ rect }) => Math.abs(rect.top - row) < 1)
              .length !== 2,
        )
      )
        throw new Error(
          "Narrow resource header rows must each contain two resources",
        );
    } else if (rows.length !== 1 || columns.length !== 4) {
      throw new Error(
        "Normal-width resource header must keep one row of four resources",
      );
    }
    resourceHeaderMeasurements.push({
      name,
      viewport,
      rows: rows.length,
      columns: columns.length,
      resources: layout.resources.map(({ id, rect }) => ({ id, rect })),
      settings: layout.settings,
      scrollWidth: layout.scrollWidth,
      viewportWidth: layout.viewportWidth,
    });
  }
  if (id === "ui-audit-civilization--completion-ready-notice-visible") {
    const notice = page.locator(".completion-ready-notice");
    const button = notice.getByRole("button", { name: "Open build plan" });
    if ((await notice.count()) !== 1 || (await button.count()) !== 1)
      throw new Error("Completion notice audit fixture is incomplete");
    const box = await button.boundingBox();
    if (!box || box.height < 44)
      throw new Error("Completion notice action is smaller than 44px");
    await button.click();
    if (!(await notice.isVisible()))
      throw new Error(
        "Inert completion notice action unexpectedly changed the fixture",
      );
  }
  if (id === "ui-audit-civilization--army-training-quantity-choice") {
    await page.locator('[data-training-amount="spear"]').fill("3");
    const total = await page
      .locator('[data-training-total="spear"]')
      .textContent();
    if (!total?.includes("60 W") || !total.includes("30 C"))
      throw new Error(
        "Selected training quantity did not show multiplied costs",
      );
  }
  if (id.startsWith("ui-audit-civilization--army-training-")) {
    const layout = await page.evaluate(() => {
      const rect = (element) => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      };
      return {
        buttons: Array.from(
          document.querySelectorAll(".training-submit"),
          rect,
        ),
        inputs: Array.from(
          document.querySelectorAll("[data-training-amount]"),
          rect,
        ),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });
    if (layout.scrollWidth > layout.viewportWidth)
      throw new Error("Mobile training flow has horizontal overflow");
    if (id !== "ui-audit-civilization--army-training-review-summary") {
      if (!layout.buttons.length || !layout.inputs.length)
        throw new Error("Mobile training state is missing its controls");
      if (
        layout.buttons.some((button) => button.width < 44 || button.height < 44)
      )
        throw new Error("Training primary action is smaller than 44px");
      if (layout.inputs.some((input) => input.height < 44))
        throw new Error("Training quantity input is smaller than 44px");
    }
  }
  if (id === "ui-audit-civilization--mobile-collection-wayfinding") {
    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const { top, right, bottom, left, width, height } =
          element.getBoundingClientRect();
        return { top, right, bottom, left, width, height };
      };
      const gather = document.querySelector("#gather");
      if (!gather) throw new Error("Missing #gather");
      const gatherBounds = gather.getBoundingClientRect();
      return {
        gatherCount: document.querySelectorAll("#gather").length,
        gather: rect("#gather"),
        buildings: Array.from(
          document.querySelectorAll(".map-building"),
          (building) => ({
            id:
              building.getAttribute("data-map-building") ||
              building.getAttribute("data-map-panel") ||
              "unknown",
            rect: (() => {
              const { top, right, bottom, left, width, height } =
                building.getBoundingClientRect();
              return { top, right, bottom, left, width, height };
            })(),
          }),
        ),
        gatherHit:
          document
            .elementFromPoint(
              gatherBounds.left + gatherBounds.width / 2,
              gatherBounds.top + gatherBounds.height / 2,
            )
            ?.closest("#gather") === gather,
        title: rect(".map-head"),
        selectedLabel: rect(".map-building.is-selected span"),
        mobileNav: rect(".mobile-hud"),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });
    const overlaps = (first, second) =>
      first.left < second.right &&
      first.right > second.left &&
      first.top < second.bottom &&
      first.bottom > second.top;
    if (layout.gatherCount !== 1)
      throw new Error(
        `Expected one map collect control, got ${layout.gatherCount}`,
      );
    if (overlaps(layout.selectedLabel, layout.title))
      throw new Error("Selected map-building label overlaps village metadata");
    if (layout.scrollWidth > layout.viewportWidth)
      throw new Error("Mobile village map has horizontal overflow");
    if (overlaps(layout.gather, layout.title))
      throw new Error("Map collect control overlaps the village title");
    if (layout.gather.width < 44 || layout.gather.height < 44)
      throw new Error("Map collect control is smaller than 44px");
    if (overlaps(layout.gather, layout.mobileNav))
      throw new Error("Map collect control is obstructed by bottom navigation");
    const blockedBuilding = layout.buildings.find((building) =>
      overlaps(layout.gather, building.rect),
    );
    if (blockedBuilding)
      throw new Error(
        `Map collect control overlaps ${blockedBuilding.id} building hit target`,
      );
    if (!layout.gatherHit)
      throw new Error("Map collect control center is not hit-testable");
  }
  if (id === "ui-audit-civilization--world-market-mobile") {
    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const { top, right, bottom, left, width, height } =
          element.getBoundingClientRect();
        return { top, right, bottom, left, width, height };
      };
      const details = document.querySelector(".market-liquidity-disclosure");
      const summary = document.querySelector(
        ".market-liquidity-disclosure summary",
      );
      if (!(details instanceof HTMLDetailsElement) || !summary)
        throw new Error("Missing native market liquidity disclosure");
      return {
        closed: !details.open,
        detailHidden:
          !details.open && !details.querySelector("small")?.checkVisibility(),
        summary: rect(".market-liquidity-disclosure summary"),
        resourceCards: rect(".market-resource-cards"),
        amount: rect("#market-amount"),
        quote: rect("#market-quote"),
        mobileNav: rect(".mobile-hud"),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });
    const isVisible = (rect) => rect.top >= 0 && rect.bottom <= viewport.height;
    const overlaps = (first, second) =>
      first.left < second.right &&
      first.right > second.left &&
      first.top < second.bottom &&
      first.bottom > second.top;
    if (!layout.closed || !layout.detailHidden)
      throw new Error("Market liquidity detail must be closed by default");
    if (layout.summary.height < 44)
      throw new Error("Market liquidity summary is smaller than 44px");
    if (
      ![
        layout.summary,
        layout.resourceCards,
        layout.amount,
        layout.quote,
      ].every(isVisible)
    )
      throw new Error(
        "Market summary or quote controls are not visible without opening",
      );
    if (layout.scrollWidth > layout.viewportWidth)
      throw new Error("World market has horizontal overflow");
    if (
      [layout.summary, layout.resourceCards, layout.amount, layout.quote].some(
        (rect) => overlaps(rect, layout.mobileNav),
      )
    )
      throw new Error("World market controls collide with bottom navigation");
    const summary = page.locator(".market-liquidity-disclosure summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    const opened = await page.evaluate(() => {
      const details = document.querySelector(".market-liquidity-disclosure");
      const detail = details?.querySelector("small");
      return (
        details instanceof HTMLDetailsElement &&
        details.open &&
        detail?.checkVisibility()
      );
    });
    if (!opened)
      throw new Error(
        "Opening market disclosure did not expose fee/reserve detail",
      );
    await page.keyboard.press("Enter");
  }
  if (id === "ui-audit-civilization--mobile-build-action-focus") {
    await page.locator(".entry-guide-primary").click();
    await page.locator("[data-entry-guide]").waitFor({ state: "detached" });
    if (await page.locator("[data-entry-guide]").count())
      throw new Error("Primary guide route did not dismiss the entry guide");
    const layout = await page.evaluate(() => {
      const action = document.querySelector(
        '[data-next-action-button="complete"]',
      );
      const nav = document.querySelector(".mobile-hud");
      const panel = document.querySelector("[data-build-action-focus-panel]");
      if (!(action instanceof HTMLElement) || !nav || !panel)
        throw new Error("Missing composed mobile BuildPanel focus fixture");
      const rect = (element) => {
        const { top, right, bottom, left, width, height } =
          element.getBoundingClientRect();
        return { top, right, bottom, left, width, height };
      };
      action.blur();
      action.focus();
      return {
        action: rect(action),
        mobileNav: rect(nav),
        panel: rect(panel),
        focused: document.activeElement === action,
        navControls: Array.from(nav.querySelectorAll("button"), rect),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });
    if (layout.scrollWidth > layout.viewportWidth)
      throw new Error("Composed mobile BuildPanel has horizontal overflow");
    if (!layout.focused)
      throw new Error("Next-action route did not focus the BuildPanel action");
    if (layout.action.bottom > layout.mobileNav.top)
      throw new Error(
        "Focused BuildPanel action is hidden by bottom navigation",
      );
    if (
      layout.navControls.some(
        (control) => control.width < 44 || control.height < 44,
      )
    )
      throw new Error("Bottom navigation control is smaller than 44px");
    await page.screenshot({ path: join(output, name) });
    screenshotTaken = true;
  }
  if (
    id === "ui-audit-civilization--construction-ready" ||
    id === "ui-audit-civilization--next-action-blocked"
  ) {
    const disclosure = await page.locator(".next-task-details > summary");
    const label = (await disclosure.textContent())?.trim() || "";
    const box = await disclosure.boundingBox();
    if (!label.includes("COSTS") || !label.includes("REQUIREMENTS"))
      throw new Error("Build-detail disclosure label is not specific enough");
    if (!box || box.height < 44)
      throw new Error("Build-detail disclosure target is smaller than 44px");
  }
  if (id === "ui-audit-civilization--mobile-collection-guide") {
    const layout = await page.evaluate(() => {
      const guide = document.querySelector("[data-entry-guide]");
      const dismiss = document.querySelector(".entry-guide-dismiss");
      const gather = document.querySelector("#gather");
      const nav = document.querySelector(".mobile-hud");
      if (!guide || !dismiss || !gather || !nav)
        throw new Error("Missing composed collection guide controls");
      const rect = (element) => {
        const { top, right, bottom, left, width, height } =
          element.getBoundingClientRect();
        return { top, right, bottom, left, width, height };
      };
      return {
        guideWidth: rect(guide).width,
        viewportWidth: window.innerWidth,
        primaryCount: document.querySelectorAll(".entry-guide-primary").length,
        dismiss: rect(dismiss),
        gather: rect(gather),
        gatherHit:
          document
            .elementFromPoint(
              gather.getBoundingClientRect().left +
                gather.getBoundingClientRect().width / 2,
              gather.getBoundingClientRect().top +
                gather.getBoundingClientRect().height / 2,
            )
            ?.closest("#gather") === gather,
        mobileNav: rect(nav),
        navControls: Array.from(nav.querySelectorAll("button"), rect),
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    if (
      layout.scrollWidth > layout.viewportWidth ||
      layout.guideWidth > layout.viewportWidth
    )
      throw new Error("Entry guide has horizontal overflow");
    if (layout.primaryCount !== 0)
      throw new Error(
        "Visible map collect action must not have a redundant guide action",
      );
    if (
      layout.dismiss.width < 44 ||
      layout.dismiss.height < 44 ||
      layout.gather.width < 44 ||
      layout.gather.height < 44
    )
      throw new Error("Collection guide controls are smaller than 44px");
    if (layout.gather.bottom > layout.mobileNav.top)
      throw new Error(
        "Visible map collect action is obstructed by bottom navigation",
      );
    if (!layout.gatherHit)
      throw new Error("Visible map collect action center is not hit-testable");
    if (
      layout.navControls.some(
        (control) => control.width < 44 || control.height < 44,
      )
    )
      throw new Error("Bottom navigation control is smaller than 44px");
    mobileAuditMeasurements.push({
      name,
      viewport,
      dismissTarget: layout.dismiss,
    });
    await page.screenshot({ path: join(output, name), fullPage: true });
    screenshotTaken = true;
    await page.locator(".entry-guide-dismiss").focus();
    await page.keyboard.press("Enter");
    if (await page.locator("[data-entry-guide]").count())
      throw new Error(
        "Entry guide dismissal did not remove the guide for this render session",
      );
  }
  if (id === "ui-audit-civilization--bottom-navigation") {
    const layout = await page.evaluate(() => {
      const nav = document.querySelector(".mobile-hud");
      if (!nav) throw new Error("Missing mobile navigation fixture");
      const rect = (element) => {
        const { top, right, bottom, left, width, height } =
          element.getBoundingClientRect();
        return { top, right, bottom, left, width, height };
      };
      return {
        controls: Array.from(nav.querySelectorAll("button"), rect),
        labels: Array.from(
          nav.querySelectorAll(".command-nav-label"),
          (label) => ({
            display: getComputedStyle(label).display,
            rect: rect(label),
          }),
        ),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });
    const overlaps = (first, second) =>
      first.left < second.right &&
      first.right > second.left &&
      first.top < second.bottom &&
      first.bottom > second.top;
    if (layout.scrollWidth > layout.viewportWidth)
      throw new Error("Mobile navigation has horizontal overflow");
    if (layout.controls.length !== 4)
      throw new Error("Mobile navigation is missing controls");
    if (
      layout.controls.some(
        (control) => control.width < 44 || control.height < 44,
      )
    )
      throw new Error("Mobile navigation control is smaller than 44px");
    const labelsHidden = viewport.width <= 220;
    if (
      layout.labels.some((label) => (label.display === "none") !== labelsHidden)
    )
      throw new Error(
        labelsHidden
          ? "Extreme-width mobile navigation labels are not hidden"
          : "Normal-width mobile navigation labels are hidden",
      );
    if (
      layout.labels.some((label, index) =>
        layout.labels
          .slice(index + 1)
          .some((other) => overlaps(label.rect, other.rect)),
      )
    )
      throw new Error("Mobile navigation labels collide");
    mobileAuditMeasurements.push({
      name,
      viewport,
      controls: layout.controls,
      labelDisplays: layout.labels.map((label) => label.display),
      scrollWidth: layout.scrollWidth,
      viewportWidth: layout.viewportWidth,
    });
  }
  if (!screenshotTaken)
    await page.screenshot({ path: join(output, name), fullPage: true });
  await page.close();
}
await browser.close();
await new Promise((resolve) => server.close(resolve));
console.log("Footer audit measurements:");
console.log(JSON.stringify(footerMeasurements));
console.log("Mobile audit measurements:");
console.log(JSON.stringify(mobileAuditMeasurements));
console.log("Resource header audit measurements:");
console.log(JSON.stringify(resourceHeaderMeasurements));
