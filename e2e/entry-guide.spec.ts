import { expect, test, type Page } from "@playwright/test";

async function mountEntryGuide(page: Page) {
  await page.goto("/?entryGuideE2e=mobile-focus");
  await expect(page.getByTestId("entry-guide-e2e-harness")).toBeVisible();
}

async function expectNoHorizontalOverflow(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  expect(
    await page
      .locator("html")
      .evaluate((node) => node.scrollWidth <= window.innerWidth),
  ).toBe(true);
}

async function expectReachableInViewport(
  page: Page,
  controls: ReturnType<Page["locator"]>[],
) {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  for (const control of controls) {
    await expect(control).toBeVisible();
    await expect(control).toBeInViewport();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
}

test("mobile entry guide keeps its CTA and dismiss control reachable at 320px, 390px, and 200% zoom", async ({
  page,
}) => {
  await mountEntryGuide(page);
  const guide = page.locator("[data-entry-guide]");
  const cta = guide.getByRole("button", { name: "Bau abschließen öffnen" });
  const dismiss = guide.getByRole("button", {
    name: "Einstiegshinweis nur für diese Sitzung schließen",
  });

  for (const width of [320, 390]) {
    await expectNoHorizontalOverflow(page, { width, height: 844 });
    await expectReachableInViewport(page, [cta, dismiss]);
  }

  // 390px at 200% browser zoom exposes a 195 × 422 CSS-pixel viewport.
  await expectNoHorizontalOverflow(page, { width: 195, height: 422 });
  await expectReachableInViewport(page, [cta, dismiss]);
});

test("mobile entry guide routes to the rendered completion action and focuses it", async ({
  page,
}) => {
  await mountEntryGuide(page);
  const guide = page.locator("[data-entry-guide]");
  const cta = guide.getByRole("button", { name: "Bau abschließen öffnen" });
  const completionAction = page.locator('[data-next-action-button="complete"]');

  await expect(completionAction).toHaveCount(0);
  await cta.click();
  await expect(guide).toBeHidden();
  await expect(completionAction).toBeFocused();
});

test("mobile entry guide dismiss remains keyboard-reachable", async ({
  page,
}) => {
  await mountEntryGuide(page);
  const cta = page.getByRole("button", { name: "Bau abschließen öffnen" });
  const dismiss = page.getByRole("button", {
    name: "Einstiegshinweis nur für diese Sitzung schließen",
  });

  // Next dev tools are the first focusable control in this development-server
  // fixture, so traverse them before reaching the guide's CTA.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(cta).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dismiss).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-entry-guide]")).toBeHidden();
});
