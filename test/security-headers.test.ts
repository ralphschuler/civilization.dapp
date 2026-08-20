import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config.ts";

const securityHeaderNames = [
  "CIVILIZATION_ENV",
  "CIVILIZATION_CSP_MODE",
  "CIVILIZATION_HSTS_ENABLED",
] as const;

async function headersFor(environment: Record<string, string | undefined>) {
  const original = Object.fromEntries(
    securityHeaderNames.map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, environment);
  for (const name of securityHeaderNames) {
    if (environment[name] === undefined) delete process.env[name];
  }

  try {
    const routes = await nextConfig.headers?.();
    assert.deepEqual(
      routes?.map(({ source }) => source),
      ["/(.*)"],
    );
    return new Map(
      routes?.[0].headers.map(({ key, value }) => [key.toLowerCase(), value]),
    );
  } finally {
    for (const name of securityHeaderNames) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
}

test("security headers protect every application route in safe default mode", async () => {
  const headers = await headersFor({
    CIVILIZATION_ENV: undefined,
    CIVILIZATION_CSP_MODE: undefined,
    CIVILIZATION_HSTS_ENABLED: undefined,
  });

  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(
    headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  assert.equal(headers.get("strict-transport-security"), undefined);
  assert.equal(
    headers.get("permissions-policy"),
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  );
  assert.ok(headers.has("content-security-policy-report-only"));
  assert.equal(headers.has("content-security-policy"), false);
});

test("HSTS requires production and an explicit deployment opt-in", async () => {
  const nonProduction = await headersFor({
    CIVILIZATION_ENV: "development",
    CIVILIZATION_HSTS_ENABLED: "true",
  });
  assert.equal(nonProduction.get("strict-transport-security"), undefined);

  const productionWithoutOptIn = await headersFor({
    CIVILIZATION_ENV: "production",
    CIVILIZATION_HSTS_ENABLED: undefined,
  });
  assert.equal(
    productionWithoutOptIn.get("strict-transport-security"),
    undefined,
  );

  const production = await headersFor({
    CIVILIZATION_ENV: "production",
    CIVILIZATION_HSTS_ENABLED: "true",
  });
  assert.equal(
    production.get("strict-transport-security"),
    "max-age=63072000; includeSubDomains",
  );
});

test("CSP is report-only by default and enforcement is explicit", async () => {
  const reportOnly = await headersFor({
    CIVILIZATION_ENV: "production",
    CIVILIZATION_CSP_MODE: "report-only",
  });
  assert.ok(reportOnly.has("content-security-policy-report-only"));
  assert.equal(reportOnly.has("content-security-policy"), false);

  const enforced = await headersFor({
    CIVILIZATION_ENV: "production",
    CIVILIZATION_CSP_MODE: "enforce",
  });
  const policy = enforced.get("content-security-policy");
  assert.ok(policy);
  assert.equal(enforced.has("content-security-policy-report-only"), false);
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /base-uri 'self'/);
  assert.match(policy, /form-action 'self'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /script-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(policy, /unsafe-eval/);
  assert.doesNotMatch(policy, /connect-src[^;]*https:(?:;|$)/);
  assert.match(policy, /https:\/\/usernames\.worldcoin\.org/);
  assert.match(policy, /https:\/\/worldchain-mainnet\.g\.alchemy\.com/);
  assert.match(policy, /report-uri \/api\/security\/csp-report/);
});
