import assert from "node:assert/strict";
import test from "node:test";
import { CONTRACT_STATUS } from "../server/contract-status.js";
import {
  contractStatusPayload,
  readinessPayload,
} from "../server/contract-runtime-projection.js";

const configuration = { ready: true, missing: [] };
test("contract status keeps static release metadata separate from observed verification", () => {
  const body = contractStatusPayload(CONTRACT_STATUS, {
    status: "failed",
    observedAt: "2026-08-20T00:00:00.000Z",
  });
  assert.equal(body.release, CONTRACT_STATUS.release);
  assert.equal(body.runtimeVerification.status, "failed");
});

test("readiness is 200 only for a verified runtime contract and fails closed otherwise", () => {
  for (const status of ["missing_configuration", "failed", "mismatched"]) {
    const result = readinessPayload({
      schema: true,
      configuration,
      contract: { status },
    });
    assert.equal(result.ready, false, status);
    assert.equal(result.body.contract, "unverified_or_mismatched");
  }
  assert.equal(
    readinessPayload({
      schema: true,
      configuration,
      contract: { status: "verified" },
    }).ready,
    true,
  );
  assert.equal(
    readinessPayload({
      schema: false,
      configuration,
      contract: { status: "verified" },
    }).ready,
    false,
  );
});
