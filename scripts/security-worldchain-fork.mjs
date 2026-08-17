#!/usr/bin/env node
// Explicit opt-in: no provider is assumed reliable enough for mandatory CI.
import { main } from "./verify-worldchain-proxy.mjs";

const rpcUrl = process.env.WORLDCHAIN_RPC_URL;
if (!rpcUrl) {
  process.stderr.write(
    "WORLDCHAIN_RPC_URL is required for the read-only World Chain fork check; no RPC check was run. Run pnpm test:worldchain:proxy-verifier for the mandatory offline check.\n",
  );
  process.exitCode = 2;
} else {
  await main([
    "--rpc-url",
    rpcUrl,
    "--proxy",
    "0x0E6689d0649Ad9037465d178231b10F18518D2b0",
    "--expected-chain-id",
    "480",
  ]);
}
