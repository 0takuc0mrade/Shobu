"use client";

import { useCallback, useState } from "react";
import { cairo } from "starknet";
import { useStarkSdk } from "@/providers/stark-sdk-provider";
import { parseUnits } from "@/lib/token-utils";
import { normalizeAddress, web3Config } from "@/lib/web3-config";

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
      currency: "eth" | "strk";
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

        const token =
          params.currency === "eth" ? web3Config.tokens.eth : web3Config.tokens.strk;
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
    async (poolId: number) => {
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
        const calls = [
          {
            contractAddress: normalizeAddress(web3Config.escrowAddress),
            entrypoint: "claim_winnings",
            calldata: [poolId.toString()],
          },
        ];

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
