
export type SupportedChain = "SEPOLIA" | "MAINNET" | "KATANA";

const DEFAULT_RPC_URL = "https://api.cartridge.gg/x/starknet/sepolia";
const DEFAULT_TORII_URL = "https://api.cartridge.gg/x/shobu/torii";

const DEFAULT_ETH_ADDRESS =
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const DEFAULT_STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

// Sepolia defaults based on AVNU/Starkzap presets. Mainnet overrides should come from .env
const DEFAULT_USDC_ADDRESS =
  "0x005a643901b0ed2344c20f1882672b157fe5ea1f2d6b38c35bfe16aafe13daac";
const DEFAULT_WBTC_ADDRESS =
  "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac";
const DEFAULT_STRKBTC_ADDRESS = 
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // Replace via env
const DEFAULT_STRK20_ADDRESS = 
  "0x0fedcba9876543210fedcba9876543210fedcba9876543210fedcba987654321"; // Replace via env

const resolvedChainId = (process.env.NEXT_PUBLIC_CHAIN_ID ?? "SEPOLIA") as SupportedChain;

function denshokanGamesApi(chainId: SupportedChain) {
  if (chainId === "MAINNET") {
    return "https://denshokan-api-production.up.railway.app/games";
  }
  // Fun Factory uses a dedicated host for Sepolia
  return "https://denshokan-api-sepolia.up.railway.app/games";
}

const DEFAULT_EGS_GAMES_API = denshokanGamesApi(resolvedChainId);

export const web3Config = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? DEFAULT_RPC_URL,
  chainId: resolvedChainId,
  worldAddress: process.env.NEXT_PUBLIC_WORLD_ADDRESS ?? "",
  escrowAddress: process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? "",
  toriiUrl: process.env.NEXT_PUBLIC_TORII_URL ?? DEFAULT_TORII_URL,
  relayUrl: process.env.NEXT_PUBLIC_RELAY_URL ?? "",
  stellarEscrowAddress: process.env.NEXT_PUBLIC_STELLAR_ESCROW_ADDRESS ?? "",
  activePoolId: Number(process.env.NEXT_PUBLIC_POOL_ID ?? "1"),
  egsGamesApi:
    process.env.NEXT_PUBLIC_EGS_GAMES_API ??
    process.env.NEXT_PUBLIC_DENSHOKAN_GAMES_API ??
    DEFAULT_EGS_GAMES_API,
  egsToriiUrl: process.env.NEXT_PUBLIC_EGS_TORII_URL ?? "",
  tokens: {
    eth: {
      id: "eth",
      address: process.env.NEXT_PUBLIC_ETH_TOKEN ?? DEFAULT_ETH_ADDRESS,
      decimals: Number(process.env.NEXT_PUBLIC_ETH_DECIMALS ?? "18"),
      symbol: "ETH",
    },
    strk: {
      id: "strk",
      address: process.env.NEXT_PUBLIC_STRK_TOKEN ?? DEFAULT_STRK_ADDRESS,
      decimals: Number(process.env.NEXT_PUBLIC_STRK_DECIMALS ?? "18"),
      symbol: "STRK",
    },
    usdc: {
      id: "usdc",
      address: process.env.NEXT_PUBLIC_USDC_TOKEN ?? DEFAULT_USDC_ADDRESS,
      decimals: Number(process.env.NEXT_PUBLIC_USDC_DECIMALS ?? "6"),
      symbol: "USDC",
    },
    wbtc: {
      id: "wbtc",
      address: process.env.NEXT_PUBLIC_WBTC_TOKEN ?? DEFAULT_WBTC_ADDRESS,
      decimals: Number(process.env.NEXT_PUBLIC_WBTC_DECIMALS ?? "8"),
      symbol: "WBTC",
    },
    strkbtc: {
      id: "strkbtc",
      address: process.env.NEXT_PUBLIC_STRKBTC_TOKEN ?? DEFAULT_STRKBTC_ADDRESS,
      decimals: Number(process.env.NEXT_PUBLIC_STRKBTC_DECIMALS ?? "8"),
      symbol: "strkBTC",
    },
    strk20: {
      id: "strk20",
      address: process.env.NEXT_PUBLIC_STRK20_TOKEN ?? DEFAULT_STRK20_ADDRESS,
      decimals: Number(process.env.NEXT_PUBLIC_STRK20_DECIMALS ?? "18"),
      symbol: "STRK20",
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

export const supportedTokens = Object.values(web3Config.tokens);

export function getTokenByAddress(address: string) {
  const normalized = normalizeAddress(address).toLowerCase();
  return supportedTokens.find((t) => normalizeAddress(t.address).toLowerCase() === normalized) || web3Config.tokens.strk;
}

// Starknet field prime: P = 2^251 + 17 * 2^192 + 1
const STARKNET_PRIME = BigInt("0x0800000000000011000000000000000000000000000000000000000000000001");

function isValidStarknetAddress(addr?: string): boolean {
  if (!addr) return false;
  const normalized = normalizeAddress(addr);
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(normalized)) return false;
  try {
    const val = BigInt(normalized);
    return val > 0n && val < STARKNET_PRIME;
  } catch {
    return false;
  }
}

const PLACEHOLDER_POLICY_ADDRESSES = new Set(
  [DEFAULT_USDC_ADDRESS, DEFAULT_WBTC_ADDRESS, DEFAULT_STRKBTC_ADDRESS, DEFAULT_STRK20_ADDRESS].map((addr) =>
    normalizeAddress(addr).toLowerCase()
  )
);

function isPolicyAddress(address?: string) {
  if (!isValidStarknetAddress(address)) return false;
  const normalized = normalizeAddress(address).toLowerCase();
  return !PLACEHOLDER_POLICY_ADDRESSES.has(normalized);
}

const MAX_UINT128 = "0xffffffffffffffffffffffffffffffff";

export const cartridgePolicies = [
  web3Config.escrowAddress && isPolicyAddress(web3Config.escrowAddress)
    ? { target: normalizeAddress(web3Config.escrowAddress), method: "place_bet" }
    : null,
  web3Config.escrowAddress && isPolicyAddress(web3Config.escrowAddress)
    ? { target: normalizeAddress(web3Config.escrowAddress), method: "claim_winnings" }
    : null,
  ...supportedTokens
    .filter((token) => isPolicyAddress(token.address))
    .map((token) => ({
      target: normalizeAddress(token.address),
      method: "approve",
    })),
].filter(Boolean) as Array<{ target: string; method: string }>;

const escrowPolicyAddress = isPolicyAddress(web3Config.escrowAddress)
  ? normalizeAddress(web3Config.escrowAddress)
  : "";

const controllerContractPolicies: any = {
  ...(escrowPolicyAddress
    ? {
        [escrowPolicyAddress]: {
          name: "Shobu Escrow",
          methods: [
            { name: "Place Bet", entrypoint: "place_bet" },
            { name: "Claim Winnings", entrypoint: "claim_winnings" },
          ],
        },
      }
    : {}),
  ...(escrowPolicyAddress
    ? supportedTokens
        .filter((token) => isPolicyAddress(token.address))
        .reduce<any>((acc, token) => {
          acc[normalizeAddress(token.address)] = {
            name: `${token.symbol} Approvals`,
            methods: [
              {
                name: "Approve",
                entrypoint: "approve",
                spender: escrowPolicyAddress,
                amount: MAX_UINT128,
              },
            ],
          };
          return acc;
        }, {})
    : {}),
};

export const controllerPolicies: any = {
  contracts: controllerContractPolicies,
  messages: [],
};
