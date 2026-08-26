import { expect, test, type Page } from "@playwright/test";

const event = {
  kind: "raid_resolved",
  role: "attacker",
  counterparty: "0x2222222222222222222222222222222222222222",
  attackerWon: true,
  attack: "42",
  defense: "30",
  resources: { wood: "12", clay: "0", stone: "0", gold: "0" },
  blockNumber: "123",
  blockTimestamp: "2026-08-26T10:00:00.000Z",
  transactionHash: `0x${"a".repeat(64)}`,
  logIndex: 3,
};

async function mount(
  page: Page,
  responses: Array<{ status?: number; body?: unknown }>,
) {
  let call = 0;
  const requests: string[] = [];
  await page.route("**/api/history/raids?*", async (route) => {
    requests.push(route.request().url());
    const response = responses[Math.min(call, responses.length - 1)];
    call += 1;
    await route.fulfill({
      status: response.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(response.body ?? {}),
    });
  });
  await page.goto("/?raidHistoryE2e=reports");
  await expect(page.getByTestId("raid-history-e2e-harness")).toBeVisible();
  return requests;
}

test("private raid history is mobile and keyboard reachable with mocked same-origin pages", async ({
  page,
}) => {
  await mount(page, [
    {
      body: {
        availability: "stored_finalized_events",
        coverage: { complete: false },
        events: [event],
        nextCursor: "opaque-cursor",
      },
    },
    {
      body: {
        availability: "stored_finalized_events",
        coverage: { complete: false },
        events: [],
        nextCursor: null,
      },
    },
  ]);
  await expect(page.getByText("FINALISIERTE BERICHTE")).toBeVisible();
  await expect(page.getByText("0x2222…2222")).toBeVisible();
  await expect(page.getByText(event.counterparty)).toHaveCount(0);
  const more = page.getByRole("button", { name: "Mehr laden" });
  await more.focus();
  await expect(more).toBeFocused();
  const box = await more.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Enter");
  await expect(more).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator("html")
      .evaluate((node) => node.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("a changed cursor clears the stale page and reloads the first snapshot once", async ({
  page,
}) => {
  await mount(page, [
    {
      body: {
        availability: "stored_finalized_events",
        coverage: { complete: false },
        events: [event],
        nextCursor: "opaque-cursor",
      },
    },
    { status: 409 },
    {
      body: {
        availability: "stored_finalized_events",
        coverage: { complete: false },
        events: [],
        nextCursor: null,
      },
    },
  ]);
  await page.getByRole("button", { name: "Mehr laden" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Verlauf wurde aktualisiert",
  );
  await expect(
    page.locator('.raid-history[data-raid-history-status="empty"]'),
  ).toBeVisible();
});

test("a 401 atomically removes stale reports and pagination", async ({
  page,
}) => {
  await mount(page, [
    {
      body: {
        availability: "stored_finalized_events",
        coverage: { complete: false },
        events: [event],
        nextCursor: "opaque-cursor",
      },
    },
    { status: 401 },
  ]);
  await expect(page.getByText("0x2222…2222")).toBeVisible();
  await page.getByRole("button", { name: "Mehr laden" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Sitzung ist abgelaufen",
  );
  await expect(page.getByText("0x2222…2222")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mehr laden" })).toHaveCount(0);
});

test("a 503 while loading more atomically clears stale reports and exposes only retry", async ({
  page,
}) => {
  const requests = await mount(page, [
    {
      body: {
        availability: "stored_finalized_events",
        coverage: { complete: false },
        events: [event],
        nextCursor: "opaque-cursor",
      },
    },
    { status: 503 },
    {
      body: {
        availability: "stored_finalized_events",
        coverage: { complete: false },
        events: [event],
        nextCursor: null,
      },
    },
  ]);
  const history = page.locator(".raid-history");
  await page.getByRole("button", { name: "Mehr laden" }).click();
  await expect(history.getByRole("status")).toContainText("nicht verfügbar");
  await expect(page.getByText("0x2222…2222")).toHaveCount(0);
  await expect(history.getByRole("button", { name: "Mehr laden" })).toHaveCount(
    0,
  );
  const retry = history.getByRole("button", { name: "Berichte erneut laden" });
  await expect(retry).toHaveCount(1);
  await expect(history.getByRole("button")).toHaveCount(1);
  await retry.click();
  await expect(page.getByText("0x2222…2222")).toBeVisible();
  expect(new URL(requests[2]).searchParams.has("cursor")).toBe(false);
});

test("unavailable reports expose one keyboard-reachable retry of the first page", async ({
  page,
}) => {
  const requests = await mount(page, [
    { status: 503 },
    {
      body: {
        availability: "stored_finalized_events",
        coverage: { complete: false },
        events: [event],
        nextCursor: null,
      },
    },
  ]);
  const history = page.locator(".raid-history");
  const retry = history.getByRole("button", { name: "Berichte erneut laden" });
  await expect(history.getByRole("button")).toHaveCount(1);
  await expect(retry).toBeVisible();
  const box = await retry.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("0x2222…2222")).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(new URL(requests[1]).searchParams.has("cursor")).toBe(false);
});
