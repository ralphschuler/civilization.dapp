import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";

const runtime = process.env.CONTAINER_RUNTIME || "docker";
const runtimeAvailable =
  spawnSync(runtime, ["--version"], {
    stdio: "ignore",
  }).status === 0;

function run(...args) {
  return execFileSync(runtime, args, { encoding: "utf8" }).trim();
}

function assertDefaultSecurityHeaders(response) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("strict-transport-security"), null);
  assert.equal(response.headers.get("content-security-policy"), null);
  const policy = response.headers.get("content-security-policy-report-only");
  assert.ok(policy);
  assert.equal(policy.includes("unsafe-eval"), false);
  assert.match(policy, /report-uri \/api\/security\/csp-report/);
}

test(
  "built container emits report-only CSP and no HSTS by default",
  { skip: runtimeAvailable ? false : `${runtime} is not available` },
  async (t) => {
    const tag = `civilization-security-headers-${process.pid}`;
    let containerName = "";
    t.after(() => {
      if (containerName) spawnSync(runtime, ["rm", "-f", containerName]);
      spawnSync(runtime, ["image", "rm", "-f", tag]);
    });

    run("build", "--tag", tag, ".");
    containerName = run(
      "run",
      "--detach",
      "--publish",
      "127.0.0.1::31057",
      tag,
    );
    const port = run("port", containerName, "31057/tcp").match(/:(\d+)$/)?.[1];
    assert.ok(port, "container runtime did not publish application port");

    let response;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        response = await fetch(`http://127.0.0.1:${port}/api/healthz`);
        if (response.ok) break;
      } catch {
        // The standalone server is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(response?.ok, "built application did not become healthy");
    assertDefaultSecurityHeaders(response);

    const baseUrl = `http://127.0.0.1:${port}`;
    const page = await fetch(baseUrl);
    assert.ok(page.ok, "built application did not serve its HTML route");
    assertDefaultSecurityHeaders(page);
    const pageHtml = await page.text();
    const staticAsset = pageHtml.match(
      /src="([^"?]*\/_next\/static\/[^"?]+)"/,
    )?.[1];
    assert.ok(
      staticAsset,
      "HTML response did not reference a static Next asset",
    );

    const asset = await fetch(new URL(staticAsset, baseUrl));
    assert.ok(asset.ok, "referenced static Next asset was not served");
    assertDefaultSecurityHeaders(asset);
  },
);
