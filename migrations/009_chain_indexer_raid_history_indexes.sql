-- Exact RaidResolved topic0; the expression indexes are deliberately fixed to
-- the two indexed participant roles and descending history keyset order.
CREATE INDEX chain_indexer_raid_resolved_attacker_history_idx
  ON chain_indexer_raw_events (chain_id, contract_address, (topics->>1), block_number DESC, transaction_index DESC, log_index DESC, transaction_hash DESC)
  WHERE topics->>0 = '0xaf390e913745195551ff780aa23ddccc7690fcc6889ed8f3561f369430dcfc06';

CREATE INDEX chain_indexer_raid_resolved_defender_history_idx
  ON chain_indexer_raw_events (chain_id, contract_address, (topics->>2), block_number DESC, transaction_index DESC, log_index DESC, transaction_hash DESC)
  WHERE topics->>0 = '0xaf390e913745195551ff780aa23ddccc7690fcc6889ed8f3561f369430dcfc06';
