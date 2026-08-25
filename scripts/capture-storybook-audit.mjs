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
    "mobile-next-action-blocked-390.png",
    "ui-audit-civilization--next-action-blocked",
    { width: 390, height: 844 },
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
];
for (const [name, id, viewport] of shots) {
  const page = await browser.newPage({ viewport });
  await page.goto(`http://127.0.0.1:6006/iframe.html?id=${id}&viewMode=story`, {
    waitUntil: "networkidle",
  });
  if (id === "ui-audit-civilization--mobile-collection-wayfinding") {
    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const { top, right, bottom, left, width, height } =
          element.getBoundingClientRect();
        return { top, right, bottom, left, width, height };
      };
      return {
        gatherCount: document.querySelectorAll("#gather").length,
        gather: rect("#gather"),
        title: rect(".map-head"),
        mobileNav: rect(".mobile-hud"),
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
    if (overlaps(layout.gather, layout.title))
      throw new Error("Map collect control overlaps the village title");
    if (layout.gather.width < 44 || layout.gather.height < 44)
      throw new Error("Map collect control is smaller than 44px");
    if (overlaps(layout.gather, layout.mobileNav))
      throw new Error("Map collect control is obstructed by bottom navigation");
  }
  await page.screenshot({ path: join(output, name), fullPage: true });
  await page.close();
}
await browser.close();
await new Promise((resolve) => server.close(resolve));
