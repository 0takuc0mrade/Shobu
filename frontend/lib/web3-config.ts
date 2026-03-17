export type SupportedChain = "SEPOLIA" | "MAINNET" | "KATANA";

const DEFAULT_RPC_URL = "http://localhost:5050";
const DEFAULT_TORII_URL = "http://localhost:8080";

const DEFAULT_ETH_ADDRESS =
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const DEFAULT_STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const resolvedChainId = (process.env.NEXT_PUBLIC_CHAIN_ID ?? "KATANA") as SupportedChain;

function funFactoryNetwork(chainId: SupportedChain) {
  if (chainId === "MAINNET") return "mainnet";
  return "sepolia";
}

const DEFAULT_EGS_GAMES_API = `https://denshokan-api-production.up.railway.app/games?network=${funFactoryNetwork(
  resolvedChainId
)}`;

export const web3Config = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? DEFAULT_RPC_URL,
  chainId: resolvedChainId,
  worldAddress: process.env.NEXT_PUBLIC_WORLD_ADDRESS ?? "",
  escrowAddress: process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? "",
  toriiUrl: process.env.NEXT_PUBLIC_TORII_URL ?? DEFAULT_TORII_URL,
  relayUrl: process.env.NEXT_PUBLIC_RELAY_URL ?? "",
  activePoolId: Number(process.env.NEXT_PUBLIC_POOL_ID ?? "1"),
  egsGamesApi:
    process.env.NEXT_PUBLIC_EGS_GAMES_API ??
    process.env.NEXT_PUBLIC_DENSHOKAN_GAMES_API ??
    DEFAULT_EGS_GAMES_API,
  egsToriiUrl: process.env.NEXT_PUBLIC_EGS_TORII_URL ?? "",
  tokens: {
    eth: {
      address: process.env.NEXT_PUBLIC_ETH_TOKEN ?? DEFAULT_ETH_ADDRESS,
      decimals: Number(process.env.NEXT_PUBLIC_ETH_DECIMALS ?? "18"),
      symbol: "ETH",
    },
    strk: {
      address: process.env.NEXT_PUBLIC_STRK_TOKEN ?? DEFAULT_STRK_ADDRESS,
      decimals: Number(process.env.NEXT_PUBLIC_STRK_DECIMALS ?? "18"),
      symbol: "STRK",
    },
  },
  egsEventHashes: (process.env.NEXT_PUBLIC_EGS_EVENT_HASHES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),
  egsFromBlock: Number(process.env.NEXT_PUBLIC_EGS_FROM_BLOCK ?? "0"),
  egsPollIntervalMs: Number(process.env.NEXT_PUBLIC_EGS_POLL_MS ?? "5000"),
  egsGameIdIndex: Number(process.env.NEXT_PUBLIC_EGS_GAME_ID_INDEX ?? "1"),
};

export function isConfiguredAddress(address?: string) {
  return Boolean(address && address.trim().length > 0 && address !== "0x0");
}

export function normalizeAddress(address?: string) {
  if (!address) return "";
  return address.startsWith("0x") ? address : `0x${address}`;
}

export const cartridgePolicies = [
  web3Config.escrowAddress
    ? { target: normalizeAddress(web3Config.escrowAddress), method: "place_bet" }
    : null,
  web3Config.escrowAddress
    ? { target: normalizeAddress(web3Config.escrowAddress), method: "claim_winnings" }
    : null,
  web3Config.tokens.eth.address
    ? { target: normalizeAddress(web3Config.tokens.eth.address), method: "approve" }
    : null,
  web3Config.tokens.strk.address
    ? { target: normalizeAddress(web3Config.tokens.strk.address), method: "approve" }
    : null,
].filter(Boolean) as Array<{ target: string; method: string }>;
