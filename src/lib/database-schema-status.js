import { database } from "./database.mjs";

export const REQUIRED_SCHEMA_VERSION = "004";
export const REQUIRED_SCHEMA_VERSIONS = Object.freeze([
  "001",
  "002",
  "003",
  "004",
]);

/** Pure evaluation of the ordered migration versions returned by PostgreSQL. */
export function hasRequiredWalletAuthSchemaVersions(rows) {
  return (
    rows.length === REQUIRED_SCHEMA_VERSIONS.length &&
    rows.every((row, index) => row.version === REQUIRED_SCHEMA_VERSIONS[index])
  );
}

/** Checks connectivity and the deployed schema version without changing the DB. */
export async function walletAuthSchemaReady(query) {
  const execute =
    query ?? ((sql, parameters) => database().query(sql, parameters));
  const result = await execute(
    "SELECT version FROM schema_migrations WHERE version = ANY($1::text[]) ORDER BY version ASC",
    [REQUIRED_SCHEMA_VERSIONS],
  );
  return hasRequiredWalletAuthSchemaVersions(result.rows);
}
