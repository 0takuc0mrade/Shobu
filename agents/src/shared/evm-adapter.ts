import { createWalletClient, http, publicActions, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';

// Define the Beam Testnet network
export const beamTestnet = defineChain({
  id: 13337,
  name: 'Beam Testnet',
  network: 'beam-testnet',
  nativeCurrency: { name: 'Beam', symbol: 'BEAM', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://build.onbeam.com/rpc/testnet'] },
    public: { http: ['https://build.onbeam.com/rpc/testnet'] },
  },
  blockExplorers: {
    default: { name: 'Beam Explorer', url: 'https://explorer.testnet.onbeam.com' },
  },
});

export const hashkeyTestnet = defineChain({
  id: 133,
  name: "HashKey Chain Testnet",
  network: "hashkey-testnet",
  nativeCurrency: { name: "HashKey EcoPoints", symbol: "HSK", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://hashkeychain-testnet.alt.technology"] },
    public:  { http: ["https://hashkeychain-testnet.alt.technology"] },
  },
  blockExplorers: {
    default: { name: "HashKey Explorer", url: "https://hashkeychain-testnet-explorer.alt.technology" },
  },
  testnet: true,
});

export const shrapnelSubnet = defineChain({
  id: 2044, // Shrapnel subnet ID placeholder
  name: 'Shrapnel Subnet',
  network: 'shrapnel-mainnet',
  nativeCurrency: { name: 'SHRAP', symbol: 'SHRAP', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://subnets.avax.network/shrapnel/mainnet/rpc'] },
    public: { http: ['https://subnets.avax.network/shrapnel/mainnet/rpc'] },
  },
});

const ESCROW_ABI = [
  {
    "type": "function",
    "name": "createPool",
    "inputs": [
      { "name": "token", "type": "address", "internalType": "address" },
      { "name": "player1", "type": "address", "internalType": "address" },
      { "name": "player2", "type": "address", "internalType": "address" },
      { "name": "deadline", "type": "uint64", "internalType": "uint64" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settlePool",
    "inputs": [
      { "name": "poolId", "type": "uint32", "internalType": "uint32" },
      { "name": "winner", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
] as const;

export function getEVMAdapter(chain = beamTestnet) {
  const privateKeyString = process.env.AGENT_EVM_PRIVATE_KEY;
  if (!privateKeyString) {
    throw new Error("Missing AGENT_EVM_PRIVATE_KEY in .env");
  }

  // Ensure prefix 0x is there
  const privateKey = privateKeyString.startsWith('0x') 
    ? privateKeyString as `0x${string}`
    : `0x${privateKeyString}` as `0x${string}`;

  const account = privateKeyToAccount(privateKey);

  const client = createWalletClient({
    account,
    chain,
    transport: http()
  }).extend(publicActions);

  return {
    client,
    account,
    createPool: async (escrowAddress: `0x${string}`, token: `0x${string}`, player1: `0x${string}`, player2: `0x${string}`, deadline: bigint) => {
      const { request } = await client.simulateContract({
        address: escrowAddress,
        abi: ESCROW_ABI,
        functionName: 'createPool',
        args: [token, player1, player2, deadline]
      });
      return client.writeContract(request);
    },
    settlePool: async (escrowAddress: `0x${string}`, poolId: number, winner: `0x${string}`) => {
      const { request } = await client.simulateContract({
        address: escrowAddress,
        abi: ESCROW_ABI,
        functionName: 'settlePool',
        args: [poolId, winner]
      });
      return client.writeContract(request);
    }
  };
}

export function getShrapnelClient() {
  return createPublicClient({
    chain: shrapnelSubnet,
    transport: http()
  });
}

// Mock Extraction Shooter ABI
const SHRAPNEL_ABI = [
  {
    "type": "event",
    "name": "ExtractionSuccessful",
    "inputs": [
      { "name": "matchId", "type": "bytes32", "indexed": true },
      { "name": "player", "type": "address", "indexed": true },
      { "name": "sigmaDeposited", "type": "uint256", "indexed": false }
    ]
  }
] as const;

/**
 * Checks the Avalanche Shrapnel subnet to see if a player successfully
 * extracted from the given match, and how much sigma they deposited.
 */
export async function checkExtractionStatus(shrapnelMatchContract: `0x${string}`, matchId: `0x${string}`, player: `0x${string}`) {
  const client = getShrapnelClient();
  
  // Note: in a production setting we'd track fromBlock/toBlock to avoid massive RPC scans
  const logs = await client.getLogs({
    address: shrapnelMatchContract,
    event: SHRAPNEL_ABI[0],
    args: { matchId, player },
    fromBlock: 'earliest',
    toBlock: 'latest'
  });
  
  if (logs.length > 0) {
    // Return extraction details from the first matching event
    return { extracted: true, sigma: logs[0].args.sigmaDeposited ?? 0n };
  }
  return { extracted: false, sigma: 0n };
}
