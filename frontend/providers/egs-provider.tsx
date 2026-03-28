"use client";

import { createContext, useContext, useMemo } from "react";
import { useAllBettingPools } from "@/hooks/use-dojo-betting";
import { useEgsDiscovery } from "@/hooks/use-egs-discovery";
import { useEgsEventStream } from "@/hooks/use-egs-event-stream";
import { useEgsSessionTokens } from "@/hooks/use-egs-session-tokens";
import { EgsGameWithPool, EgsLiveEvent, EgsSessionToken } from "@/lib/egs-types";
import { sameAddress } from "@/lib/address-utils";
import { web3Config } from "@/lib/web3-config";
import { useStarkSdk } from "@/providers/stark-sdk-provider";

type EgsContextValue = {
  games: EgsGameWithPool[];
  loading: boolean;
  error?: string;
  eventsByWorld: Record<string, EgsLiveEvent[]>;
  lastSeenAtByWorld: Record<string, number>;
  sessionTokensByWorld: Record<string, EgsSessionToken[]>;
};

const EgsContext = createContext<EgsContextValue | null>(null);

export function EgsProvider({ children }: { children: React.ReactNode }) {
  const { games, loading: gamesLoading, error: gamesError } = useEgsDiscovery();
  const { pools, loading: poolsLoading, error: poolsError } = useAllBettingPools();
  const { address } = useStarkSdk();

  const {
    eventsByWorld,
    lastSeenAtByWorld,
    loading: eventsLoading,
    error: eventsError,
  } = useEgsEventStream({
    games,
    eventHashes: web3Config.egsEventHashes,
    gameIdIndex: web3Config.egsGameIdIndex,
    enabled: Boolean(web3Config.egsEventHashes.length && games.length),
  });

  const {
    tokensByWorld: sessionTokensByWorld,
    loading: sessionsLoading,
    error: sessionsError,
  } = useEgsSessionTokens({
    games,
    accountAddress: address,
    enabled: Boolean(address && games.length),
    pollIntervalMs: web3Config.egsPollIntervalMs,
  });

  const gamesWithPools = useMemo<EgsGameWithPool[]>(() => {
    // 1. Map existing Denshokan games
    const mapped = games.map((game) => {
      // Sort pools descending to get the newest duplicate pool if available
      const newestPools = [...pools].sort((a, b) => Number(b.pool_id) - Number(a.pool_id));
      const pool =
        newestPools.find((candidate) => {
          if (!candidate?.game_world || !candidate?.game_id) return false;
          const poolGameId = Number(candidate.game_id);
          return (
            sameAddress(candidate.game_world, game.worldAddress) &&
            Number.isFinite(poolGameId) &&
            poolGameId === game.gameId &&
            Number(candidate.deadline) * 1000 > Date.now()
          );
        }) ?? null;
      return {
        ...game,
        pool,
        bettable: Boolean(pool),
      };
    });

    // 2. Discover unknown pools (i.e. Pistols at 10 blocks) lacking Denshokan registry
    const knownWorlds = new Set(games.map(g => g.worldAddress.toLowerCase()));
    const unknownPools = pools.filter(p => p.game_world && !knownWorlds.has(p.game_world.toLowerCase()));
    
    // Sort unknown pools by ID descending so newest are processed first
    const sortedUnknownPools = [...unknownPools].sort((a, b) => Number(b.pool_id) - Number(a.pool_id));
    
    for (const p of sortedUnknownPools) {
      if (!p.game_world || !p.game_id) continue;
      // Skip if deadline passed
      if (Number(p.deadline) * 1000 <= Date.now()) continue;
      // Skip if already appended
      if (mapped.some(g => sameAddress(g.worldAddress, p.game_world as string) && g.gameId === Number(p.game_id))) continue;
      
      const isPistols = p.game_world.toLowerCase() === "0x1350566404cc897e53c6562bcdeeed5dd6aa000d6973664747873e44c2e572d".toLowerCase();
      
      mapped.push({
        id: `fallback-${p.game_world}-${p.game_id}`,
        gameId: Number(p.game_id),
        name: isPistols ? "Pistols at 10 Blocks" : `FOCG Integration #${p.game_id}`,
        worldAddress: p.game_world,
        color: isPistols ? "#cf302b" : "#555555",
        pool: p,
        bettable: true,
      });
    }

    return mapped;
  }, [games, pools]);

  const value = useMemo<EgsContextValue>(
    () => ({
      games: gamesWithPools,
      loading:
        gamesLoading ||
        (gamesWithPools.length > 0 && (poolsLoading || eventsLoading || sessionsLoading)),
      error: gamesError || poolsError || eventsError || sessionsError,
      eventsByWorld,
      lastSeenAtByWorld,
      sessionTokensByWorld,
    }),
    [
      gamesWithPools,
      gamesLoading,
      poolsLoading,
      eventsLoading,
      sessionsLoading,
      gamesError,
      poolsError,
      eventsError,
      sessionsError,
      eventsByWorld,
      lastSeenAtByWorld,
      sessionTokensByWorld,
    ]
  );

  return <EgsContext.Provider value={value}>{children}</EgsContext.Provider>;
}

export function useEgs() {
  const context = useContext(EgsContext);
  if (!context) {
    throw new Error("useEgs must be used within EgsProvider");
  }
  return context;
}
