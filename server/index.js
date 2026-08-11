import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { isAbsolute, join, normalize, relative } from "node:path";
import pg from "pg";
import { IMG_DECIMALS, TRADE_FEE_BPS, WLD_DECIMALS, quoteImgWldTrade } from "./market.js";
import { applyGameAction, validateAction, validateActionId, validateAnonymousId } from "./game-state.js";
import { createInitialState, settle } from "../src/game.js";
import { GAME_STATE_SCHEMA } from "./schema.js";
import { publicTarget, resolvePvpRaid, startPvpRaid } from "./pvp.js";
import { CONTRACT_STATUS } from "./contract-status.js";
import { createWorldIdProofContext, getWorldIdRpConfiguration } from "./world-id-rp.js";

const port = Number(process.env.PORT || 31057);
const host = process.env.HOST || "0.0.0.0";
const staticRoot = join(process.cwd(), "dist");
const databaseUrl = process.env.DATABASE_URL || "";
const databaseConfigured = Boolean(databaseUrl || process.env.PGHOST || process.env.PGDATABASE);
const pool = databaseConfigured ? new pg.Pool({ ...(databaseUrl ? { connectionString: databaseUrl } : {}), max: 4 }) : null;
let schemaReady;

const mimeTypes = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp",
};

function json(response, statusCode, value, headers = {}) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  response.end(JSON.stringify(value));
}

const pagesOrigin = "https://nyphon.de";
const proofContextCorsHeaders = Object.freeze({
  "access-control-allow-origin": pagesOrigin,
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "600",
  vary: "Origin",
});

function hasPermittedPagesOrigin(request) {
  return request.headers.origin === pagesOrigin;
}

async function databaseHealthy() {
  if (!pool) return false;
  await pool.query("SELECT 1");
  return true;
}

async function ensureSchema() {
  if (!pool) throw new Error("database_unavailable");
  if (!schemaReady) schemaReady = pool.query(GAME_STATE_SCHEMA).catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error("payload_too_large");
  }
  if (!body) throw new Error("invalid_json");
  try { return JSON.parse(body); } catch { throw new Error("invalid_json"); }
}

function anonymousId(request) {
  const value = request.headers["x-idlemint-anonymous-id"];
  return typeof value === "string" && validateAnonymousId(value) ? value : null;
}

function publicVillageId() { return `v_${randomBytes(18).toString("base64url")}`; }
function onlineState(state) {
  const { targets: _demoTargets, pendingRaid, ...value } = state;
  if (!pendingRaid || pendingRaid.kind !== "pvp") return { ...value, pendingRaid };
  const { seed: _seed, ...publicRaid } = pendingRaid;
  return { ...value, pendingRaid: publicRaid };
}

async function ensurePlayer(client, id) {
  await client.query("INSERT INTO game_players (anonymous_id, public_village_id, state) VALUES ($1, $2, $3::jsonb) ON CONFLICT (anonymous_id) DO NOTHING", [id, publicVillageId(), JSON.stringify(createInitialState())]);
  // Supports rows created before public village IDs existed. A collision is protected by the unique index and is cryptographically negligible.
  await client.query("UPDATE game_players SET public_village_id = $2 WHERE anonymous_id = $1 AND public_village_id IS NULL", [id, publicVillageId()]);
}

async function ensurePlayerRecord(id) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensurePlayer(client, id);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function withPlayer(id, mutation) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensurePlayer(client, id);
    const player = await client.query("SELECT state, version, public_village_id FROM game_players WHERE anonymous_id = $1 FOR UPDATE", [id]);
    const state = player.rows[0].state;
    settle(state);
    const outcome = await mutation({ client, state, version: Number(player.rows[0].version) });
    await client.query("UPDATE game_players SET state = $2::jsonb, version = version + 1, updated_at = now() WHERE anonymous_id = $1", [id, JSON.stringify(state)]);
    await client.query("COMMIT");
    return { state: onlineState(state), version: Number(player.rows[0].version) + 1, publicVillageId: player.rows[0].public_village_id, ...outcome };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function existingAction(id, actionId) {
  const result = await pool.query("SELECT result FROM game_actions WHERE anonymous_id = $1 AND action_id = $2", [id, actionId]);
  return result.rowCount ? result.rows[0].result : null;
}

async function withPvpPlayers(attackerId, defenderVillageId, mutation) {
  // Create/migrate the attacker's row before the duel transaction so it does not
  // take an attacker-row lock ahead of the canonical two-player lock order.
  await ensurePlayerRecord(attackerId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const defenderLookup = await client.query("SELECT anonymous_id FROM game_players WHERE public_village_id = $1", [defenderVillageId]);
    if (!defenderLookup.rowCount || defenderLookup.rows[0].anonymous_id === attackerId) throw new Error("invalid_target");
    const ids = [attackerId, defenderLookup.rows[0].anonymous_id].sort();
    const players = new Map();
    // Every PvP write locks the same two player rows in lexical anonymous-id order.
    for (const id of ids) {
      const row = await client.query("SELECT anonymous_id, public_village_id, state, version FROM game_players WHERE anonymous_id = $1 FOR UPDATE", [id]);
      players.set(id, row.rows[0]);
    }
    const attacker = players.get(attackerId);
    const defender = players.get(defenderLookup.rows[0].anonymous_id);
    const outcome = await mutation({ client, attacker, defender });
    for (const player of [attacker, defender]) {
      await client.query("UPDATE game_players SET state = $2::jsonb, version = version + 1, updated_at = now() WHERE anonymous_id = $1", [player.anonymous_id, JSON.stringify(player.state)]);
    }
    await client.query("COMMIT");
    return { state: onlineState(attacker.state), version: Number(attacker.version) + 1, publicVillageId: attacker.public_village_id, ...outcome };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function mutatePvpStart(id, actionId, action) {
  const previous = await existingAction(id, actionId);
  if (previous) return { ...(await readPlayerState(id)), result: previous, duplicate: true };
  return withPvpPlayers(id, action.payload.targetId, async ({ client, attacker, defender }) => {
    const duplicate = await client.query("SELECT result FROM game_actions WHERE anonymous_id = $1 AND action_id = $2", [id, actionId]);
    if (duplicate.rowCount) return { result: duplicate.rows[0].result, duplicate: true };
    const result = startPvpRaid(attacker.state, attacker.public_village_id, defender.public_village_id, action.payload.army, Date.now(), randomBytes(32));
    await client.query("INSERT INTO game_actions (anonymous_id, action_id, result) VALUES ($1, $2, $3::jsonb)", [id, actionId, JSON.stringify(result)]);
    return { result, duplicate: false };
  });
}

async function mutatePvpResolve(id, actionId) {
  const previous = await existingAction(id, actionId);
  if (previous) return { ...(await readPlayerState(id)), result: previous, duplicate: true };
  await ensureSchema();
  const pending = await pool.query("SELECT state FROM game_players WHERE anonymous_id = $1", [id]);
  const targetId = pending.rows[0]?.state?.pendingRaid?.targetId;
  if (!targetId) return mutatePlayerState(id, actionId, { type: "resolve_raid", payload: {} });
  return withPvpPlayers(id, targetId, async ({ client, attacker, defender }) => {
    const duplicate = await client.query("SELECT result FROM game_actions WHERE anonymous_id = $1 AND action_id = $2", [id, actionId]);
    if (duplicate.rowCount) return { result: duplicate.rows[0].result, duplicate: true };
    const seed = Buffer.from(attacker.state.pendingRaid?.seed || "", "base64url");
    if (seed.length !== 32) throw new Error("invalid_raid_seed");
    const result = resolvePvpRaid(attacker.state, defender.state, attacker.public_village_id, defender.public_village_id, Date.now(), seed);
    if (result.ok) {
      const battle = await client.query("INSERT INTO game_battles (attacker_anonymous_id, defender_anonymous_id, attacker_village_id, defender_village_id, action_id, seed, result) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING id", [id, defender.anonymous_id, attacker.public_village_id, defender.public_village_id, actionId, seed, JSON.stringify(result)]);
      result.battleId = String(battle.rows[0].id);
    }
    await client.query("INSERT INTO game_actions (anonymous_id, action_id, result) VALUES ($1, $2, $3::jsonb)", [id, actionId, JSON.stringify(result)]);
    return { result, duplicate: false };
  });
}

async function listPvpTargets(id) {
  await readPlayerState(id);
  const result = await pool.query("SELECT public_village_id, state FROM game_players WHERE anonymous_id <> $1 AND public_village_id IS NOT NULL ORDER BY updated_at DESC LIMIT 50", [id]);
  return result.rows.map((row) => publicTarget(row.public_village_id, row.state));
}

async function readPlayerState(id) {
  return withPlayer(id, () => ({}));
}

async function mutatePlayerState(id, actionId, action) {
  return withPlayer(id, async ({ client, state }) => {
    const previous = await client.query("SELECT result FROM game_actions WHERE anonymous_id = $1 AND action_id = $2", [id, actionId]);
    if (previous.rowCount) return { result: previous.rows[0].result, duplicate: true };
    const result = applyGameAction(state, action);
    await client.query("INSERT INTO game_actions (anonymous_id, action_id, result) VALUES ($1, $2, $3::jsonb)", [id, actionId, JSON.stringify(result)]);
    return { result, duplicate: false };
  });
}

async function serveStatic(request, response) {
  const requestPath = new URL(request.url, "http://localhost").pathname;
  const normalized = normalize(requestPath).replace(/^([/\\])+/, "");
  let candidate = join(staticRoot, normalized || "index.html");
  const relativePath = relative(staticRoot, candidate);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) return json(response, 400, { error: "invalid_path" });
  try {
    const file = await stat(candidate);
    if (file.isDirectory()) candidate = join(candidate, "index.html");
  } catch {
    candidate = join(staticRoot, "index.html");
  }
  if (!existsSync(candidate)) return json(response, 503, { error: "frontend_not_built" });
  const extension = candidate.slice(candidate.lastIndexOf("."));
  response.writeHead(200, { "content-type": mimeTypes[extension] || "application/octet-stream", "x-content-type-options": "nosniff" });
  createReadStream(candidate).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  try {
    if (request.method === "GET" && url.pathname === "/api/healthz") {
      const database = await databaseHealthy().catch(() => false);
      const worldIdRp = getWorldIdRpConfiguration();
      return json(response, 200, { status: "ok", database: database ? "ok" : "unavailable", ready: database, worldIdProofContext: worldIdRp.configured ? "configured" : "not_configured", tradingEnabled: false, contractRelease: CONTRACT_STATUS.release, contractDeployment: CONTRACT_STATUS.deployment });
    }
    if (request.method === "GET" && url.pathname === "/api/readyz") {
      const database = await ensureSchema().then(() => databaseHealthy()).catch(() => false);
      return json(response, database ? 200 : 503, { status: database ? "ready" : "not_ready", database: database ? "ok" : "unavailable" });
    }
    if (url.pathname === "/api/game/state") {
      const id = anonymousId(request);
      if (!id) return json(response, 400, { error: "invalid_anonymous_id" });
      if (request.method === "GET") return json(response, 200, await readPlayerState(id));
      if (request.method !== "POST") return json(response, 405, { error: "method_not_allowed" });
      const body = await readJson(request);
      if (!validateActionId(body?.id)) return json(response, 400, { error: "invalid_action_id" });
      const action = validateAction(body?.action);
      if (!action) return json(response, 400, { error: "invalid_action" });
      if (action.type === "start_raid") return json(response, 200, await mutatePvpStart(id, body.id, action));
      if (action.type === "resolve_raid") return json(response, 200, await mutatePvpResolve(id, body.id));
      return json(response, 200, await mutatePlayerState(id, body.id, action));
    }
    if (request.method === "GET" && url.pathname === "/api/game/targets") {
      const id = anonymousId(request);
      if (!id) return json(response, 400, { error: "invalid_anonymous_id" });
      return json(response, 200, { targets: await listPvpTargets(id) });
    }
    if (request.method === "GET" && url.pathname === "/api/contracts/status") return json(response, 200, CONTRACT_STATUS);
    if (url.pathname === "/api/world-id/proof-context" && request.method === "OPTIONS") {
      if (!hasPermittedPagesOrigin(request)) return json(response, 403, { error: "origin_not_allowed" });
      response.writeHead(204, proofContextCorsHeaders);
      return response.end();
    }
    if (request.method === "POST" && url.pathname === "/api/world-id/proof-context") {
      await readJson(request);
      return json(response, 200, createWorldIdProofContext(), hasPermittedPagesOrigin(request) ? proofContextCorsHeaders : {});
    }
    if (request.method === "GET" && url.pathname === "/api/market/quote") {
      const quote = quoteImgWldTrade({ side: url.searchParams.get("side"), amount: url.searchParams.get("amount") });
      return json(response, 200, { ...quote, feeBps: TRADE_FEE_BPS, assetPair: "IMG/WLD", decimals: { img: IMG_DECIMALS, wld: WLD_DECIMALS }, executable: false });
    }
    if (url.pathname.startsWith("/api/market/")) return json(response, 409, { error: "trading_not_enabled", detail: "IMG/WLD quotes are non-executable until a reviewed liquidity and settlement adapter is deployed." });
    if (request.method !== "GET" && request.method !== "HEAD") return json(response, 405, { error: "method_not_allowed" });
    return serveStatic(request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    const code = ["invalid_amount", "invalid_side", "invalid_json", "payload_too_large", "invalid_target"].includes(message) ? 400 : message === "database_unavailable" ? 503 : 500;
    return json(response, code, { error: code < 500 ? message : "internal_error" });
  }
});

server.listen(port, host, () => console.log(`Civilization DApp listening on ${host}:${server.address().port}`));
