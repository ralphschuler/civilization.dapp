import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

async function startServer() {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      HOST: "127.0.0.1",
      PORT: "0",
      WORLD_ID_RP_ID: "rp_a84548cb908798cf",
      WORLD_ID_ACTION: "play",
      WORLD_ID_RP_SIGNING_KEY: "0x0123456789012345678901234567890123456789012345678901234567890123",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  await Promise.race([
    once(child.stdout, "data"),
    once(child, "error").then(([error]) => { throw error; }),
    once(child, "exit").then(([code]) => { throw new Error(`server exited before listening (${code})`); }),
  ]);
  const port = output.match(/127\.0\.0\.1:(\d+)/)?.[1];
  if (!port) throw new Error(`server did not report a port: ${output}`);
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

test("proof-context CORS preflight permits only the GitHub Pages origin", async (t) => {
  const { child, baseUrl } = await startServer();
  t.after(() => child.kill());

  const permitted = await fetch(`${baseUrl}/api/world-id/proof-context`, {
    method: "OPTIONS",
    headers: { Origin: "https://nyphon.de", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
  });
  assert.equal(permitted.status, 204);
  assert.equal(permitted.headers.get("access-control-allow-origin"), "https://nyphon.de");
  assert.equal(permitted.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.equal(permitted.headers.get("access-control-allow-headers"), "content-type");

  const rejected = await fetch(`${baseUrl}/api/world-id/proof-context`, {
    method: "OPTIONS",
    headers: { Origin: "https://untrusted.example", "Access-Control-Request-Method": "POST" },
  });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);

  const post = await fetch(`${baseUrl}/api/world-id/proof-context`, {
    method: "POST",
    headers: { Origin: "https://nyphon.de", "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(post.status, 200);
  assert.equal(post.headers.get("access-control-allow-origin"), "https://nyphon.de");
});

test("wallet-auth nonce endpoint permits the production page and consumes rejected nonces", async (t) => {
  const { child, baseUrl } = await startServer();
  t.after(() => child.kill());

  const preflight = await fetch(`${baseUrl}/api/wallet-auth/verify`, {
    method: "OPTIONS",
    headers: { Origin: "https://nyphon.de", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://nyphon.de");
  assert.equal(preflight.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");

  const nonceResponse = await fetch(`${baseUrl}/api/wallet-auth/nonce`, { headers: { Origin: "https://nyphon.de" } });
  assert.equal(nonceResponse.status, 200);
  assert.equal(nonceResponse.headers.get("access-control-allow-origin"), "https://nyphon.de");
  const nonce = await nonceResponse.json();
  assert.match(nonce.nonce, /^[A-Za-z0-9]{8,}$/);
  assert.ok(nonce.expires_at > Date.now());

  const body = { nonce: nonce.nonce, payload: { address: "0x2222222222222222222222222222222222222222", message: "bad", signature: "0xbad" } };
  const rejected = await fetch(`${baseUrl}/api/wallet-auth/verify`, {
    method: "POST", headers: { Origin: "https://nyphon.de", "content-type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal(rejected.status, 400);
  assert.deepEqual(await rejected.json(), { isValid: false, error: "wallet_auth_verification_failed" });
  const replay = await fetch(`${baseUrl}/api/wallet-auth/verify`, {
    method: "POST", headers: { Origin: "https://nyphon.de", "content-type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal(replay.status, 400);
  assert.deepEqual(await replay.json(), { isValid: false, error: "invalid_or_expired_nonce" });

  const foreign = await fetch(`${baseUrl}/api/wallet-auth/nonce`, { headers: { Origin: "https://untrusted.example" } });
  assert.equal(foreign.status, 403);
});
