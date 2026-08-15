export function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => entities[character],
  );
}

export function clock(seconds) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const secondsText = String(seconds % 60).padStart(2, "0");
  const time = `${String(minutes).padStart(2, "0")}:${secondsText}`;

  if (days) {
    return `${days}T ${String(hours).padStart(2, "0")}:${time}`;
  }
  if (hours) {
    return `${String(hours).padStart(2, "0")}:${time}`;
  }
  return time;
}

export function costLine(value, resourceDefs, format) {
  return Object.entries(resourceDefs)
    .filter(([resource]) => value[resource] > 0)
    .map(
      ([resource, definition]) =>
        `<span class="cost ${definition.color}">${format(value[resource])} ${definition.short}</span>`,
    )
    .join("");
}

export function requirementsLine(requirements, buildings) {
  return requirements
    .map(({ id, level }) => `${buildings[id].label} ${level}`)
    .join(" · ");
}

export function remainingTime(until, now) {
  return Math.max(0, Math.ceil((until - now) / 1_000));
}
