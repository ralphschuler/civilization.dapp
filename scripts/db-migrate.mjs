import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMigrationDatabasePool } from "../src/lib/database.mjs";
import { loadMigrations, runMigrations } from "./lib/migrations.mjs";

const directory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

let pool;
let failed = false;

try {
  pool = createMigrationDatabasePool();
  await runMigrations(pool, await loadMigrations(directory));
  console.log("Database migrations are current.");
} catch (error) {
  // Do not expose connection strings, credentials, or PostgreSQL error details.
  const code =
    error instanceof Error &&
    /^(database_unavailable|migration_history_mismatch|migration_checksum_mismatch|migration_failed:\d{3})$/.test(
      error.message,
    )
      ? error.message
      : "migration_runner_failed";
  console.error(
    `Database migration failed (${code}). No application process was started.`,
  );
  failed = true;
} finally {
  if (pool) {
    try {
      await pool.end();
    } catch {
      console.error("Database migration failed (db_pool_close_failed).");
      failed = true;
    }
  }
}

if (failed) process.exitCode = 1;
