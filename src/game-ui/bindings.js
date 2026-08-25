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
  all("[data-building]", (event) =>
    actions.upgrade(event.currentTarget.dataset.building),
  );
  all("[data-plan-upgrade]", (event) =>
    actions.upgrade(event.currentTarget.dataset.planUpgrade),
  );
  all("[data-open-market]", () => actions.selectPanel("market"));
}
