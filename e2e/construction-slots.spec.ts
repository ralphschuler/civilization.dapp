import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
async function mountPanel(
  page: Page,
  scenario: "one-job" | "two-jobs" | "ready-with-claimable" | "impact",
) {
  await page.goto(`/?buildPanelE2e=${scenario}`);
  await expect(page.getByTestId("build-panel-e2e-harness")).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  expect(
    await page
      .locator("html")
      .evaluate((node) => node.scrollWidth <= window.innerWidth),
  ).toBe(true);
}

test("ready construction remains directly completable when field resources are claimable", async ({
  page,
}) => {
  await mountPanel(page, "ready-with-claimable");
  const job = page.locator(
    '[data-construction-job][data-construction-slot="0"]',
  );
  const complete = job.getByRole("button", {
    name: "Ausbau abschließen",
    exact: true,
  });

  await expect(complete).toBeEnabled();
  await expect(
    page.locator('[data-next-action-button="complete"]'),
  ).toHaveCount(0);
  await complete.click();
  await expect(page.getByTestId("build-panel-completions")).toHaveText("0");
  await expect(page.getByTestId("build-panel-gathers")).toHaveText("0");
});

test("workshop 11 with one job retains a keyboard-reachable start composer at 320px and 390px", async ({
  page,
}) => {
  await mountPanel(page, "one-job");
  await expect(page.locator("[data-construction-job]")).toHaveCount(1);
  const start = page.locator('[data-building="timber"]');
  const recommendation = page.locator('[data-next-action="upgrade"]');
  const details = page.locator("details.next-task-details");
  await expect(recommendation).toBeVisible();
  await expect(recommendation).toHaveAccessibleName(/NÄCHSTE AKTION/);
  await expect(details).toHaveCount(1);
  await expect(details).not.toHaveAttribute("open", "");
  await expect(start).toBeEnabled();
  for (const width of [320, 390]) await expectNoHorizontalOverflow(page, width);

  await start.focus();
  await expect(start).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("build-panel-upgrade-starts")).toHaveText("1");

  const results = await new AxeBuilder({ page })
    .include(".next-action")
    .analyze();
  expect(
    results.violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    ),
  ).toEqual([]);
});

test("workshop 21 with two jobs preserves each slot and a keyboard-reachable start composer", async ({
  page,
}) => {
  await mountPanel(page, "two-jobs");
  await expect(
    page.locator('[data-construction-job][data-construction-slot="0"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-construction-job][data-construction-slot="1"]'),
  ).toHaveCount(1);
  const start = page.locator('[data-building="timber"]');
  await expect(start).toBeEnabled();
  for (const width of [320, 390]) await expectNoHorizontalOverflow(page, width);

  await start.focus();
  await expect(start).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("build-panel-upgrade-starts")).toHaveText("1");
});

test("upgrade impact comparison stays accessible and responsive at mobile widths and 200% zoom", async ({
  page,
}) => {
  await mountPanel(page, "impact");
  const impactDisclosure = page.locator("details.next-task-details");
  const impactToggle = impactDisclosure.locator("summary");
  await expect(impactDisclosure).not.toHaveAttribute("open", "");
  await expect(impactToggle).toHaveText(
    "BAUKOSTEN, VORAUSSETZUNGEN & WIRKUNG ANZEIGEN",
  );
  await impactToggle.focus();
  await expect(impactToggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(impactDisclosure).toHaveAttribute("open", "");

  const impact = page.getByRole("region", { name: "AUSBAU-AUSWIRKUNG" });
  await expect(impact).toBeVisible();
  await expect(page.getByText("Bauplätze")).toBeVisible();
  for (const width of [320, 390]) await expectNoHorizontalOverflow(page, width);
  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  await expect(impact).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include(".upgrade-impact")
    .analyze();
  expect(
    results.violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    ),
  ).toEqual([]);
});
