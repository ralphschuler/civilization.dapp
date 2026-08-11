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
import { worldchain } from "viem/chains";
import solc from "solc";

const RPC_URL = "https://worldchain-mainnet.g.alchemy.com/public";
const WLD_TOKEN = getAddress("0x2cfc85d8e48f8eab294be644d9e25c3030863003");
const BOOST_TREASURY = getAddress("0x4338aa98a8c969ca0675a8b0dcc7ed51f24ab886");
const KEY_FILE = process.env.WORLDCHAIN_MAINNET_KEY_FILE
  ?? `${homedir()}/.config/civilization-dapp/worldchain-mainnet.json`;
const send = process.argv.includes("--send");

function compileGame(source) {
  const output = JSON.parse(solc.compile(JSON.stringify({
    language: "Solidity",
    sources: { "CivilizationGame.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  })));
  const errors = (output.errors ?? []).filter((item) => item.severity === "error");
  if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
  const artifact = output.contracts["CivilizationGame.sol"].CivilizationGame;
  if (!artifact?.evm?.bytecode?.object) throw new Error("CivilizationGame bytecode missing");
  return artifact;
}

const [source, keyText] = await Promise.all([
  readFile(new URL("../contracts/src/CivilizationGame.sol", import.meta.url), "utf8"),
  readFile(KEY_FILE, "utf8"),
]);
const keys = JSON.parse(keyText);
if (!keys.receiverPrivateKey || !keys.attestationPrivateKey) throw new Error("mainnet key file lacks deployer or attestation key");

const artifact = compileGame(source);
const deployer = privateKeyToAccount(keys.receiverPrivateKey);
const attestationSigner = privateKeyToAccount(keys.attestationPrivateKey);
const data = encodeDeployData({
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
  args: [attestationSigner.address, WLD_TOKEN, BOOST_TREASURY],
});
const publicClient = createPublicClient({ chain: worldchain, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account: deployer, chain: worldchain, transport: http(RPC_URL) });
const [chainId, balance, gas] = await Promise.all([
  publicClient.getChainId(),
  publicClient.getBalance({ address: deployer.address }),
  publicClient.estimateGas({ account: deployer.address, data }),
]);
if (chainId !== worldchain.id) throw new Error(`unexpected chain ID ${chainId}`);

const manifest = {
  network: "World Chain Mainnet",
  chainId,
  deployer: deployer.address,
  attestationSigner: attestationSigner.address,
  worldToken: WLD_TOKEN,
  boostTreasury: BOOST_TREASURY,
  deployerNativeBalance: formatEther(balance),
  estimatedGas: gas.toString(),
  sending: send,
};
if (!send) {
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}
if (process.env.CONFIRM_MAINNET_DEPLOY !== "yes") {
  throw new Error("set CONFIRM_MAINNET_DEPLOY=yes to submit a mainnet deployment");
}
if (balance === 0n) throw new Error(`fund ${deployer.address} with World Chain native ETH before deployment`);

const hash = await walletClient.sendTransaction({ account: deployer, data, gas: (gas * 120n) / 100n });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`deployment failed: ${hash}`);
console.log(JSON.stringify({ ...manifest, transactionHash: hash, contractAddress: receipt.contractAddress, blockNumber: receipt.blockNumber.toString() }, null, 2));
