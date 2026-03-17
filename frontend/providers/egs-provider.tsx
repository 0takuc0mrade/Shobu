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
    if (games.length === 0) return [];
    return games.map((game) => {
      const pool =
        pools.find((candidate) => {
          if (!candidate?.game_world || !candidate?.game_id) return false;
          const poolGameId = Number(candidate.game_id);
          return (
            sameAddress(candidate.game_world, game.worldAddress) &&
            Number.isFinite(poolGameId) &&
            poolGameId === game.gameId
          );
        }) ?? null;
      return {
        ...game,
        pool,
        bettable: Boolean(pool),
      };
    });
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
