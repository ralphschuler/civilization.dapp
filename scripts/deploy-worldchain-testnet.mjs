import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  formatEther,
  getAddress,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import solc from "solc";

const worldchainSepolia = defineChain({
  id: 4801,
  name: "World Chain Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://worldchain-sepolia.g.alchemy.com/public"] } },
  blockExplorers: { default: { name: "Alchemy Explorer", url: "https://worldchain-sepolia.explorer.alchemy.com" } },
  testnet: true,
});
const RPC_URL = worldchainSepolia.rpcUrls.default.http[0];
const BOOST_TREASURY = getAddress("0x4338aa98a8c969ca0675a8b0dcc7ed51f24ab886");
const KEY_FILE = process.env.WORLDCHAIN_TESTNET_KEY_FILE
  ?? `${homedir()}/.config/civilization-dapp/worldchain-mainnet.json`;
const send = process.argv.includes("--send");

function compile(sources) {
  const output = JSON.parse(solc.compile(JSON.stringify({
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  })));
  const errors = (output.errors ?? []).filter((item) => item.severity === "error");
  if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
  return output.contracts;
}

function deployData(artifact, args = []) {
  return encodeDeployData({
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    args,
  });
}

async function deploy(walletClient, publicClient, account, data) {
  const gas = await publicClient.estimateGas({ account: account.address, data });
  const hash = await walletClient.sendTransaction({ account, data, gas: (gas * 120n) / 100n });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`deployment failed: ${hash}`);
  return { address: receipt.contractAddress, gas, hash, blockNumber: receipt.blockNumber };
}

const [gameSource, tokenSource, verifierSource, keyText] = await Promise.all([
  readFile(new URL("../contracts/src/CivilizationGame.sol", import.meta.url), "utf8"),
  readFile(new URL("../test/fixtures/MockWorldToken.sol", import.meta.url), "utf8"),
  readFile(new URL("../test/fixtures/MockWorldIdVerifier.sol", import.meta.url), "utf8"),
  readFile(KEY_FILE, "utf8"),
]);
const keys = JSON.parse(keyText);
if (!keys.receiverPrivateKey) throw new Error("testnet key file lacks receiverPrivateKey");

const contracts = compile({
  "CivilizationGame.sol": { content: gameSource },
  "MockWorldToken.sol": { content: tokenSource },
  "MockWorldIdVerifier.sol": { content: verifierSource },
});
const game = contracts["CivilizationGame.sol"].CivilizationGame;
const token = contracts["MockWorldToken.sol"].MockWorldToken;
const verifier = contracts["MockWorldIdVerifier.sol"].MockWorldIdVerifier;
const account = privateKeyToAccount(keys.receiverPrivateKey);
const publicClient = createPublicClient({ chain: worldchainSepolia, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: worldchainSepolia, transport: http(RPC_URL) });
const placeholderToken = getAddress("0x0000000000000000000000000000000000000001");
const placeholderVerifier = getAddress("0x0000000000000000000000000000000000000002");
const gameArgs = [
  placeholderVerifier,
  "civilization-testnet",
  1,
  1,
  0n,
  placeholderToken,
  BOOST_TREASURY,
];
const [chainId, balance, tokenGas, verifierGas, gameGas] = await Promise.all([
  publicClient.getChainId(),
  publicClient.getBalance({ address: account.address }),
  publicClient.estimateGas({ account: account.address, data: deployData(token) }),
  publicClient.estimateGas({ account: account.address, data: deployData(verifier) }),
  publicClient.estimateGas({ account: account.address, data: deployData(game, gameArgs) }),
]);
if (chainId !== worldchainSepolia.id) throw new Error(`unexpected chain ID ${chainId}`);

const manifest = {
  network: worldchainSepolia.name,
  chainId,
  rpcUrl: RPC_URL,
  deployer: account.address,
  deployerNativeBalance: formatEther(balance),
  testOnly: {
    worldIdVerifier: "MockWorldIdVerifier; accepts test proofs only",
    worldToken: "MockWorldToken; used only to test direct 1-token/hour boost transfers",
    worldActionId: "civilization-testnet",
    worldRpId: 1,
    worldIssuerSchemaId: 1,
  },
  boostTreasury: BOOST_TREASURY,
  estimatedGas: {
    mockWorldToken: tokenGas.toString(),
    mockWorldIdVerifier: verifierGas.toString(),
    civilizationGame: gameGas.toString(),
  },
  sending: send,
};
if (!send) {
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}
if (process.env.CONFIRM_TESTNET_DEPLOY !== "yes") {
  throw new Error("set CONFIRM_TESTNET_DEPLOY=yes to submit a testnet deployment");
}
if (balance === 0n) throw new Error(`fund ${account.address} with World Chain Sepolia native ETH before deployment`);

const deployedToken = await deploy(walletClient, publicClient, account, deployData(token));
const deployedVerifier = await deploy(walletClient, publicClient, account, deployData(verifier));
const deployedGame = await deploy(walletClient, publicClient, account, deployData(game, [
  deployedVerifier.address,
  "civilization-testnet",
  1,
  1,
  0n,
  deployedToken.address,
  BOOST_TREASURY,
]));
const [code, configuredVerifier, configuredToken, configuredTreasury] = await Promise.all([
  publicClient.getCode({ address: deployedGame.address }),
  publicClient.readContract({ address: deployedGame.address, abi: game.abi, functionName: "worldIdVerifier" }),
  publicClient.readContract({ address: deployedGame.address, abi: game.abi, functionName: "worldToken" }),
  publicClient.readContract({ address: deployedGame.address, abi: game.abi, functionName: "boostTreasury" }),
]);
if (!code || configuredVerifier !== getAddress(deployedVerifier.address) || configuredToken !== getAddress(deployedToken.address) || configuredTreasury !== BOOST_TREASURY) {
  throw new Error("post-deployment contract configuration verification failed");
}
console.log(JSON.stringify({
  ...manifest,
  deployments: {
    mockWorldToken: deployedToken,
    mockWorldIdVerifier: deployedVerifier,
    civilizationGame: deployedGame,
  },
  verified: true,
}, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
