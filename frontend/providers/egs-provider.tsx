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
  const { pools, web2Pools = [], loading: poolsLoading, error: poolsError } = useAllBettingPools();
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
    // Helper to decode felt short strings to text
    const decodeHexStr = (hex?: string) => {
      if (!hex || hex === '0x0') return 'Unknown'
      try {
        const h = BigInt(hex).toString(16)
        return (h.match(/.{1,2}/g) || []).map(b => String.fromCharCode(parseInt(b, 16))).join('')
      } catch { return hex }
    }

    // A pool is "open" if its on-chain status is 0 (Open).
    // Previously we only checked deadline, but pools can be past deadline
    // yet still unsettled (status=0) and therefore still active on-chain.
    const isPoolOpen = (p: typeof pools[0]) => {
      const status = Number(p.status ?? -1);
      return status === 0;
    };

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
            isPoolOpen(candidate)
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
      // Skip if pool is not open on-chain
      if (!isPoolOpen(p)) continue;
      // Skip pools with game_world 0x0 — these are Web2 pools handled in step 3
      if (p.game_world === '0x0' || p.game_world === '0') continue;
      // Skip if already appended
      if (mapped.some(g => sameAddress(g.worldAddress, p.game_world as string) && g.gameId === Number(p.game_id))) continue;
      // Skip if it corresponds to a web2 pool
      if (web2Pools.some(w => String(w.pool_id) === String(p.pool_id))) continue;
      
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

    // 3. Map Web2 Pools (like Riot matches)
    const sortedWeb2Pools = [...web2Pools].sort((a, b) => Number(b.pool_id) - Number(a.pool_id));
    
    for (const w of sortedWeb2Pools) {
      // Find the base pool object to get total_pot and deadline
      const basePool = pools.find(p => String(p.pool_id) === String(w.pool_id));
      if (!basePool) continue;
      // Skip if pool is not open on-chain
      if (!isPoolOpen(basePool)) continue;

      const p1 = decodeHexStr(w.player_1_tag).split('#')[0] || 'Player 1';
      const p2 = decodeHexStr(w.player_2_tag).split('#')[0] || 'Player 2';
      const provider = decodeHexStr(w.game_provider_id);
      
      const isRiot = provider.includes('RIOT');

      mapped.push({
        id: `web2-${w.pool_id}`,
        gameId: Number(w.pool_id), // Map gameId to poolId for Web2
        name: `${p1} vs ${p2}`,
        worldAddress: basePool.game_world || "0xWeb2",
        color: isRiot ? "#d9304f" : "#4444ff",
        pool: basePool,
        bettable: true,
      });
    }

    return mapped;
  }, [games, pools, web2Pools]);

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
