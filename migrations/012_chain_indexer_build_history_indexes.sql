-- Both committed construction facts have the player in indexed topic 1.
CREATE INDEX chain_indexer_build_history_player_idx
  ON chain_indexer_raw_events (chain_id, contract_address, (topics->>1), block_number DESC, transaction_index DESC, log_index DESC, transaction_hash DESC)
  WHERE topics->>0 IN ('0x144141764db612aa165244e4757ada45377f0b035a67623f12033b0eb8301296', '0x325e62cb3e0c4cb63ebf0d0f649861aa0425dceca42189cc0b5d7c7d797a971e');
