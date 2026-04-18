"use client";

import { useEffect, useMemo, useState } from "react";
import { web3Config } from "@/lib/web3-config";
import type { SgsActiveGame } from "@/lib/sgs-types";
import { resolveSgsGameName } from "@/lib/sgs-types";
import type { EgsGame } from "@/lib/egs-types";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const DEFAULT_POLL_MS = 10_000;

/**
 * Transforms an SGS active game into the EgsGame shape expected by
 * the existing game grid / egs-provider.
 */
function sgsToEgsGame(game: SgsActiveGame, index: number): EgsGame {
  return {
    id: `sgs-${game.sessionId}`,
    gameId: 100_000 + game.sessionId, // Offset to avoid collision with EGS IDs
    name: game.gameName || resolveSgsGameName(game.gameContractAddress),
    worldAddress: game.gameContractAddress,
    gameAddress: game.gameContractAddress,
    network: "stellar",
    image: undefined,
    color: "#3B82F6", // Stellar blue
    raw: {
      ...game,
      chain: "stellar",
      source: "sgs",
    },
  };
}

type SgsDiscoveryResult = {
  games: EgsGame[];
  activeCount: number;
  endedCount: number;
  loading: boolean;
  error?: string;
  lastLedger: number;
};

/**
 * React hook that polls the /api/sgs-games endpoint to discover active
 * games from the Stellar Game Studio Game Hub.
 *
 * Returns games in the EgsGame shape so they integrate seamlessly
 * with the existing game grid and betting UI.
 */
export function useSgsDiscovery(): SgsDiscoveryResult {
  const [games, setGames] = useState<EgsGame[]>([]);
  const [meta, setMeta] = useState({
    activeCount: 0,
    endedCount: 0,
    lastLedger: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const pollMs = web3Config.sgsPollIntervalMs || DEFAULT_POLL_MS;

  useEffect(() => {
    let active = true;

    async function fetchSgsGames() {
      setLoading(true);
      setError(undefined);
      try {
        const response = await fetchWithTimeout("/api/sgs-games", {}, 8000);
        if (!response.ok) {
          throw new Error(`SGS API failed: ${response.status}`);
        }
        const data = await response.json();

        if (!active) return;

        const sgsGames: SgsActiveGame[] = data.games || [];
        const normalized = sgsGames.map((g, i) => sgsToEgsGame(g, i));

        setGames(normalized);
        setMeta({
          activeCount: data.totalActive || 0,
          endedCount: data.totalEnded || 0,
          lastLedger: data.lastLedger || 0,
        });
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Failed to fetch SGS games"
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchSgsGames();
    const interval = setInterval(fetchSgsGames, pollMs);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pollMs]);

  return useMemo(
    () => ({
      games,
      ...meta,
      loading,
      error,
    }),
    [games, meta, loading, error]
  );
}
