import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import pg from "pg";
import { loadMigrations, runMigrations } from "../scripts/lib/migrations.mjs";
import {
  hasRequiredWalletAuthSchemaVersions,
  walletAuthSchemaReady,
} from "../src/lib/database-schema-status.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = { skip: !databaseUrl };
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function schemaName() {
  return `migration_test_${crypto.randomBytes(10).toString("hex")}`;
}

function quoteIdentifier(identifier) {
  return `"${identifier}"`;
}

async function inOwnedSchema(run) {
  const schema = schemaName();
  const admin = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 4,
    options: `-c search_path=${schema}`,
  });
  await admin.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
  try {
    return await run(pool);
  } finally {
    await pool.end();
    await admin.query(
      `DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`,
    );
    await admin.end();
  }
}

async function shippedMigrations() {
  return loadMigrations("migrations");
}

test(
  "PostgreSQL migration 003 preserves and backfills legacy tickets",
  integration,
  async () => {
    const migrations = await shippedMigrations();
    await inOwnedSchema(async (pool) => {
      await runMigrations(pool, migrations.slice(0, 2));
      await pool.query(
        "INSERT INTO wallet_login_tickets (ticket_hash, wallet_address, expires_at) VALUES ($1, $2, now() + interval '1 minute')",
        ["a".repeat(64), "0x0000000000000000000000000000000000000000"],
      );
      await runMigrations(pool, migrations);
      const result = await pool.query(
        "SELECT login_id FROM wallet_login_tickets WHERE ticket_hash = $1",
        ["a".repeat(64)],
      );
      assert.equal(result.rowCount, 1);
      assert.match(result.rows[0].login_id, uuid);
    });
  },
);

test(
  "PostgreSQL concurrent and repeated runners apply each migration once",
  integration,
  async () => {
    const migrations = await shippedMigrations();
    await inOwnedSchema(async (pool) => {
      await Promise.all([
        runMigrations(pool, migrations),
        runMigrations(pool, migrations),
      ]);
      const versions = await pool.query(
        "SELECT version FROM schema_migrations ORDER BY version",
      );
      assert.deepEqual(
        versions.rows.map(({ version }) => version),
        ["001", "002", "003"],
      );
      const tables = await pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename",
      );
      assert.deepEqual(
        tables.rows.map(({ tablename }) => tablename),
        ["schema_migrations", "wallet_auth_challenges", "wallet_login_tickets"],
      );
      const indexes = await pool.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() ORDER BY indexname",
      );
      assert.ok(
        indexes.rows.some(
          ({ indexname }) => indexname === "wallet_auth_challenges_expiry_idx",
        ),
      );
      assert.ok(
        indexes.rows.some(
          ({ indexname }) => indexname === "wallet_login_tickets_expiry_idx",
        ),
      );
      await runMigrations(pool, migrations);
      assert.equal(
        (await pool.query("SELECT version FROM schema_migrations")).rowCount,
        3,
      );
    });
  },
);

test(
  "PostgreSQL rolls back a failed migration without recording it",
  integration,
  async () => {
    const migrations = await shippedMigrations();
    const broken = {
      version: "004",
      name: "004_broken.sql",
      checksum: "broken",
      sql: "CREATE TABLE rollback_probe (id integer); SELECT missing_migration_function();",
    };
    await inOwnedSchema(async (pool) => {
      await assert.rejects(
        runMigrations(pool, [...migrations, broken]),
        /migration_failed:004/,
      );
      assert.equal(
        (await pool.query("SELECT to_regclass('rollback_probe') AS table_name"))
          .rows[0].table_name,
        null,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT 1 FROM schema_migrations WHERE version = '004'",
          )
        ).rowCount,
        0,
      );
    });
  },
);

test(
  "PostgreSQL readiness requires the complete ordered migration history",
  integration,
  async () => {
    const migrations = await shippedMigrations();
    await inOwnedSchema(async (pool) => {
      await runMigrations(pool, migrations);
      const query = pool.query.bind(pool);
      assert.equal(await walletAuthSchemaReady(query), true);
      assert.equal(
        hasRequiredWalletAuthSchemaVersions([
          { version: "001" },
          { version: "003" },
        ]),
        false,
      );
      await pool.query("DELETE FROM schema_migrations WHERE version = '002'");
      assert.equal(await walletAuthSchemaReady(query), false);
    });
  },
);
