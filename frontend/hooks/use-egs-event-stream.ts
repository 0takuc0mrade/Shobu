"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ToriiClient, KeysClause } from "@dojoengine/torii-client";
import { EgsGame, EgsLiveEvent } from "@/lib/egs-types";
import { normalizeAddress } from "@/lib/address-utils";
import { web3Config } from "@/lib/web3-config";

const EVENT_EMITTED_SELECTOR =
  "0x1c93f6e4703ae90f75338f29bffbe9c1662200cee981f49afeec26e892debcd";

type RawEvent = {
  transaction_hash?: string;
  keys?: string[];
  data?: string[];
};

type StreamParams = {
  games: EgsGame[];
  eventHashes: string[];
  gameIdIndex?: number;
  enabled?: boolean;
};

function eventId(world: string, event: RawEvent) {
  const tx = event.transaction_hash ?? "0x0";
  const keys = Array.isArray(event.keys) ? event.keys.join(",") : "";
  const data = Array.isArray(event.data) ? event.data.join(",") : "";
  return `${world}:${tx}:${keys}:${data}`;
}

function parseGameId(event: RawEvent, gameIdIndex: number) {
  if (!Array.isArray(event.data)) return null;
  const raw = event.data[gameIdIndex];
  if (!raw) return null;
  try {
    const value = BigInt(raw);
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : null;
  } catch {
    return null;
  }
}

function buildClauses(eventHashes: string[]): KeysClause[] {
  return eventHashes.map((hash) => ({
    keys: [EVENT_EMITTED_SELECTOR, normalizeAddress(hash)],
    pattern_matching: "VariableLen",
    models: [],
  }));
}

export function useEgsEventStream({
  games,
  eventHashes,
  gameIdIndex = 1,
  enabled = true,
}: StreamParams) {
  const [eventsByWorld, setEventsByWorld] = useState<Record<string, EgsLiveEvent[]>>({});
  const [lastSeenAtByWorld, setLastSeenAtByWorld] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const clientsRef = useRef<Map<string, Promise<ToriiClient>>>(new Map());
  const subscriptionsRef = useRef<Map<string, { cancel: () => void }>>(new Map());
  const seenRef = useRef<Map<string, Set<string>>>(new Map());

  const streamKey = useMemo(() => {
    return games
      .map((game) => {
        const toriiUrl = game.toriiUrl ?? web3Config.egsToriiUrl;
        return `${normalizeAddress(game.worldAddress)}|${toriiUrl ?? ""}`;
      })
      .sort()
      .join(",");
  }, [games, web3Config.egsToriiUrl]);

  const eventKey = useMemo(() => eventHashes.slice().sort().join(","), [eventHashes]);

  useEffect(() => {
    if (!enabled || games.length === 0 || eventHashes.length === 0) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(undefined);

    subscriptionsRef.current.forEach((sub) => sub.cancel());
    subscriptionsRef.current.clear();

    const nextSeen = new Map<string, Set<string>>();
    for (const game of games) {
      const world = normalizeAddress(game.worldAddress);
      nextSeen.set(world, seenRef.current.get(world) ?? new Set());
    }
    seenRef.current = nextSeen;

    async function getClient(key: string, toriiUrl: string, worldAddress: string) {
      const existing = clientsRef.current.get(key);
      if (existing) return existing;
      const created = Promise.resolve(
        new ToriiClient({
          toriiUrl,
          worldAddress,
        })
      );
      clientsRef.current.set(key, created);
      return created;
    }

    function ingest(world: string, event: RawEvent) {
      const id = eventId(world, event);
      const seen = seenRef.current.get(world) ?? new Set<string>();
      if (seen.has(id)) return;
      seen.add(id);
      seenRef.current.set(world, seen);

      const now = Date.now();
      const nextEvent: EgsLiveEvent = {
        id,
        worldAddress: world,
        gameId: parseGameId(event, gameIdIndex),
        txHash: event.transaction_hash,
        keys: event.keys,
        data: event.data,
        seenAt: now,
      };

      setEventsByWorld((prev) => {
        const existing = prev[world] ?? [];
        const merged = [nextEvent, ...existing].slice(0, 500);
        return { ...prev, [world]: merged };
      });
      setLastSeenAtByWorld((prev) => ({ ...prev, [world]: now }));
    }

    async function setup() {
      const clauses = buildClauses(eventHashes);
      for (const game of games) {
        const toriiUrl = game.toriiUrl ?? web3Config.egsToriiUrl;
        if (!toriiUrl) continue;
        const world = normalizeAddress(game.worldAddress);
        if (!world) continue;

        const key = `${toriiUrl}::${world}`;
        const client = await getClient(key, toriiUrl, world);
        const subscription = await client.onStarknetEvent(clauses, (payload: any) => {
          if (!active) return;
          const events = Array.isArray(payload) ? payload : [payload];
          for (const event of events) {
            if (!event) continue;
            ingest(world, event as RawEvent);
          }
        });

        subscriptionsRef.current.set(key, subscription as any);
      }
    }

    setup()
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to stream EGS events");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      subscriptionsRef.current.forEach((sub) => sub.cancel());
      subscriptionsRef.current.clear();
    };
  }, [streamKey, eventKey, enabled, games, eventHashes, gameIdIndex]);

  return { eventsByWorld, lastSeenAtByWorld, loading, error };
}
