export type BuildHistoryFact = {
  dedupeId: string;
  kind: "upgrade_started" | "building_upgraded";
  building: number;
  value: string;
};
export type BuildHistoryPresentationState = {
  facts: BuildHistoryFact[];
  cursor: "more" | null;
  status: "idle" | "loading" | "ready" | "empty" | "error" | "session";
  updated: boolean;
};
type Page = {
  availability: "no_stored_replay" | "stored_finalized_events";
  coverage: { complete: boolean };
  facts: BuildHistoryFact[];
  nextCursor: string | null;
};
const decimal = (value: unknown): value is string =>
  typeof value === "string" && /^\d+$/.test(value);
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
/**
 * A deterministic, non-reversible browser-local key. Matching the Raid
 * history's two independent 32-bit lanes avoids a single-lane collision
 * collapsing distinct canonical facts while retaining no raw event identity.
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
  return `build-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}
/** Whitelists only the small, presentation-safe build projection. */
export function mapStoredBuildHistory(value: unknown): Page | null {
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
  const facts: BuildHistoryFact[] = [];
  for (const value of page.events) {
    if (!value || typeof value !== "object") return null;
    const event = value as Record<string, unknown>;
    if (
      (event.kind !== "upgrade_started" &&
        event.kind !== "building_upgraded") ||
      !Number.isInteger(event.building) ||
      (event.building as number) < 0 ||
      (event.building as number) > 7 ||
      !decimal(event.value) ||
      !hash(event.transactionHash) ||
      !Number.isSafeInteger(event.logIndex)
    )
      return null;
    facts.push({
      dedupeId: localDedupeId(
        event.transactionHash as string,
        event.logIndex as number,
      ),
      kind: event.kind,
      building: event.building as number,
      value: event.value as string,
    });
  }
  return {
    availability: page.availability,
    coverage: { complete: (page.coverage as Record<string, boolean>).complete },
    facts,
    nextCursor: page.nextCursor as string | null,
  };
}
export function appendStoredBuildFacts(
  current: BuildHistoryFact[],
  incoming: BuildHistoryFact[],
) {
  const known = new Set(current.map((fact) => fact.dedupeId));
  return [...current, ...incoming.filter((fact) => !known.has(fact.dedupeId))];
}
export const buildHistoryFailureStatus = (status: number) =>
  status === 401 ? "session" : "error";
