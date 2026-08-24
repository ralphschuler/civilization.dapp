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
    "mobile-resource-header-390.png",
    "ui-audit-civilization--resource-status-header",
    { width: 390, height: 844 },
  ],
];
for (const [name, id, viewport] of shots) {
  const page = await browser.newPage({ viewport });
  await page.goto(`http://127.0.0.1:6006/iframe.html?id=${id}&viewMode=story`, {
    waitUntil: "networkidle",
  });
  await page.screenshot({ path: join(output, name), fullPage: true });
  await page.close();
}
await browser.close();
await new Promise((resolve) => server.close(resolve));
