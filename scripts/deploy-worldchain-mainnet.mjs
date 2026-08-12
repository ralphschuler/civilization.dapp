import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  formatEther,
  getAddress,
  http,
  keccak256,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { worldchain } from "viem/chains";
import { worldRpIdToUint64 } from "./world-id-rp.mjs";
import solc from "solc";

const RPC_URL = "https://worldchain-mainnet.g.alchemy.com/public";
const WORLD_ID_VERIFIER = getAddress("0x00000000009E00F9FE82CfeeBB4556686da094d7");
const WLD_TOKEN = getAddress("0x2cfc85d8e48f8eab294be644d9e25c3030863003");
const BOOST_TREASURY = getAddress("0x4338aa98a8c969ca0675a8b0dcc7ed51f24ab886");
const KEY_FILE = process.env.WORLDCHAIN_MAINNET_KEY_FILE
  ?? `${homedir()}/.config/civilization-dapp/worldchain-mainnet.json`;
const WORLD_ID_FILE = process.env.WORLDCHAIN_MAINNET_WORLD_ID_FILE
  ?? `${homedir()}/.config/civilization-dapp/worldchain-mainnet-world-id.json`;
const send = process.argv.includes("--send");

function decimalUint64(value, label) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = BigInt(value);
    if (parsed <= 0xffffffffffffffffn) return parsed;
  }
  throw new Error(`${label} must be a uint64 decimal string`);
}

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

const [source, keyText, worldIdText] = await Promise.all([
  readFile(new URL("../contracts/src/CivilizationGame.sol", import.meta.url), "utf8"),
  readFile(KEY_FILE, "utf8"),
  readFile(WORLD_ID_FILE, "utf8"),
]);
const keys = { ...JSON.parse(keyText), ...JSON.parse(worldIdText) };
if (!keys.receiverPrivateKey) throw new Error("mainnet key file lacks receiverPrivateKey");
if (typeof keys.worldActionId !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(keys.worldActionId)) throw new Error("mainnet key file lacks a valid World action ID");
const worldRpId = worldRpIdToUint64(keys.worldRpId);
const worldIssuerSchemaId = decimalUint64(keys.worldIssuerSchemaId, "worldIssuerSchemaId");
if (worldIssuerSchemaId === 0n) throw new Error("worldIssuerSchemaId must not be zero");
const worldCredentialGenesisIssuedAtMin = keys.worldCredentialGenesisIssuedAtMin === undefined
  ? 0n
  : decimalUint64(keys.worldCredentialGenesisIssuedAtMin, "worldCredentialGenesisIssuedAtMin");
const worldIdActionField = BigInt(keccak256(stringToHex(keys.worldActionId))) >> 8n;

const artifact = compileGame(source);
const deployer = privateKeyToAccount(keys.receiverPrivateKey);
const data = encodeDeployData({
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
  args: [
    WORLD_ID_VERIFIER,
    keys.worldActionId,
    worldRpId,
    worldIssuerSchemaId,
    worldCredentialGenesisIssuedAtMin,
    WLD_TOKEN,
    BOOST_TREASURY,
  ],
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
  worldIdVerifier: WORLD_ID_VERIFIER,
  worldActionId: keys.worldActionId,
  worldIdActionField: worldIdActionField.toString(),
  worldRpId: worldRpId.toString(),
  worldIssuerSchemaId: worldIssuerSchemaId.toString(),
  worldCredentialGenesisIssuedAtMin: worldCredentialGenesisIssuedAtMin.toString(),
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
const deployedAddress = getAddress(receipt.contractAddress);
const [
  code,
  configuredAction,
  configuredVerifier,
  configuredRpId,
  configuredIssuerSchemaId,
  configuredToken,
  configuredTreasury,
] = await Promise.all([
  publicClient.getCode({ address: deployedAddress }),
  publicClient.readContract({ address: deployedAddress, abi: artifact.abi, functionName: "worldIdAction" }),
  publicClient.readContract({ address: deployedAddress, abi: artifact.abi, functionName: "worldIdVerifier" }),
  publicClient.readContract({ address: deployedAddress, abi: artifact.abi, functionName: "worldIdRpId" }),
  publicClient.readContract({ address: deployedAddress, abi: artifact.abi, functionName: "worldIdIssuerSchemaId" }),
  publicClient.readContract({ address: deployedAddress, abi: artifact.abi, functionName: "worldToken" }),
  publicClient.readContract({ address: deployedAddress, abi: artifact.abi, functionName: "boostTreasury" }),
]);
if (
  !code
  || configuredAction !== worldIdActionField
  || configuredVerifier !== WORLD_ID_VERIFIER
  || configuredRpId !== worldRpId
  || configuredIssuerSchemaId !== worldIssuerSchemaId
  || configuredToken !== WLD_TOKEN
  || configuredTreasury !== BOOST_TREASURY
) {
  throw new Error("post-deployment contract configuration verification failed");
}
console.log(JSON.stringify({
  ...manifest,
  transactionHash: hash,
  contractAddress: deployedAddress,
  blockNumber: receipt.blockNumber.toString(),
  verified: true,
}, null, 2));
