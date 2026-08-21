export function bindGameActions(root, actions) {
  root
    .querySelectorAll("[data-asset-fallback]")
    .forEach((image) =>
      image.addEventListener("error", () =>
        image
          .closest("[data-asset-container]")
          ?.classList.add("has-asset-error"),
      ),
    );
  const on = (selector, callback) =>
    root.querySelector(selector)?.addEventListener("click", callback);
  const all = (selector, callback) =>
    root
      .querySelectorAll(selector)
      .forEach((item) => item.addEventListener("click", callback));

  on("#gather", actions.gather);
  on("#complete-upgrade", actions.completeUpgrade);
  on("#boost-construction", actions.boost);
  all("[data-complete-upgrade]", (event) => {
    const value = event.currentTarget.dataset.constructionSlot;
    actions.completeUpgrade(value === undefined ? undefined : Number(value));
  });
  all("[data-boost-construction]", (event) => {
    const value = event.currentTarget.dataset.constructionSlot;
    actions.boost(value === undefined ? undefined : Number(value));
  });
  on("#prestige", actions.prestige);
  on("[data-confirm-wallet-review]", actions.confirmReview);
  on("[data-cancel-wallet-review]", actions.cancelReview);
  on("#reset", actions.reset);
  all("[data-map-building]", (event) =>
    actions.selectBuilding(event.currentTarget.dataset.mapBuilding),
  );
  all("[data-panel]", (event) => {
    const control = event.currentTarget;
    const panel = control.dataset.panel;
    const focusSelector = control.closest(".mobile-hud")
      ? `.mobile-hud [data-panel="${panel}"]`
      : control.closest(".command-tabs")
        ? `.command-tabs [data-panel="${panel}"]`
        : `.map-building[data-panel="${panel}"]`;
    actions.selectPanel(panel);
    // Rendering replaces the controls. Keep keyboard users on the equivalent
    // navigation control after selecting a different game area.
    requestAnimationFrame(() => root.querySelector(focusSelector)?.focus());
  });
  all("[data-building]", (event) =>
    actions.upgrade(event.currentTarget.dataset.building),
  );
  all("[data-plan-upgrade]", (event) =>
    actions.upgrade(event.currentTarget.dataset.planUpgrade),
  );
  all("[data-open-market]", () => actions.selectPanel("market"));
}
