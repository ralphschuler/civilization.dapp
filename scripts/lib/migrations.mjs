import crypto from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ADVISORY_LOCK_KEY = 4_414_270_044_001;

export async function loadMigrations(directory) {
  const files = (await readdir(directory))
    .filter((file) => /^\d{3}_.+\.sql$/.test(file))
    .sort();
  return Promise.all(
    files.map(async (file) => {
      const sql = await readFile(path.join(directory, file), "utf8");
      return {
        version: file.slice(0, 3),
        name: file,
        sql,
        checksum: crypto.createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, name text NOT NULL, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function runMigrations(pool, migrations) {
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    locked = true;
    await ensureMigrationTable(client);
    const applied = await client.query(
      "SELECT version, checksum FROM schema_migrations ORDER BY version",
    );
    const appliedByVersion = new Map(
      applied.rows.map((row) => [row.version, row.checksum]),
    );
    const shippedVersions = new Set(migrations.map(({ version }) => version));
    if (applied.rows.some(({ version }) => !shippedVersions.has(version)))
      throw new Error("migration_history_mismatch");
    for (const migration of migrations) {
      const previousChecksum = appliedByVersion.get(migration.version);
      if (previousChecksum) {
        if (previousChecksum !== migration.checksum)
          throw new Error("migration_checksum_mismatch");
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
          [migration.version, migration.name, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw new Error(`migration_failed:${migration.version}`, {
          cause: error,
        });
      }
    }
  } finally {
    if (locked)
      await client
        .query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY])
        .catch(() => undefined);
    client.release();
  }
}
