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

const COMPACT_RESOURCE_UNITS = [
  { value: 1_000_000_000_000_000_000, suffix: "Tr" },
  { value: 1_000_000_000_000_000, suffix: "Brd" },
  { value: 1_000_000_000_000, suffix: "Bio" },
  { value: 1_000_000_000, suffix: "Mrd" },
  { value: 1_000_000, suffix: "Mio" },
  { value: 1_000, suffix: "K" },
];

export function compactResourceValue(value, fullFormat, locale = "de-DE") {
  if (!Number.isFinite(value)) {
    return fullFormat(0);
  }

  const absoluteValue = Math.abs(value);
  const unitIndex = COMPACT_RESOURCE_UNITS.findIndex(
    (unit) => absoluteValue >= unit.value,
  );
  if (unitIndex === -1) {
    return fullFormat(value);
  }

  let unit = COMPACT_RESOURCE_UNITS[unitIndex];
  const largerUnit = COMPACT_RESOURCE_UNITS[unitIndex - 1];
  if (!largerUnit && absoluteValue >= unit.value * 999.95) {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
      notation: "scientific",
      useGrouping: false,
    }).format(value);
  }
  if (largerUnit && absoluteValue >= largerUnit.value - unit.value / 20) {
    unit = largerUnit;
  }

  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, useGrouping: false }).format(value / unit.value)}${unit.suffix}`;
}

export function productionRateText({
  resourceId,
  rate,
  mode,
  formatValue,
  dayUnit = "Tag",
  secondUnit = "s",
}) {
  const hasNoAuthoritativeGoldProduction = resourceId === "gold" && rate === 0;
  if (!Number.isFinite(rate) || rate < 0 || hasNoAuthoritativeGoldProduction) {
    return "";
  }

  return `+${formatValue(rate)}${mode === "world" ? `/${dayUnit}` : `/${secondUnit}`}`;
}
