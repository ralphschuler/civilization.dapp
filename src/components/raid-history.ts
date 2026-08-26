export type StoredRaidReport = {
  /** Local one-way key used only to collapse overlapping server pages. */
  dedupeId: string;
  role: "attacker" | "defender";
  attackerWon: boolean;
  /** The only counterparty representation retained after mapping a response. */
  counterpartyLabel: string;
  attack: string;
  defense: string;
  resources: Record<"wood" | "clay" | "stone" | "gold", string>;
};

export type StoredRaidHistoryPage = {
  availability: "no_stored_replay" | "stored_finalized_events";
  coverage: { complete: boolean };
  reports: StoredRaidReport[];
  nextCursor: string | null;
};

/**
 * Sanitized, browser-local state consumed by the Raid history view. It
 * deliberately carries only display reports, a local pagination cursor, and
 * UI status; API event payloads and opaque server cursors never enter it.
 */
export type RaidHistoryPresentationState = {
  reports: StoredRaidReport[];
  /** A local view signal, never the opaque cursor received from the API. */
  cursor: "more" | null;
  status: "idle" | "loading" | "ready" | "empty" | "error" | "session";
  updated: boolean;
};

const resourceNames = ["wood", "clay", "stone", "gold"] as const;
const decimal = (value: unknown): value is string =>
  typeof value === "string" && /^\d+$/.test(value);
const address = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);

/**
 * A deterministic, non-reversible browser-local key. Two independently mixed
 * 32-bit lanes make accidental page-overlap collisions much less likely while
 * deliberately retaining neither the transaction hash nor log index.
 */
function localDedupeId(transactionHash: string, logIndex: number) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const character of `${transactionHash.toLowerCase()}:${logIndex}`) {
    const code = character.charCodeAt(0);
    first = Math.imul(first ^ code, 0x01000193);
    second ^= code;
    second = Math.imul(second ^ (second >>> 16), 0x85ebca6b);
  }
  second ^= second >>> 16;
  second = Math.imul(second, 0xc2b2ae35);
  second ^= second >>> 16;
  return `raid-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

/** Maps only the API's approved decoded fields and rejects malformed payloads. */
export function mapStoredRaidHistory(
  value: unknown,
): StoredRaidHistoryPage | null {
  if (!value || typeof value !== "object") return null;
  const page = value as Record<string, unknown>;
  if (
    (page.availability !== "no_stored_replay" &&
      page.availability !== "stored_finalized_events") ||
    !page.coverage ||
    typeof page.coverage !== "object" ||
    typeof (page.coverage as Record<string, unknown>).complete !== "boolean" ||
    !Array.isArray(page.events) ||
    (page.nextCursor !== null && typeof page.nextCursor !== "string")
  )
    return null;
  const reports: StoredRaidReport[] = [];
  for (const value of page.events) {
    if (!value || typeof value !== "object") return null;
    const event = value as Record<string, unknown>;
    if (
      event.kind !== "raid_resolved" ||
      (event.role !== "attacker" && event.role !== "defender") ||
      typeof event.attackerWon !== "boolean" ||
      !address(event.counterparty) ||
      !decimal(event.attack) ||
      !decimal(event.defense) ||
      !hash(event.transactionHash) ||
      !Number.isSafeInteger(event.logIndex) ||
      typeof event.blockTimestamp !== "string" ||
      !event.resources ||
      typeof event.resources !== "object"
    )
      return null;
    const resources = event.resources as Record<string, unknown>;
    if (!resourceNames.every((name) => decimal(resources[name]))) return null;
    reports.push({
      dedupeId: localDedupeId(event.transactionHash, event.logIndex as number),
      role: event.role,
      attackerWon: event.attackerWon,
      counterpartyLabel: abbreviatedCounterparty(event.counterparty),
      attack: event.attack,
      defense: event.defense,
      resources: {
        wood: resources.wood as string,
        clay: resources.clay as string,
        stone: resources.stone as string,
        gold: resources.gold as string,
      },
    });
  }
  return {
    availability: page.availability,
    coverage: { complete: (page.coverage as Record<string, boolean>).complete },
    reports,
    nextCursor: page.nextCursor as string | null,
  };
}

/** Keeps a page boundary safe if a retry or an overlapping page repeats an event. */
export function appendStoredRaidReports(
  current: StoredRaidReport[],
  incoming: StoredRaidReport[],
) {
  const known = new Set(current.map((report) => report.dedupeId));
  return [
    ...current,
    ...incoming.filter((report) => !known.has(report.dedupeId)),
  ];
}

export function abbreviatedCounterparty(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function raidHistoryFailureStatus(status: number) {
  return status === 401 ? "session" : "error";
}
