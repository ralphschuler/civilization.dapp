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
    ],
  );
  assert.ok(loaded.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum)));
});

test("migration 003 backfills legacy login IDs without deleting tickets", async () => {
  const migration = await (
    await loadMigrations("migrations")
  ).find(({ version }) => version === "003");
  assert.match(migration.sql, /UPDATE wallet_login_tickets/);
  assert.match(migration.sql, /WHERE login_id IS NULL/);
  assert.match(migration.sql, /md5\(ticket_hash\)/);
  assert.match(migration.sql, /::uuid/);
  assert.doesNotMatch(migration.sql, /DELETE\s+FROM\s+wallet_login_tickets/i);
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
    ]),
    true,
  );
  assert.equal(
    hasRequiredWalletAuthSchemaVersions([
      { version: "001" },
      { version: "003" },
    ]),
    false,
  );
  let query;
  assert.equal(
    await walletAuthSchemaReady(async (sql, parameters) => {
      query = { sql, parameters };
      return { rows: [{ version: "001" }, { version: "003" }] };
    }),
    false,
  );
  assert.match(query.sql, /^SELECT version FROM schema_migrations/);
  assert.match(query.sql, /ORDER BY version ASC$/);
  assert.deepEqual(query.parameters, [["001", "002", "003"]]);
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
