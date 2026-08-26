const PREFIX = "civilization:completion-ready";

function scope({ walletAddress, contractAddress }) {
  if (typeof walletAddress !== "string" || typeof contractAddress !== "string")
    return null;
  const wallet = walletAddress.trim().toLowerCase();
  const contract = contractAddress.trim().toLowerCase();
  return wallet && contract ? { wallet, contract } : null;
}

function localStore(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function completionNotificationPreferenceKey(identity) {
  const current = scope(identity);
  return current
    ? `${PREFIX}:enabled:${current.wallet}:${current.contract}`
    : null;
}

export function completionNotificationKey({ slot, completesAt, ...identity }) {
  const current = scope(identity);
  if (
    !current ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    !Number.isFinite(completesAt) ||
    completesAt < 0
  )
    return null;
  return `${PREFIX}:shown:${current.wallet}:${current.contract}:${slot}:${completesAt}`;
}

export function completionNotificationsEnabled(identity, storage) {
  const key = completionNotificationPreferenceKey(identity);
  const store = localStore(storage);
  try {
    return Boolean(key && store?.getItem(key) === "true");
  } catch {
    return false;
  }
}

export function setCompletionNotificationsEnabled(identity, enabled, storage) {
  const current = scope(identity);
  const key = completionNotificationPreferenceKey(identity);
  const store = localStore(storage);
  if (!current || !key || !store) return false;
  try {
    if (enabled) {
      store.setItem(key, "true");
      return store.getItem(key) === "true";
    }
    store.removeItem(key);
    const shownPrefix = `${PREFIX}:shown:${current.wallet}:${current.contract}:`;
    for (let index = store.length - 1; index >= 0; index -= 1) {
      const candidate = store.key(index);
      if (candidate?.startsWith(shownPrefix)) store.removeItem(candidate);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * A visible notice is valid only while the latest chain snapshot still shows
 * that exact construction as pending and due. Treat unavailable chain time as
 * untrusted so a stale notice cannot survive a failed or reorg-like read.
 */
export function retainCompletionReadyNotices(notices, state) {
  const chainTimestamp = state?.chainTimestamp;
  if (!Number.isFinite(chainTimestamp)) return [];
  const jobs = state?.constructions || [];
  return notices.filter((notice) =>
    jobs.some(
      (job) =>
        job?.pending === true &&
        job.slot === notice.slot &&
        job.completesAt === notice.completesAt &&
        Number.isFinite(job.completesAt) &&
        job.completesAt <= chainTimestamp,
    ),
  );
}

/**
 * Emits only from a just-read chain snapshot. `chainTimestamp` is supplied by
 * the block read that produced this state; no browser clock participates.
 */
export function collectCompletionReadyNotices(identity, state, storage) {
  if (!completionNotificationsEnabled(identity, storage)) return [];
  const store = localStore(storage);
  const chainTimestamp = state?.chainTimestamp;
  if (!store || !Number.isFinite(chainTimestamp)) return [];
  const jobs = state?.constructions || [];
  const notices = [];
  for (const job of jobs) {
    if (
      job?.pending !== true ||
      !Number.isFinite(job.completesAt) ||
      job.completesAt > chainTimestamp
    )
      continue;
    const key = completionNotificationKey({ ...identity, ...job });
    if (!key) continue;
    try {
      if (store.getItem(key) !== null) continue;
      store.setItem(key, "ready");
      if (store.getItem(key) !== "ready") continue;
      notices.push({
        key,
        slot: job.slot,
        buildingId: job.buildingId,
        completesAt: job.completesAt,
      });
    } catch {
      // Storage is part of de-duplication. Without it, do not notify.
      return [];
    }
  }
  return notices;
}
