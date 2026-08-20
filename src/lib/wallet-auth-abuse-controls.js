import crypto from "node:crypto";
import { isIP } from "node:net";
import { database } from "./database.mjs";

export const WALLET_AUTH_LIMITS = Object.freeze({
  nonce: { client: 8, global: 120, windowSeconds: 60 },
  verify: { client: 12, global: 120, windowSeconds: 60 },
});

const RETENTION_SECONDS = 24 * 60 * 60;

function isValidIp(value) {
  // Deliberately accept only IP literals. Header names and arbitrary tokens
  // must never become attacker-controlled rate-limit identities.
  return typeof value === "string" && isIP(value) !== 0;
}

/**
 * Extracts the client address only when the ingress is configured to overwrite
 * X-Forwarded-For and to append exactly `trustedProxyHops` proxy addresses.
 * With zero trusted hops, all callers share an anonymous fail-safe bucket.
 */
export function walletAuthClientSource(headers, trustedProxyHops) {
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 1)
    return "anonymous";
  const forwarded = headers.get("x-forwarded-for");
  if (typeof forwarded !== "string") return "anonymous";
  const chain = forwarded.split(",").map((part) => part.trim());
  const candidate = chain.at(-(trustedProxyHops + 1));
  return isValidIp(candidate) ? candidate.toLowerCase() : "anonymous";
}

/** Hashes source identities with a deployment secret before persistence. */
export function walletAuthPrivacyKey(source, secret) {
  if (typeof secret !== "string" || secret.length < 32)
    throw new Error("wallet_auth_rate_limit_configuration_unavailable");
  return crypto.createHmac("sha256", secret).update(source).digest("hex");
}

async function increment(scope, keyHash, policy, query) {
  const result = await query(
    `INSERT INTO wallet_auth_rate_limits
       (scope, key_hash, window_started_at, count, expires_at)
     VALUES (
       $1, $2,
       to_timestamp(floor(extract(epoch FROM clock_timestamp()) / $3) * $3),
       1,
       to_timestamp(floor(extract(epoch FROM clock_timestamp()) / $3) * $3 + $3)
     )
     ON CONFLICT (scope, key_hash, window_started_at)
     DO UPDATE SET count = wallet_auth_rate_limits.count + 1
     RETURNING count, extract(epoch FROM expires_at) AS expires_at_epoch,
       extract(epoch FROM clock_timestamp()) AS now_epoch`,
    [scope, keyHash, policy.windowSeconds],
  );
  const row = result.rows[0];
  return {
    allowed: row.count <= policy.limit,
    retryAfter: Math.max(
      1,
      Math.ceil(Number(row.expires_at_epoch) - Number(row.now_epoch)),
    ),
  };
}

/** Atomically charges client and global fixed-window budgets in PostgreSQL. */
export async function takeWalletAuthRateLimit(
  endpoint,
  source,
  secret,
  dependencies = {},
) {
  const policy = WALLET_AUTH_LIMITS[endpoint];
  if (!policy) throw new Error("invalid_wallet_auth_rate_limit_endpoint");
  const query =
    dependencies.query ?? ((sql, values) => database().query(sql, values));
  const sourceKey = walletAuthPrivacyKey(source, secret);
  const [client, global] = await Promise.all([
    increment(
      `${endpoint}:client`,
      sourceKey,
      { ...policy, limit: policy.client },
      query,
    ),
    increment(
      `${endpoint}:global`,
      "global",
      { ...policy, limit: policy.global },
      query,
    ),
  ]);
  const rejected = [client, global].filter((result) => !result.allowed);
  return rejected.length
    ? {
        allowed: false,
        retryAfter: Math.max(...rejected.map((result) => result.retryAfter)),
      }
    : { allowed: true, retryAfter: 0 };
}

/** Retention is bounded even when an endpoint goes quiet between deployments. */
export async function cleanupWalletAuthAbuseControls(dependencies = {}) {
  const query =
    dependencies.query ?? ((sql, values) => database().query(sql, values));
  await query(
    "DELETE FROM wallet_auth_rate_limits WHERE expires_at < now() - ($1 * interval '1 second')",
    [RETENTION_SECONDS],
  );
  await query(
    "DELETE FROM wallet_auth_metrics WHERE bucket_started_at < now() - ($1 * interval '1 second')",
    [RETENTION_SECONDS],
  );
}

export async function recordWalletAuthMetric(metric, dependencies = {}) {
  const query =
    dependencies.query ?? ((sql, values) => database().query(sql, values));
  await query(
    `INSERT INTO wallet_auth_metrics (metric, bucket_started_at, count)
     VALUES ($1, date_trunc('minute', clock_timestamp()), 1)
     ON CONFLICT (metric, bucket_started_at)
     DO UPDATE SET count = wallet_auth_metrics.count + 1`,
    [metric],
  );
}
