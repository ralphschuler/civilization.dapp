import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
async function mountDependencyPlanner(page: Page) {
  await page.goto("/?buildPanelE2e=dependency");
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

test("dependency planner is named, accessible, responsive, and offers one next step", async ({
  page,
}) => {
  await mountDependencyPlanner(page);
  const plannerDisclosure = page.locator("details.next-task-details");
  const plannerToggle = plannerDisclosure.locator("summary");
  const planner = page.getByRole("region", { name: "AUSBAUPLAN" });
  const nextStep = planner.getByRole("button", {
    name: "claypit auf Stufe 2 starten",
  });

  await expect(plannerDisclosure).not.toHaveAttribute("open", "");
  await expect(plannerToggle).toHaveText("DETAILS ZUM BAUSCHRITT");
  await plannerToggle.focus();
  await expect(plannerToggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(plannerDisclosure).toHaveAttribute("open", "");
  await expect(planner).toBeVisible();
  await expect(nextStep).toHaveCount(1);
  await expect(nextStep).toBeEnabled();
  await expect(planner.getByRole("button")).toHaveCount(1);

  for (const width of [320, 390]) await expectNoHorizontalOverflow(page, width);
  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  await expectNoHorizontalOverflow(page, 320);
  await expectNoHorizontalOverflow(page, 390);

  const results = await new AxeBuilder({ page })
    .include(".dependency-plan")
    .analyze();
  expect(
    results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
});
