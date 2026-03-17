"use client";

import { useEffect, useMemo, useState } from "react";
import { Contract } from "starknet";
import { useProvider } from "@starknet-react/core";

const EGS_ABI = [
  {
    type: "function",
    name: "score",
    inputs: [{ name: "token_id", type: "felt252" }],
    outputs: [{ type: "u64" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "game_over",
    inputs: [{ name: "token_id", type: "felt252" }],
    outputs: [{ type: "bool" }],
    state_mutability: "view",
  },
];

function normalizeFelt(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number") return `0x${value.toString(16)}`;
  if (typeof value === "bigint") return `0x${value.toString(16)}`;
  return String(value);
}

export function useEgsTokenStats(tokenAddress?: string, tokenId?: unknown) {
  const { provider } = useProvider();
  const [score, setScore] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const normalizedTokenId = useMemo(() => normalizeFelt(tokenId), [tokenId]);

  useEffect(() => {
    const tokenAddr = tokenAddress ?? "";
    const tokenIdHex = normalizedTokenId ?? "";
    if (!tokenAddr || !tokenIdHex) return;
    let active = true;

    async function fetchStats() {
      setLoading(true);
      setError(undefined);
      try {
        const contract = new Contract({
          abi: EGS_ABI,
          address: tokenAddr,
          providerOrAccount: provider,
        });
        const [scoreResult, gameOverResult] = await Promise.all([
          contract.call("score", [tokenIdHex]),
          contract.call("game_over", [tokenIdHex]),
        ]);

        if (!active) return;
        const scoreValue = Number(scoreResult ?? 0);
        const overValue = Boolean(
          typeof gameOverResult === "object" && "value" in gameOverResult
            ? (gameOverResult as any).value
            : gameOverResult
        );
        setScore(scoreValue);
        setGameOver(overValue);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "EGS query failed");
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [tokenAddress, normalizedTokenId, provider]);

  return { score, gameOver, loading, error };
}
