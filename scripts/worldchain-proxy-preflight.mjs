import { runWorldChainDeployment } from "./worldchain-proxy-runner.mjs";

// OpenZeppelin's address(0) open-executor sentinel is accepted only for the
// reviewed governance.executors list; all other reviewed addresses are non-zero.
const network = process.argv[1]?.includes("mainnet") ? "mainnet" : "testnet";
await runWorldChainDeployment(network);
