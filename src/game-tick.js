import { clock } from "./game-ui/helpers.js";

export function refreshGameTick({
  root,
  state,
  busy,
  mode,
  production,
  displayState,
  collection,
  resourceFormat,
  remainingTime,
}) {
  for (const [id, rate] of Object.entries(production)) {
    const field = root.querySelector(
      `[data-resource="${id}"] [data-resource-field]`,
    );
    if (field) {
      const unit = mode === "world" ? "/Tag" : "/s";
      field.textContent = `Feld ${resourceFormat(displayState.unclaimed[id])} · +${resourceFormat(rate)}${unit}`;
    }
  }

  const claim = root.querySelector("[data-ready-to-claim]");
  if (claim) {
    const total = Object.values(displayState.unclaimed).reduce(
      (sum, value) => sum + value,
      0,
    );
    claim.textContent = collection.locked
      ? collection.label
      : `${resourceFormat(total)} sammeln`;
  }

  const gather = root.querySelector("#gather");
  if (gather) {
    gather.disabled = collection.locked || busy;
    gather.querySelector("[data-collection-status]").textContent =
      collection.detail;
  }

  updateRaidCountdown(root, state, busy, remainingTime);
  updateConstructionCountdown(root, state, busy, remainingTime);
}

function updateRaidCountdown(root, state, busy, remainingTime) {
  const countdown = root.querySelector("[data-raid-countdown]");
  if (!countdown || !state.pendingRaid) {
    return;
  }

  const seconds = remainingTime(state.pendingRaid.arrivesAt);
  countdown.textContent = clock(seconds);
  const resolve = root.querySelector("#resolve-raid");
  if (!resolve) {
    return;
  }
  resolve.disabled = seconds > 0 || busy;
  resolve.textContent = seconds ? "Marsch läuft" : "Schlacht auswerten";
}

function updateConstructionCountdown(root, state, busy, remainingTime) {
  const countdown = root.querySelector("[data-construction-countdown]");
  if (!countdown || !state.construction?.pending) {
    return;
  }

  const seconds = remainingTime(state.construction.completesAt);
  countdown.textContent = seconds ? clock(seconds) : "Fertig";
  const complete = root.querySelector("#complete-upgrade");
  const boost = root.querySelector("#boost-construction");
  if (complete) {
    complete.disabled = seconds > 0 || busy;
    complete.textContent = seconds ? "Bau läuft" : "Ausbau abschließen";
  }
  if (boost) {
    boost.disabled = seconds <= 3_600 || busy;
  }
}
