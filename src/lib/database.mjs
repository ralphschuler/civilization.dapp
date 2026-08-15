import pg from "pg";

let pool;

/** Returns the single application PostgreSQL pool without logging connection data. */
export function database() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString && !process.env.PGHOST && !process.env.PGDATABASE)
      throw new Error("database_unavailable");
    pool = new pg.Pool({
      ...(connectionString ? { connectionString } : {}),
      max: 2,
    });
  }
  return pool;
}
