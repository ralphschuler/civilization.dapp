import pg from "pg";
import { POSTGRES_CONNECT_TIMEOUT_MS } from "./database-connect.mjs";

let pool;

function databasePoolOptions() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString && !process.env.PGHOST && !process.env.PGDATABASE)
    throw new Error("database_unavailable");
  return { ...(connectionString ? { connectionString } : {}), max: 2 };
}

/** Returns the single application PostgreSQL pool without logging connection data. */
export function database() {
  if (!pool) pool = new pg.Pool(databasePoolOptions());
  return pool;
}

/** Creates the short-lived migration pool with a bounded initial connection. */
export function createMigrationDatabasePool() {
  return new pg.Pool({
    ...databasePoolOptions(),
    connectionTimeoutMillis: POSTGRES_CONNECT_TIMEOUT_MS,
  });
}
