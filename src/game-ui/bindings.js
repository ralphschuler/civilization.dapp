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

  on("#retry-world-state", actions.retry);
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
  on("#pick-raid-contact", actions.pickOpponent);
  on("#resolve-raid", actions.resolveRaid);
  on("#reset", actions.reset);
  on("[data-open-settings]", actions.openSettings);
  all("[data-close-settings]", actions.closeSettings);
  root
    .querySelector("[data-reduced-motion]")
    ?.addEventListener("change", (event) =>
      actions.setReducedMotion(event.currentTarget.checked),
    );
  root
    .querySelector("[data-copy-wallet]")
    ?.addEventListener("click", async () => {
      const address = root.querySelector(
        ".settings-wallet-address",
      )?.textContent;
      const feedback = root.querySelector(".settings-feedback");
      if (!address || address === "—") return;
      try {
        if (!navigator.clipboard?.writeText)
          throw new Error("clipboard_unavailable");
        await navigator.clipboard.writeText(address);
        feedback.textContent = feedback.dataset.copySuccess;
      } catch {
        feedback.textContent = feedback.dataset.copyFailure;
      }
    });
  root
    .querySelector("[data-logout]")
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const feedback = root.querySelector(".settings-feedback");
      button.disabled = true;
      try {
        await actions.logout();
      } catch {
        button.disabled = false;
        feedback.textContent = feedback.dataset.logoutFailure;
      }
    });
  root
    .querySelector("#civilization-locale")
    ?.addEventListener("change", (event) =>
      actions.changeLocale(event.currentTarget.value),
    );

  const dialog = root.querySelector(".settings-dialog");
  if (dialog) {
    requestAnimationFrame(() =>
      dialog.querySelector("[data-close-settings]")?.focus(),
    );
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        actions.closeSettings();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...dialog.querySelectorAll("button, select, input"),
      ].filter((element) => !element.disabled);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

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
