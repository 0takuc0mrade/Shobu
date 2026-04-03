"use client";

import { useCallback, useState } from "react";
import { useStarkSdk } from "@/providers/stark-sdk-provider";
import { parseUnits } from "@/lib/token-utils";
import { normalizeAddress, web3Config, getTokenByAddress } from "@/lib/web3-config";

// Safe wrappers — Privy is lazy-loaded, so these hooks may be called
// before the provider mounts. Import them dynamically and catch errors.
let usePrivy: () => { login: () => void; logout: () => void; authenticated: boolean };
let useWallets: () => { wallets: any[] };
try {
  const privyAuth = require('@privy-io/react-auth');
  usePrivy = privyAuth.usePrivy;
  useWallets = privyAuth.useWallets;
} catch {
  usePrivy = () => ({ login: () => {}, logout: () => {}, authenticated: false });
  useWallets = () => ({ wallets: [] });
}

function usePrivySafe() {
  try {
    return usePrivy();
  } catch {
    return { login: () => {}, logout: () => {}, authenticated: false };
  }
}

function useWalletsSafe() {
  try {
    return useWallets();
  } catch {
    return { wallets: [] };
  }
}

type ExecuteStatus = "idle" | "submitting" | "error" | "success";
type ChainType = "starknet" | "evm";

const U128_MAX = (BigInt(1) << BigInt(128)) - BigInt(1);
const U32_MAX = 2 ** 32 - 1;

// Live Beam Testnet Escrow contract
const BEAM_ESCROW_ADDRESS = "0xa7C48fA122879C8EBC0e3e80f60995AEB7Fe19e7" as const;

// ─── Place Bet (Dual-Chain) ─────────────────────────────────────────────
export function usePlaceBet() {
  const { wallet: starkWallet } = useStarkSdk();
  const { wallets: privyWallets } = useWallets();
  const [status, setStatus] = useState<ExecuteStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  const placeBet = useCallback(
    async (params: {
      poolId: number;
      predictedWinner: string;
      amount: string;
      tokenAddress: string;
      chainType: ChainType;
    }) => {
      setStatus("submitting");
      setError(undefined);

      try {
        if (params.chainType === "evm") {
          // ── EVM Path: Use Privy embedded wallet → viem → Beam Escrow ──
          const evmWallet = privyWallets?.[0];
          if (!evmWallet) throw new Error("No EVM wallet connected. Please sign in via Privy.");

          const { createWalletClient, createPublicClient, custom, http, encodeFunctionData, parseAbi, defineChain } = await import("viem");
          const beamTestnet = defineChain({ id: 13337, name: "Beam Testnet", nativeCurrency: { name: "Beam", symbol: "BEAM", decimals: 18 }, rpcUrls: { default: { http: ["https://build.onbeam.com/rpc/testnet"] } } });
          const ESCROW_ABI = parseAbi(["function placeBet(uint32 poolId, address predictedWinner, uint128 amount) external", "function claimWinnings(uint32 poolId) external", "function approve(address spender, uint256 amount) external returns (bool)"]);

          const provider = await evmWallet.getEthereumProvider();
          const walletClient = createWalletClient({
            chain: beamTestnet,
            transport: custom(provider),
          });
          const publicClient = createPublicClient({
            chain: beamTestnet,
            transport: http(),
          });

          const [account] = await walletClient.getAddresses();
          if (!account) throw new Error("Could not resolve EVM account address");

          const amountValue = parseUnits(params.amount, 18); // BEAM uses 18 decimals

          // 1. Approve the Escrow contract to spend tokens
          const approveTx = await walletClient.sendTransaction({
            account,
            to: params.tokenAddress as `0x${string}`,
            data: encodeFunctionData({
              abi: ESCROW_ABI,
              functionName: "approve",
              args: [BEAM_ESCROW_ADDRESS, amountValue],
            }),
          });
          await publicClient.waitForTransactionReceipt({ hash: approveTx });

          // 2. Place the bet on the Escrow contract
          const betTx = await walletClient.sendTransaction({
            account,
            to: BEAM_ESCROW_ADDRESS,
            data: encodeFunctionData({
              abi: ESCROW_ABI,
              functionName: "placeBet",
              args: [params.poolId, params.predictedWinner as `0x${string}`, BigInt(amountValue)],
            }),
          });
          await publicClient.waitForTransactionReceipt({ hash: betTx });

        } else {
          // ── Starknet Path: Use Cartridge session key → Cairo calls ──
          if (!starkWallet?.execute) throw new Error("Cartridge wallet not connected");
          if (!web3Config.escrowAddress) throw new Error("Escrow address not configured");
          if (!Number.isFinite(params.poolId) || params.poolId < 0 || params.poolId > U32_MAX) {
            throw new Error("Invalid pool id");
          }

          if (starkWallet.ensureReady) {
            await starkWallet.ensureReady({ deploy: "if_needed" });
          }

          const token = getTokenByAddress(params.tokenAddress);
          if (!token) throw new Error("Unsupported token");

          const amountValue = parseUnits(params.amount, token.decimals);
          if (amountValue < 0n || amountValue > U128_MAX) throw new Error("Bet amount exceeds u128 range");

          const { cairo } = await import("starknet");
          const amountU256 = cairo.uint256(amountValue);

          const calls = [
            {
              contractAddress: normalizeAddress(token.address),
              entrypoint: "approve",
              calldata: [
                normalizeAddress(web3Config.escrowAddress),
                amountU256.low.toString(),
                amountU256.high.toString(),
              ],
            },
            {
              contractAddress: normalizeAddress(web3Config.escrowAddress),
              entrypoint: "place_bet",
              calldata: [
                params.poolId.toString(),
                normalizeAddress(params.predictedWinner),
                amountValue.toString(),
              ],
            },
          ];

          const tx: any = await starkWallet.execute(calls, { feeMode: "sponsored" });
          if (tx?.wait) await tx.wait();
        }

        setStatus("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to place bet");
        setStatus("error");
      }
    },
    [starkWallet, privyWallets]
  );

  return { placeBet, status, error };
}

// ─── Claim Winnings (Dual-Chain) ────────────────────────────────────────
export function useClaimWinnings() {
  const { wallet: starkWallet } = useStarkSdk();
  const { wallets: privyWallets } = useWallets();
  const [status, setStatus] = useState<ExecuteStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  const claim = useCallback(
    async (params: {
      poolId: number;
      amount: string;
      poolTokenAddress: string;
      payoutTokenAddress?: string;
      chainType: ChainType;
    }) => {
      const { poolId, amount, poolTokenAddress, payoutTokenAddress, chainType } = params;

      setStatus("submitting");
      setError(undefined);

      try {
        if (chainType === "evm") {
          // ── EVM Path: Privy wallet → viem → Beam Escrow ──
          const evmWallet = privyWallets?.[0];
          if (!evmWallet) throw new Error("No EVM wallet connected. Please sign in via Privy.");

          const { createWalletClient, createPublicClient, custom, http, encodeFunctionData, parseAbi, defineChain } = await import("viem");
          const beamTestnet = defineChain({ id: 13337, name: "Beam Testnet", nativeCurrency: { name: "Beam", symbol: "BEAM", decimals: 18 }, rpcUrls: { default: { http: ["https://build.onbeam.com/rpc/testnet"] } } });
          const ESCROW_ABI = parseAbi(["function placeBet(uint32 poolId, address predictedWinner, uint128 amount) external", "function claimWinnings(uint32 poolId) external", "function approve(address spender, uint256 amount) external returns (bool)"]);

          const provider = await evmWallet.getEthereumProvider();
          const walletClient = createWalletClient({
            chain: beamTestnet,
            transport: custom(provider),
          });
          const publicClient = createPublicClient({
            chain: beamTestnet,
            transport: http(),
          });

          const [account] = await walletClient.getAddresses();
          if (!account) throw new Error("Could not resolve EVM account address");

          const claimTx = await walletClient.sendTransaction({
            account,
            to: BEAM_ESCROW_ADDRESS,
            data: encodeFunctionData({
              abi: ESCROW_ABI,
              functionName: "claimWinnings",
              args: [poolId],
            }),
          });
          await publicClient.waitForTransactionReceipt({ hash: claimTx });

        } else {
          // ── Starknet Path: Cartridge → Cairo calls + optional AVNU swap ──
          if (!starkWallet?.execute || !starkWallet?.account?.address) {
            throw new Error("Cartridge wallet not connected");
          }
          if (!web3Config.escrowAddress) throw new Error("Escrow address not configured");
          if (!Number.isFinite(poolId) || poolId < 0 || poolId > U32_MAX) {
            throw new Error("Invalid pool id");
          }

          if (starkWallet.ensureReady) {
            await starkWallet.ensureReady({ deploy: "if_needed" });
          }

          const poolToken = getTokenByAddress(poolTokenAddress);
          const payoutToken = payoutTokenAddress ? getTokenByAddress(payoutTokenAddress) : poolToken;

          const calls: any[] = [
            {
              contractAddress: normalizeAddress(web3Config.escrowAddress),
              entrypoint: "claim_winnings",
              calldata: [poolId.toString()],
            },
          ];

          // If requesting a different payout token, fetch AVNU swap route
          if (poolToken.address !== payoutToken.address) {
            const amountValue = parseUnits(amount, poolToken.decimals);

            const isSepolia = web3Config.chainId === "SEPOLIA";
            const baseUrl = isSepolia ? "https://sepolia.api.avnu.fi" : "https://starknet.api.avnu.fi";

            const quoteParams = new URLSearchParams({
              sellTokenAddress: normalizeAddress(poolToken.address),
              buyTokenAddress: normalizeAddress(payoutToken.address),
              sellAmount: amountValue.toString(),
              takerAddress: normalizeAddress(starkWallet.account.address),
              size: "1",
            });

            const quoteRes = await fetch(`${baseUrl}/swap/v2/quotes?${quoteParams.toString()}`);
            if (!quoteRes.ok) throw new Error("Failed to fetch swap quote");
            const quotes = await quoteRes.json();
            if (!quotes || quotes.length === 0) throw new Error("No swap route found");

            const buildRes = await fetch(`${baseUrl}/swap/v2/build`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                quoteId: quotes[0].quoteId,
                takerAddress: normalizeAddress(starkWallet.account.address),
                slippage: 0.05,
              }),
            });
            if (!buildRes.ok) throw new Error("Failed to build swap execution");
            const buildData = await buildRes.json();

            if (!buildData.calls || buildData.calls.length === 0) {
              throw new Error(buildData.messages?.[0] || "Invalid swap build response");
            }

            buildData.calls.forEach((c: any) => {
              calls.push({
                contractAddress: normalizeAddress(c.contractAddress),
                entrypoint: c.entrypoint,
                calldata: c.calldata,
              });
            });
          }

          const tx: any = await starkWallet.execute(calls, { feeMode: "sponsored" });
          if (tx?.wait) await tx.wait();
        }

        setStatus("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to claim winnings");
        setStatus("error");
      }
    },
    [starkWallet, privyWallets]
  );

  return { claim, status, error };
}
