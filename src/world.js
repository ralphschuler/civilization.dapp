import { MiniKit } from "@worldcoin/minikit-js";
import { createPublicClient, decodeAbiParameters, encodeFunctionData, getAddress, http, isAddress, keccak256, stringToHex } from "viem";
import { worldchain } from "viem/chains";

// World App transacts only on World Chain mainnet. Sepolia is available for
// direct EVM-wallet contract tests, never through MiniKit / World App.
export const WORLD_CHAIN_ID = 480;
export const WORLD_CHAIN_SEPOLIA_ID = 4801;
export const WORLD_CHAIN_MAINNET_RPC_URL = "https://worldchain-mainnet.g.alchemy.com/public";
export const WORLD_ID_REGISTRATION_READ_ATTEMPTS = 21;
export const WORLD_ID_VERIFIER_ADDRESS = "0x00000000009E00F9FE82CfeeBB4556686da094d7";
export const CIVILIZATION_SEPOLIA_DEPLOYMENT = Object.freeze({
  game: "0xfCdB50926c3c6b2CDF3ACE76B13c9383A2DC3199",
  worldToken: "0x29147C7BEAd901E8019d7911A7DC404447877C62",
  worldIdVerifier: "0x1A64F89881FD2E38255E62c6D62b68076052DF4b",
  rpcUrl: "https://worldchain-sepolia.g.alchemy.com/public",
});

const isHttpsUrl = (value) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};

const isActionId = (value) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
const isDeployedAddress = (value) => isAddress(value) && getAddress(value) !== "0x0000000000000000000000000000000000000000";
const testnetTransactionAbi = [{
  type: "function", name: "registerWorldId", stateMutability: "nonpayable",
  inputs: [
    { name: "nullifierHash", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "signalHash", type: "uint256" },
    { name: "expiresAtMin", type: "uint64" },
    { name: "issuerSchemaId", type: "uint64" },
    { name: "proof", type: "uint256[5]" },
  ], outputs: [],
}];

const playerStateReadAbi = [{
  type: "function", name: "playerState", stateMutability: "view",
  inputs: [{ name: "account", type: "address" }], outputs: [],
}];

function isSepoliaMode(env) {
  return env?.VITE_CIVILIZATION_NETWORK === "worldchain-sepolia";
}

export function getWorldIdConfig(env = import.meta.env) {
  const testnet = isSepoliaMode(env);
  const config = {
    // World ID can be configured as a distinct app while MiniKit always uses
    // the Mini App ID below.
    appId: env?.VITE_WORLD_ID_APP_ID || env?.VITE_WORLD_APP_ID || "",
    action: env?.VITE_WORLD_ID_ACTION || "",
    contractAddress: env?.VITE_CIVILIZATION_CONTRACT_ADDRESS || "",
    proofContextEndpoint: env?.VITE_WORLD_ID_PROOF_CONTEXT_URL || "",
    environment: env?.VITE_WORLD_ID_ENVIRONMENT || "production",
    testnet,
    chainId: testnet ? WORLD_CHAIN_SEPOLIA_ID : WORLD_CHAIN_ID,
    testnetWorldToken: env?.VITE_CIVILIZATION_TESTNET_WORLD_TOKEN || "",
    testnetWorldIdVerifier: env?.VITE_CIVILIZATION_TESTNET_WORLD_ID_VERIFIER || "",
  };
  return {
    ...config,
    // A real World ID proof is only meaningful on production World Chain.
    configured: !testnet
      && /^app_[a-zA-Z0-9]+$/.test(config.appId)
      && isActionId(config.action)
      && isDeployedAddress(config.contractAddress)
      && isHttpsUrl(config.proofContextEndpoint)
      && config.environment === "production",
    testnetConfigured: testnet
      && isDeployedAddress(config.contractAddress)
      && isDeployedAddress(config.testnetWorldToken)
      && isDeployedAddress(config.testnetWorldIdVerifier),
  };
}

/** The injected bridge, not MiniKit install state, identifies World App. */
export function isWorldAppBridgePresent(worldApp = globalThis.window?.WorldApp) {
  return Boolean(worldApp);
}

// World App injects this bridge before the Mini App JavaScript executes.
// Browser demos deliberately stay walletless and never ask for a connection.
export function installWorldAppBridge() {
  if (!isWorldAppBridgePresent()) return { installed: false };
  MiniKit.install(import.meta.env.VITE_WORLD_APP_ID);
  // `app_out_of_date` is a real World App result. It must remain gated even
  // though it cannot currently authenticate or transact.
  return { installed: Boolean(MiniKit.isInstalled()), walletAddress: MiniKit.user.walletAddress || null };
}

/**
 * Reads the wallet when an action is actually started, rather than retaining
 * MiniKit's install-time snapshot. `window.WorldApp.wallet_address` is the
 * documented raw World App payload fallback while MiniKit is still populating
 * its normalized user state.
 */
export function resolveWorldWalletAddress({ miniKit = MiniKit, worldApp = globalThis.window?.WorldApp } = {}) {
  const address = miniKit?.user?.walletAddress || worldApp?.wallet_address;
  return isAddress(address) ? getAddress(address) : null;
}

const WALLET_AUTH_STATEMENT = "Bestätige deine World-Wallet für den Civilization-Spielzugang.";

export function walletAuthEndpoints(proofContextEndpoint) {
  try {
    const origin = new URL(proofContextEndpoint).origin;
    return { nonce: new URL("/api/wallet-auth/nonce", origin).toString(), verify: new URL("/api/wallet-auth/verify", origin).toString() };
  } catch { return null; }
}

/**
 * Uses a backend-issued, single-use nonce and accepts only the address that
 * the backend returns after SIWE signature, nonce and statement validation.
 */
export async function authenticateWorldWallet({
  miniKit = MiniKit, proofContextEndpoint = getWorldIdConfig().proofContextEndpoint, fetchImpl = globalThis.fetch,
} = {}) {
  const endpoints = walletAuthEndpoints(proofContextEndpoint);
  if (!miniKit?.isInstalled?.() || typeof miniKit.walletAuth !== "function" || !endpoints || typeof fetchImpl !== "function") {
    return { ok: false, reason: "wallet_auth_unavailable" };
  }
  try {
    const nonceResponse = await fetchImpl(endpoints.nonce).then(jsonResponse);
    if (typeof nonceResponse?.nonce !== "string" || !/^[A-Za-z0-9]{8,}$/.test(nonceResponse.nonce)
      || !Number.isFinite(nonceResponse.expires_at) || nonceResponse.expires_at <= Date.now()) {
      return { ok: false, reason: "invalid_wallet_auth_nonce" };
    }
    const result = await miniKit.walletAuth({
      nonce: nonceResponse.nonce,
      statement: WALLET_AUTH_STATEMENT,
      expirationTime: new Date(nonceResponse.expires_at),
    });
    if (result?.executedWith !== "minikit" || !result?.data) {
      return { ok: false, reason: "wallet_auth_rejected" };
    }
    const verified = await fetchImpl(endpoints.verify, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: result.data, nonce: nonceResponse.nonce }),
    }).then(jsonResponse);
    if (verified?.isValid !== true || !isAddress(verified.address)) return { ok: false, reason: "wallet_auth_verification_failed" };
    return { ok: true, walletAddress: getAddress(verified.address) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "wallet_auth_rejected" };
  }
}

/**
 * Builds a deterministic MockWorldIdVerifier registration for World Chain
 * Sepolia. This is intentionally unavailable for mainnet and must never be
 * mistaken for a real World ID proof.
 */
export function buildTestnetRegistration({ config = getWorldIdConfig(), walletAddress } = {}) {
  if (!config.testnetConfigured || !isAddress(walletAddress)) throw new Error("testnet_configuration_required");
  const wallet = getAddress(walletAddress);
  const signalHash = BigInt(keccak256(wallet)) >> 8n;
  const nullifierHash = BigInt(keccak256(stringToHex(`civilization-testnet:${wallet.toLowerCase()}`)));
  return {
    chainId: WORLD_CHAIN_SEPOLIA_ID,
    to: getAddress(config.contractAddress),
    value: "0x0",
    data: encodeFunctionData({
      abi: testnetTransactionAbi,
      functionName: "registerWorldId",
      args: [nullifierHash, 2002n, signalHash, 3000n, 1n, [11n, 12n, 13n, 14n, 15n]],
    }),
  };
}

/** Sends one explicit Sepolia test transaction through an injected EVM wallet. */
export async function submitTestnetRegistration(registration, ethereum = globalThis.ethereum) {
  if (!registration || registration.chainId !== WORLD_CHAIN_SEPOLIA_ID || !ethereum?.request) {
    return { ok: false, reason: "testnet_wallet_unavailable" };
  }
  try {
    const [from] = await ethereum.request({ method: "eth_requestAccounts" });
    if (!isAddress(from)) return { ok: false, reason: "testnet_wallet_unavailable" };
    try {
      await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x12c1" }] });
    } catch (error) {
      if (error?.code !== 4902) throw error;
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x12c1",
          chainName: "World Chain Sepolia",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [CIVILIZATION_SEPOLIA_DEPLOYMENT.rpcUrl],
          blockExplorerUrls: ["https://worldchain-sepolia.explorer.alchemy.com"],
        }],
      });
    }
    const transaction = await ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: getAddress(from), to: registration.to, data: registration.data, value: registration.value }],
    });
    return typeof transaction === "string" ? { ok: true, transaction } : { ok: false, reason: "transaction_rejected" };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "transaction_rejected" };
  }
}

function validRpContext(value) {
  return value && typeof value.rp_id === "string" && typeof value.nonce === "string"
    && Number.isFinite(value.created_at) && Number.isFinite(value.expires_at)
    && typeof value.signature === "string";
}

async function jsonResponse(response) {
  if (!response?.ok) throw new Error("server_rejected_request");
  return response.json();
}

/**
 * Converts a World ID 4.0 response to the exact CivilizationGame calldata.
 * The RP server signs context only; it never decides whether a player is human
 * and never authorizes game state. `registerWorldId` verifies the ZK proof on
 * the World Chain router.
 */
export function buildWorldIdRegistration({ config = getWorldIdConfig(), walletAddress, result } = {}) {
  if (!config.configured || !isAddress(walletAddress)) throw new Error("configuration_required");
  if (result?.protocol_version !== "4.0") throw new Error("world_id_v4_proof_required");
  if (result.action && result.action !== config.action) throw new Error("unexpected_world_id_action");
  const response = result.responses?.find((item) => item.identifier === "proof_of_human");
  if (!response?.nullifier || !response.signal_hash || !response.proof || !response.expires_at_min || !response.issuer_schema_id) throw new Error("incomplete_world_id_proof");
  const proof = response.proof.map((value) => BigInt(value));
  if (proof.length !== 5) throw new Error("invalid_world_id_proof");
  return {
    chainId: WORLD_CHAIN_ID,
    to: getAddress(config.contractAddress),
    value: "0x0",
    data: encodeFunctionData({
      abi: [{
        type: "function", name: "registerWorldId", stateMutability: "nonpayable",
        inputs: [
          { name: "nullifierHash", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "signalHash", type: "uint256" },
          { name: "expiresAtMin", type: "uint64" },
          { name: "issuerSchemaId", type: "uint64" },
          { name: "proof", type: "uint256[5]" },
        ], outputs: [],
      }],
      functionName: "registerWorldId",
      args: [
        BigInt(response.nullifier),
        nonceToUint256(result.nonce),
        BigInt(response.signal_hash),
        BigInt(response.expires_at_min),
        BigInt(response.issuer_schema_id),
        proof,
      ],
    }),
  };
}

function nonceToUint256(value) {
  if (typeof value !== "string") throw new Error("invalid_world_id_nonce");
  if (/^0x[0-9a-fA-F]{1,64}$/.test(value) || /^\d+$/.test(value)) return BigInt(value);
  const compactUuid = value.replaceAll("-", "");
  if (/^[0-9a-fA-F]{1,64}$/.test(compactUuid)) return BigInt(`0x${compactUuid}`);
  throw new Error("invalid_world_id_nonce");
}

/**
 * Fetches the signed RP context used by the official React IDKit widget.
 * The backend signs context only; the widget obtains the proof natively in
 * World App and the contract remains the registration authority.
 */
export async function prepareWorldIdProofContext({
  config = getWorldIdConfig(), walletAddress, fetchImpl = globalThis.fetch,
} = {}) {
  if (!config.configured || typeof fetchImpl !== "function") return { ok: false, reason: "configuration_required" };
  if (!isAddress(walletAddress)) return { ok: false, reason: "world_wallet_unavailable" };
  try {
    const rpContext = await fetchImpl(config.proofContextEndpoint, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: config.action, signal: getAddress(walletAddress) }),
    }).then(jsonResponse);
    if (!validRpContext(rpContext)) return { ok: false, reason: "invalid_proof_context" };
    return { ok: true, rpContext, signal: getAddress(walletAddress) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "proof_failed" };
  }
}

/** Submits the already-encoded registration transaction through World App. */
export async function submitWorldIdRegistration(registration, miniKit = MiniKit) {
  if (!registration || registration.chainId !== WORLD_CHAIN_ID || !miniKit.isInstalled()) {
    return { ok: false, reason: "wallet_unavailable" };
  }
  const response = await miniKit.sendTransaction({
    chainId: WORLD_CHAIN_ID,
    transactions: [{ to: registration.to, data: registration.data, value: registration.value }],
  });
  return response?.data?.status === "success"
    ? { ok: true, transaction: response.data, userOpHash: response.data.userOpHash }
    : { ok: false, reason: "transaction_rejected" };
}

function playerStateIsRegistered(playerState) {
  if (typeof playerState === "boolean") return playerState;
  if (Array.isArray(playerState)) return playerState[0] === true;
  return playerState?.registered === true;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Reads the first playerState return value directly from World Chain mainnet. */
export async function readWorldChainPlayerState({ contractAddress, walletAddress } = {}) {
  const client = createPublicClient({ chain: worldchain, transport: http(WORLD_CHAIN_MAINNET_RPC_URL) });
  const result = await client.call({
    to: getAddress(contractAddress),
    data: encodeFunctionData({ abi: playerStateReadAbi, functionName: "playerState", args: [getAddress(walletAddress)] }),
  });
  return decodeAbiParameters([{ type: "bool" }], result.data)[0];
}

/**
 * A MiniKit success only confirms that the wallet accepted the submission.
 * Keep the World App gate closed until World Chain mainnet reports that this
 * wallet has actually been registered. The cap prevents an unavailable RPC or
 * a reverted transaction from trapping the player in an endless wait.
 */
export async function confirmWorldIdRegistration({
  config = getWorldIdConfig(), walletAddress, readPlayerState = readWorldChainPlayerState,
  attempts = WORLD_ID_REGISTRATION_READ_ATTEMPTS, retryDelayMs = 1_500, sleep = wait,
} = {}) {
  if (!config.configured || config.chainId !== WORLD_CHAIN_ID || !isAddress(walletAddress) || typeof readPlayerState !== "function") {
    return { ok: false, reason: "configuration_required" };
  }
  const totalAttempts = Math.min(WORLD_ID_REGISTRATION_READ_ATTEMPTS, Math.max(1, Number.isSafeInteger(attempts) ? attempts : WORLD_ID_REGISTRATION_READ_ATTEMPTS));
  const safeDelay = Math.max(0, Number.isFinite(retryDelayMs) ? retryDelayMs : 1_500);
  const contractAddress = getAddress(config.contractAddress);
  const wallet = getAddress(walletAddress);
  let lastReason = "registration_not_confirmed";
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      if (playerStateIsRegistered(await readPlayerState({ contractAddress, walletAddress: wallet }))) {
        return { ok: true, attempts: attempt };
      }
      lastReason = "registration_not_confirmed";
    } catch (error) {
      lastReason = error instanceof Error ? error.message : "registration_read_failed";
    }
    if (attempt < totalAttempts) await sleep(safeDelay);
  }
  return { ok: false, reason: lastReason, attempts: totalAttempts };
}
