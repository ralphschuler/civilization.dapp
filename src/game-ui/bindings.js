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
  on("#reset", actions.reset);
  all("[data-map-building]", (event) =>
    actions.selectBuilding(event.currentTarget.dataset.mapBuilding),
  );
  all("[data-map-panel]", (event) => {
    const panel = event.currentTarget.dataset.mapPanel;
    actions.selectPanel(panel);
    requestAnimationFrame(() =>
      root.querySelector(`.map-building[data-map-panel="${panel}"]`)?.focus(),
    );
  });
  all("[data-building]", (event) =>
    actions.upgrade(event.currentTarget.dataset.building),
  );
  all("[data-plan-upgrade]", (event) =>
    actions.upgrade(event.currentTarget.dataset.planUpgrade),
  );
  all("[data-open-market]", () => actions.selectPanel("market"));
}
