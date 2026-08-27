import test from "node:test";
import assert from "node:assert/strict";
import { loadMigrations, runMigrations } from "../scripts/lib/migrations.mjs";
import {
  hasRequiredWalletAuthSchemaVersions,
  walletAuthSchemaReady,
} from "../src/lib/database-schema-status.js";
import { resolveSchemaReadiness } from "../src/lib/readyz-schema-status.js";

function fakePool({ applied = [], failSql } = {}) {
  const calls = [];
  const rows = [...applied];
  let released = false;
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("SELECT version, checksum"))
        return { rows, rowCount: rows.length };
      if (sql === failSql) throw new Error("broken_sql");
      if (sql.startsWith("INSERT INTO schema_migrations")) {
        rows.push({ version: params[0], checksum: params[2] });
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      released = true;
    },
  };
  return {
    calls,
    pool: { connect: async () => client },
    released: () => released,
  };
}

const migrations = [
  { version: "001", name: "001_one.sql", sql: "CREATE ONE", checksum: "one" },
  { version: "002", name: "002_two.sql", sql: "CREATE TWO", checksum: "two" },
];

test("the shipped migration files have a deterministic ascending order", async () => {
  const loaded = await loadMigrations("migrations");
  assert.deepEqual(
    loaded.map(({ version, name }) => [version, name]),
    [
      ["001", "001_wallet_auth_challenges.sql"],
      ["002", "002_wallet_login_tickets.sql"],
      ["003", "003_wallet_login_tickets_login_id.sql"],
      ["004", "004_remove_wallet_login_tickets.sql"],
      ["005", "005_wallet_auth_sessions.sql"],
      ["006", "006_wallet_auth_abuse_controls.sql"],
      ["007", "007_wallet_auth_challenge_source_capacity.sql"],
      ["008", "008_chain_indexer_foundation.sql"],
      ["009", "009_chain_indexer_raid_history_indexes.sql"],
      ["010", "010_village_appearance_preferences.sql"],
      ["011", "011_village_appearance_dawn.sql"],
      ["012", "012_chain_indexer_build_history_indexes.sql"],
    ],
  );
  assert.ok(loaded.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum)));
});

test("migration 010 persists only an allowlisted appearance per wallet", async () => {
  const migration = (await loadMigrations("migrations")).find(
    ({ version }) => version === "010",
  );
  assert.match(migration.sql, /wallet_address text PRIMARY KEY/);
  assert.match(migration.sql, /CHECK \(appearance IN \('classic', 'dusk'\)\)/);
  assert.doesNotMatch(migration.sql, /token|balance|purchase|entitlement/i);
});

test("migration 011 safely expands the appearance check constraint for dawn", async () => {
  const migration = (await loadMigrations("migrations")).find(
    ({ version }) => version === "011",
  );
  assert.match(
    migration.sql,
    /DROP CONSTRAINT IF EXISTS village_appearance_preferences_appearance_check/,
  );
  assert.match(
    migration.sql,
    /ADD CONSTRAINT village_appearance_preferences_appearance_check\s+CHECK \(appearance IN \('classic', 'dusk', 'dawn'\)\)/,
  );
  assert.doesNotMatch(migration.sql, /token|balance|purchase|entitlement/i);
});

test("migration 009 adds fixed RaidResolved participant keyset indexes", async () => {
  const migration = (await loadMigrations("migrations")).find(
    ({ version }) => version === "009",
  );
  assert.match(
    migration.sql,
    /raid_resolved_attacker_history_idx[\s\S]*topics->>1[\s\S]*block_number DESC/,
  );
  assert.match(
    migration.sql,
    /raid_resolved_defender_history_idx[\s\S]*topics->>2[\s\S]*transaction_hash DESC/,
  );
  assert.match(
    migration.sql,
    /af390e913745195551ff780aa23ddccc7690fcc6889ed8f3561f369430dcfc06/,
  );
});

test("migration 012 adds the player-scoped Build History keyset index", async () => {
  const migration = (await loadMigrations("migrations")).find(
    ({ version }) => version === "012",
  );
  assert.match(
    migration.sql,
    /chain_indexer_build_history_player_idx[\s\S]*topics->>1[\s\S]*block_number DESC/,
  );
  assert.match(
    migration.sql,
    /144141764db612aa165244e4757ada45377f0b035a67623f12033b0eb8301296/,
  );
  assert.match(
    migration.sql,
    /325e62cb3e0c4cb63ebf0d0f649861aa0425dceca42189cc0b5d7c7d797a971e/,
  );
});

test("migration 003 remains immutable and migration 004 retires its ticket table", async () => {
  const migration = await (
    await loadMigrations("migrations")
  ).find(({ version }) => version === "003");
  assert.match(migration.sql, /UPDATE wallet_login_tickets/);
  assert.match(migration.sql, /WHERE login_id IS NULL/);
  assert.match(migration.sql, /md5\(ticket_hash\)/);
  assert.match(migration.sql, /::uuid/);
  assert.doesNotMatch(migration.sql, /DELETE\s+FROM\s+wallet_login_tickets/i);
  const removal = await (
    await loadMigrations("migrations")
  ).find(({ version }) => version === "004");
  assert.match(removal.sql, /DROP TABLE IF EXISTS wallet_login_tickets/);
});

test("migration 008 creates explicit durable indexer keys and reorg lookup indexes", async () => {
  const migration = await (
    await loadMigrations("migrations")
  ).find(({ version }) => version === "008");
  assert.match(migration.sql, /CREATE TABLE chain_indexer_checkpoints/);
  assert.match(migration.sql, /PRIMARY KEY \(chain_id, contract_address\)/);
  assert.match(migration.sql, /CREATE TABLE chain_indexer_canonical_blocks/);
  assert.match(
    migration.sql,
    /PRIMARY KEY \(chain_id, contract_address, block_number\),\s*UNIQUE \(chain_id, contract_address, block_hash\)/,
  );
  assert.match(migration.sql, /CREATE TABLE chain_indexer_raw_events/);
  assert.match(
    migration.sql,
    /PRIMARY KEY \(chain_id, contract_address, transaction_hash, log_index\)/,
  );
  assert.match(
    migration.sql,
    /chain_indexer_raw_events_chain_block_order_idx[\s\S]*chain_id, contract_address, block_number/,
  );
  assert.match(
    migration.sql,
    /chain_indexer_raw_events_chain_block_hash_idx[\s\S]*chain_id, contract_address, block_hash/,
  );
});

test("migrations run in order, are recorded, and skip already applied versions", async () => {
  const first = fakePool();
  await runMigrations(first.pool, migrations);
  assert.deepEqual(
    first.calls
      .filter(({ sql }) => sql.startsWith("CREATE "))
      .map(({ sql }) => sql),
    ["CREATE ONE", "CREATE TWO"],
  );
  const second = fakePool({
    applied: [
      { version: "001", checksum: "one" },
      { version: "002", checksum: "two" },
    ],
  });
  await runMigrations(second.pool, migrations);
  assert.equal(
    second.calls.filter(
      ({ sql }) => sql === "CREATE ONE" || sql === "CREATE TWO",
    ).length,
    0,
  );
});

test("a checksum mismatch fails closed and releases the advisory lock", async () => {
  const fake = fakePool({ applied: [{ version: "001", checksum: "changed" }] });
  await assert.rejects(
    runMigrations(fake.pool, migrations),
    /migration_checksum_mismatch/,
  );
  assert.ok(fake.calls.some(({ sql }) => sql.includes("pg_advisory_unlock")));
  assert.equal(fake.released(), true);
});

test("an unknown applied version fails closed", async () => {
  const fake = fakePool({ applied: [{ version: "999", checksum: "old" }] });
  await assert.rejects(
    runMigrations(fake.pool, migrations),
    /migration_history_mismatch/,
  );
  assert.ok(fake.calls.some(({ sql }) => sql.includes("pg_advisory_unlock")));
});

test("a failed migration rolls back and releases the advisory lock", async () => {
  const fake = fakePool({ failSql: "CREATE TWO" });
  await assert.rejects(
    runMigrations(fake.pool, migrations),
    /migration_failed/,
  );
  assert.ok(fake.calls.some(({ sql }) => sql === "ROLLBACK"));
  assert.ok(fake.calls.some(({ sql }) => sql.includes("pg_advisory_unlock")));
  assert.equal(fake.released(), true);
});

test("simultaneous runners serialize on the advisory lock and the follower skips applied migrations", async () => {
  const rows = [];
  const calls = [];
  let locked = false;
  const waiters = [];
  let firstMigrationStarted;
  const firstMigrationStartedPromise = new Promise((resolve) => {
    firstMigrationStarted = resolve;
  });
  let allowFirstMigration;
  const allowFirstMigrationPromise = new Promise((resolve) => {
    allowFirstMigration = resolve;
  });

  async function acquireLock() {
    if (!locked) {
      locked = true;
      return;
    }
    await new Promise((resolve) => waiters.push(resolve));
  }

  function releaseLock() {
    const next = waiters.shift();
    if (next) next();
    else locked = false;
  }

  function sharedPool(name) {
    return {
      connect: async () => ({
        async query(sql, params) {
          calls.push({ name, sql, params });
          if (sql.includes("pg_advisory_lock")) return acquireLock();
          if (sql.includes("pg_advisory_unlock")) return releaseLock();
          if (sql.includes("SELECT version, checksum"))
            return { rows: [...rows], rowCount: rows.length };
          if (sql === "CREATE ONE") {
            firstMigrationStarted();
            await allowFirstMigrationPromise;
          }
          if (sql.startsWith("INSERT INTO schema_migrations"))
            rows.push({ version: params[0], checksum: params[2] });
          return { rows: [], rowCount: 0 };
        },
        release() {},
      }),
    };
  }

  const first = runMigrations(sharedPool("first"), migrations);
  await firstMigrationStartedPromise;
  const second = runMigrations(sharedPool("second"), migrations);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    calls.filter(({ name, sql }) => name === "second" && sql === "CREATE ONE")
      .length,
    0,
  );

  allowFirstMigration();
  await Promise.all([first, second]);
  assert.deepEqual(
    calls
      .filter(({ sql }) => sql === "CREATE ONE" || sql === "CREATE TWO")
      .map(({ name, sql }) => [name, sql]),
    [
      ["first", "CREATE ONE"],
      ["first", "CREATE TWO"],
    ],
  );
});

test("schema readiness requires every expected version in order", async () => {
  assert.equal(
    hasRequiredWalletAuthSchemaVersions([
      { version: "001" },
      { version: "002" },
      { version: "003" },
      { version: "004" },
      { version: "005" },
      { version: "006" },
      { version: "007" },
      { version: "008" },
      { version: "009" },
      { version: "010" },
      { version: "011" },
      { version: "012" },
    ]),
    true,
  );
  assert.equal(
    hasRequiredWalletAuthSchemaVersions([
      { version: "001" },
      { version: "004" },
    ]),
    false,
  );
  let query;
  assert.equal(
    await walletAuthSchemaReady(async (sql, parameters) => {
      query = { sql, parameters };
      return { rows: [{ version: "001" }, { version: "004" }] };
    }),
    false,
  );
  assert.match(query.sql, /^SELECT version FROM schema_migrations/);
  assert.match(query.sql, /ORDER BY version ASC$/);
  assert.deepEqual(query.parameters, [
    [
      "001",
      "002",
      "003",
      "004",
      "005",
      "006",
      "007",
      "008",
      "009",
      "010",
      "011",
      "012",
    ],
  ]);
});

test("readyz preserves a schema check's false result", async () => {
  assert.equal(await resolveSchemaReadiness(async () => false), false);
  assert.equal(
    await resolveSchemaReadiness(async () => {
      throw new Error("database_unavailable");
    }),
    false,
  );
});

test("the entire active src tree contains no request schema DDL", async () => {
  const { readFile } = await import("node:fs/promises");
  const { readdir } = await import("node:fs/promises");
  async function filesIn(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const file = `${directory}/${entry.name}`;
        return entry.isDirectory() ? filesIn(file) : [file];
      }),
    );
    return nested.flat();
  }
  const paths = await filesIn("src");
  const source = await Promise.all(paths.map((file) => readFile(file, "utf8")));
  assert.doesNotMatch(
    source.join("\n"),
    /\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX)\b/i,
  );
});
