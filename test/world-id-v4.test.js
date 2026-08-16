import test from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData } from "viem";
import { CIVILIZATION_GAME_ABI } from "../src/abi/CivilizationGame.js";
import { encodeWorldIdRegistration } from "../src/world-game.js";
import {
  parseWorldIdV4Registration,
  walletSignalHash,
} from "../src/lib/world-id-v4.js";

const wallet = "0x1111111111111111111111111111111111111111";
const action = "civilization-dev-play";

function response(overrides = {}) {
  return {
    protocol_version: "4.0",
    nonce: "42",
    action,
    environment: "production",
    responses: [
      {
        identifier: "proof_of_human",
        signal_hash: walletSignalHash(wallet),
        nullifier: "0x01",
        issuer_schema_id: 1,
        expires_at_min: 2,
        proof: ["0x01", "0x02", "0x03", "0x04", "0x05"],
      },
    ],
    ...overrides,
  };
}

test("v4 adapter binds production action and checksum wallet signal before ABI encoding", () => {
  const registration = parseWorldIdV4Registration(response(), {
    action,
    walletAddress: wallet.toLowerCase(),
  });
  const transaction = encodeWorldIdRegistration(
    registration,
    "0x3333333333333333333333333333333333333333",
  )[0];
  const decoded = decodeFunctionData({
    abi: CIVILIZATION_GAME_ABI,
    data: transaction.data,
  });
  assert.equal(decoded.functionName, "registerWorldId");
  assert.deepEqual(decoded.args, [
    1n,
    42n,
    BigInt(walletSignalHash(wallet)),
    2n,
    1n,
    [1n, 2n, 3n, 4n, 5n],
  ]);
});

test("v4 adapter fails closed on cross-environment, action, signal and response-shape mismatches", () => {
  for (const invalid of [
    response({ environment: "staging" }),
    response({ action: "play" }),
    response({ responses: [] }),
    response({ responses: [{ ...response().responses[0], signal_hash: "1" }] }),
  ])
    assert.throws(() =>
      parseWorldIdV4Registration(invalid, { action, walletAddress: wallet }),
    );
});
