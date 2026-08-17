-- Auth.js login tickets were retired in favor of direct WalletAuth/SIWE.
-- Keep migrations 002/003 immutable for existing schema_migrations history.
DROP TABLE IF EXISTS wallet_login_tickets;
