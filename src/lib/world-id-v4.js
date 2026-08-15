import { encodePacked, getAddress, isAddress, keccak256 } from "viem";

const WORD = /^0x[0-9a-fA-F]{1,64}$/;
const proofWord = (value) => typeof value === "string" && WORD.test(value);

/** Matches CivilizationGame._hashToField(abi.encodePacked(address)). */
export function walletSignalHash(walletAddress) {
  if (!isAddress(walletAddress)) throw new Error("invalid_wallet_signal");
  return (
    BigInt(keccak256(encodePacked(["address"], [getAddress(walletAddress)]))) >>
    8n
  ).toString();
}

function uint(value, name) {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    (typeof value === "string" && !/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value))
  )
    throw new Error(`invalid_${name}`);
  return BigInt(value).toString();
}

/**
 * Converts only the on-chain-compatible v4 proof shape. It deliberately does
 * not invent a conversion for session or UUID nonces: such a response needs a
 * matching contract before it can authorize a transaction.
 */
export function parseWorldIdV4Registration(
  response,
  { action, walletAddress },
) {
  if (!response || typeof response !== "object" || Array.isArray(response))
    throw new Error("invalid_world_id_response");
  if (
    response.protocol_version !== "4.0" ||
    response.action !== action ||
    response.environment !== "production"
  )
    throw new Error("world_id_context_mismatch");
  const responses = response.responses;
  if (!Array.isArray(responses) || responses.length !== 1)
    throw new Error("invalid_world_id_response");
  const proof = responses[0];
  if (
    !proof ||
    proof.identifier !== "proof_of_human" ||
    !Array.isArray(proof.proof) ||
    proof.proof.length !== 5 ||
    !proof.proof.every(proofWord)
  )
    throw new Error("invalid_world_id_proof");
  const expectedSignal = walletSignalHash(walletAddress);
  if (uint(proof.signal_hash, "signal_hash") !== expectedSignal)
    throw new Error("world_id_signal_mismatch");
  return {
    nullifierHash: uint(proof.nullifier, "nullifier"),
    nonce: uint(response.nonce, "nonce"),
    signalHash: expectedSignal,
    expiresAtMin: uint(proof.expires_at_min, "expires_at_min"),
    issuerSchemaId: uint(proof.issuer_schema_id, "issuer_schema_id"),
    proof: proof.proof.map((entry) => BigInt(entry).toString()),
  };
}
