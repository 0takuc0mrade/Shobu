"use client";

import { useEffect, useState } from "react";
import { EgsGame, EgsLiveEvent } from "@/lib/egs-types";

type StreamParams = {
  games: EgsGame[];
  eventHashes: string[];
  gameIdIndex?: number;
  enabled?: boolean;
};

// Simplified GraphQL implementation (or placeholder) to bypass WASM crashes
export function useEgsEventStream({
  games,
  eventHashes,
  gameIdIndex = 1,
  enabled = true,
}: StreamParams) {
  const [eventsByWorld, setEventsByWorld] = useState<Record<string, EgsLiveEvent[]>>({});
  const [lastSeenAtByWorld, setLastSeenAtByWorld] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled || games.length === 0 || eventHashes.length === 0) {
      setLoading(false);
      return;
    }
    // We mock the real-time event stream until Torii supports standard GraphQL subscriptions.
    const worldKey = games[0]?.worldAddress ?? "0x0";
    setEventsByWorld({ [worldKey]: [] });
    setLastSeenAtByWorld({ [worldKey]: Date.now() });
    setLoading(false);
  }, [enabled, games, eventHashes, gameIdIndex]);

  return { eventsByWorld, lastSeenAtByWorld, loading, error };
}
