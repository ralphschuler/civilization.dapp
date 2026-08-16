export const POSTGRES_CONNECT_TIMEOUT_MS = 3_000;
export const INITIAL_CONNECT_ATTEMPTS = 3;
export const INITIAL_CONNECT_RETRY_DELAY_MS = 250;

const TRANSIENT_CONNECT_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ETIMEDOUT",
  "57P01",
  "57P02",
  "57P03",
]);

function databaseUnavailable() {
  return new Error("database_unavailable");
}

function isTransientConnectionError(error) {
  return (
    error instanceof Error &&
    typeof error.code === "string" &&
    (TRANSIENT_CONNECT_CODES.has(error.code) || /^08...$/.test(error.code))
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function connectOnce(pool, timeoutMilliseconds) {
  let timedOut = false;
  let timer;
  const connection = Promise.resolve().then(() => pool.connect());
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      const error = new Error("connect_timeout");
      error.code = "ETIMEDOUT";
      reject(error);
    }, timeoutMilliseconds);
  });

  try {
    return await Promise.race([connection, timeout]);
  } finally {
    clearTimeout(timer);
    if (timedOut) {
      // A late connection must not be left checked out after the caller timed out.
      void connection.then((client) => client.release()).catch(() => {});
    }
  }
}

/**
 * Acquires the initial client with a small, bounded retry window. Connection
 * details are deliberately never propagated beyond the stable availability code.
 */
export async function connectWithRetry(
  targetPool,
  {
    attempts = INITIAL_CONNECT_ATTEMPTS,
    retryDelayMilliseconds = INITIAL_CONNECT_RETRY_DELAY_MS,
    timeoutMilliseconds = POSTGRES_CONNECT_TIMEOUT_MS,
  } = {},
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await connectOnce(targetPool, timeoutMilliseconds);
    } catch (error) {
      if (!isTransientConnectionError(error) || attempt === attempts)
        throw databaseUnavailable();
      await delay(retryDelayMilliseconds);
    }
  }
  throw databaseUnavailable();
}
