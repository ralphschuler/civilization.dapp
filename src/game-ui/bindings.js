export function bindGameActions(root, actions) {
  const on = (selector, callback) =>
    root.querySelector(selector)?.addEventListener("click", callback);
  const all = (selector, callback) =>
    root
      .querySelectorAll(selector)
      .forEach((item) => item.addEventListener("click", callback));

  on("#retry-world-state", actions.retry);
  on("#gather", actions.gather);
  on("#complete-upgrade", actions.completeUpgrade);
  on("#boost-construction", actions.boost);
  on("#prestige", actions.prestige);
  on("#pick-raid-contact", actions.pickOpponent);
  on("#resolve-raid", actions.resolveRaid);
  on("#reset", actions.reset);

  all("[data-map-building]", (event) =>
    actions.selectBuilding(event.currentTarget.dataset.mapBuilding),
  );
  all("[data-panel]", (event) =>
    actions.selectPanel(event.currentTarget.dataset.panel),
  );
  all("[data-building]", (event) =>
    actions.upgrade(event.currentTarget.dataset.building),
  );
  all("[data-train]", (event) =>
    actions.train(event.currentTarget.dataset.train),
  );
  on("#market-swap", () =>
    actions.swap(
      root.querySelector("#market-from")?.value,
      root.querySelector("#market-to")?.value,
      Number(root.querySelector("#market-amount")?.value),
    ),
  );
  on("#market-quote", () =>
    actions.quoteMarket(
      root.querySelector("#market-resource")?.value,
      Number(root.querySelector("#market-amount")?.value),
    ),
  );
  on("#market-buy", () => actions.marketOrder("buy"));
  on("#market-sell", () => actions.marketOrder("sell"));
  on("#send-raid", () => {
    const target =
      root.querySelector("#raid-target-address")?.value.trim() ||
      root.querySelector("#raid-target")?.value;
    const army = Object.fromEntries(
      actions.troopIds.map((id) => [
        id,
        Number(root.querySelector(`#raid-${id}`)?.value),
      ]),
    );
    actions.sendRaid(target, army);
  });
}
