"use client";

import { useCallback, useState } from "react";
import { cairo } from "starknet";
import { useStarkSdk } from "@/providers/stark-sdk-provider";
import { parseUnits } from "@/lib/token-utils";
import { normalizeAddress, web3Config, getTokenByAddress, supportedTokens } from "@/lib/web3-config";

type ExecuteStatus = "idle" | "submitting" | "error" | "success";
const U128_MAX = (BigInt(1) << BigInt(128)) - BigInt(1);
const U32_MAX = 2 ** 32 - 1;

export function usePlaceBet() {
  const { wallet } = useStarkSdk();
  const [status, setStatus] = useState<ExecuteStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  const placeBet = useCallback(
    async (params: {
      poolId: number;
      predictedWinner: string;
      amount: string;
      tokenAddress: string;
    }) => {
      if (!wallet?.execute) {
        setError("Wallet not connected");
        setStatus("error");
        return;
      }
      if (!web3Config.escrowAddress) {
        setError("Escrow address not configured");
        setStatus("error");
        return;
      }
      if (!Number.isFinite(params.poolId) || params.poolId < 0 || params.poolId > U32_MAX) {
        setError("Invalid pool id");
        setStatus("error");
        return;
      }

      setStatus("submitting");
      setError(undefined);
      try {
        if (wallet.ensureReady) {
          await wallet.ensureReady({ deploy: "if_needed" });
        }

        const token = getTokenByAddress(params.tokenAddress);
        if (!token) {
          throw new Error("Unsupported token");
        }
        const amountValue = parseUnits(params.amount, token.decimals);
        if (amountValue < 0n || amountValue > U128_MAX) {
          throw new Error("Bet amount exceeds u128 range");
        }
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

        const tx: any = await wallet.execute(calls, { feeMode: "sponsored" });
        if (tx?.wait) {
          await tx.wait();
        }
        setStatus("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to place bet");
        setStatus("error");
      }
    },
    [wallet]
  );

  return { placeBet, status, error };
}

export function useClaimWinnings() {
  const { wallet } = useStarkSdk();
  const [status, setStatus] = useState<ExecuteStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  const claim = useCallback(
    async (params: { poolId: number; amount: string; poolTokenAddress: string; payoutTokenAddress?: string }) => {
      const { poolId, amount, poolTokenAddress, payoutTokenAddress } = params;

      if (!wallet?.execute || !wallet?.account?.address) {
        setError("Wallet not connected");
        setStatus("error");
        return;
      }
      if (!web3Config.escrowAddress) {
        setError("Escrow address not configured");
        setStatus("error");
        return;
      }
      if (!Number.isFinite(poolId) || poolId < 0 || poolId > U32_MAX) {
        setError("Invalid pool id");
        setStatus("error");
        return;
      }
      setStatus("submitting");
      setError(undefined);
      try {
        if (wallet.ensureReady) {
          await wallet.ensureReady({ deploy: "if_needed" });
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
          
          // 1. Get Quote
          const quoteParams = new URLSearchParams({
            sellTokenAddress: normalizeAddress(poolToken.address),
            buyTokenAddress: normalizeAddress(payoutToken.address),
            sellAmount: amountValue.toString(),
            takerAddress: normalizeAddress(wallet.account.address),
            size: "1"
          });
          
          const quoteRes = await fetch(`${baseUrl}/swap/v2/quotes?${quoteParams.toString()}`);
          if (!quoteRes.ok) throw new Error("Failed to fetch swap quote");
          const quotes = await quoteRes.json();
          if (!quotes || quotes.length === 0) throw new Error("No swap route found");
          
          // 2. Build Swap Calls
          const buildRes = await fetch(`${baseUrl}/swap/v2/build`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              quoteId: quotes[0].quoteId,
              takerAddress: normalizeAddress(wallet.account.address),
              slippage: 0.05, // 5% slippage tolerance for claims
            })
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
              calldata: c.calldata
            });
          });
        }

        const tx: any = await wallet.execute(calls, { feeMode: "sponsored" });
        if (tx?.wait) {
          await tx.wait();
        }
        setStatus("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to claim winnings");
        setStatus("error");
      }
    },
    [wallet]
  );

  return { claim, status, error };
}
