-- Durable state only. Polling cadence, finality depth, and contract scope are
-- deliberately left to the future indexer adapter and its deployment config.
CREATE TABLE chain_indexer_checkpoints (
  chain_id text NOT NULL CHECK (chain_id ~ '^[0-9]+$'),
  contract_address text NOT NULL CHECK (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
  block_number bigint NOT NULL CHECK (block_number >= 0),
  block_hash text NOT NULL CHECK (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, contract_address)
);

CREATE TABLE chain_indexer_canonical_blocks (
  chain_id text NOT NULL CHECK (chain_id ~ '^[0-9]+$'),
  contract_address text NOT NULL CHECK (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
  block_number bigint NOT NULL CHECK (block_number >= 0),
  block_hash text NOT NULL CHECK (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
  parent_hash text NOT NULL CHECK (parent_hash ~ '^0x[0-9a-fA-F]{64}$'),
  block_timestamp timestamptz NOT NULL,
  PRIMARY KEY (chain_id, contract_address, block_number),
  UNIQUE (chain_id, contract_address, block_hash)
);

CREATE TABLE chain_indexer_raw_events (
  chain_id text NOT NULL CHECK (chain_id ~ '^[0-9]+$'),
  contract_address text NOT NULL CHECK (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
  log_index integer NOT NULL CHECK (log_index >= 0),
  block_number bigint NOT NULL CHECK (block_number >= 0),
  block_hash text NOT NULL CHECK (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
  transaction_index integer NOT NULL CHECK (transaction_index >= 0),
  topics jsonb NOT NULL,
  data text NOT NULL CHECK (data ~ '^0x[0-9a-fA-F]*$'),
  indexed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, contract_address, transaction_hash, log_index)
);

CREATE INDEX chain_indexer_raw_events_chain_block_order_idx
  ON chain_indexer_raw_events (
    chain_id, contract_address, block_number, transaction_index, log_index
  );

CREATE INDEX chain_indexer_raw_events_chain_block_hash_idx
  ON chain_indexer_raw_events (chain_id, contract_address, block_hash);
