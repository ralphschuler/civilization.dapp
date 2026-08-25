import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "@playwright/test";

const output = join(process.cwd(), "artefacts", "storybook-ui-audit");
const root = join(output, "storybook-static");
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
const browser = await chromium.launch({ headless: true });
const shots = [
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
    "mobile-bottom-navigation-390.png",
    "ui-audit-civilization--bottom-navigation",
    { width: 390, height: 844 },
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
];
for (const [name, id, viewport] of shots) {
  const page = await browser.newPage({ viewport });
  let screenshotTaken = false;
  await page.goto(`http://127.0.0.1:6006/iframe.html?id=${id}&viewMode=story`, {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => window.scrollTo(0, 0));
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
        dismissHeight: rect(dismiss).height,
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
      layout.dismissHeight < 44 ||
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
    await page.screenshot({ path: join(output, name), fullPage: true });
    screenshotTaken = true;
    await page.locator(".entry-guide-dismiss").focus();
    await page.keyboard.press("Enter");
    if (await page.locator("[data-entry-guide]").count())
      throw new Error(
        "Entry guide dismissal did not remove the guide for this render session",
      );
  }
  if (!screenshotTaken)
    await page.screenshot({ path: join(output, name), fullPage: true });
  await page.close();
}
await browser.close();
await new Promise((resolve) => server.close(resolve));
