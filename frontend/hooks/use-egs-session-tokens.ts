"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ToriiClient, TokenBalance } from "@dojoengine/torii-client";
import { EgsGame, EgsSessionToken } from "@/lib/egs-types";
import { normalizeAddress, padAddress } from "@/lib/address-utils";
import { web3Config } from "@/lib/web3-config";

type TokenGroup = {
  key: string;
  toriiUrl: string;
  worldAddress: string;
  tokenAddresses: string[];
};

const DEFAULT_LIMIT = 500;

function toGameId(tokenId?: string) {
  if (!tokenId) return null;
  try {
    const value = BigInt(tokenId);
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : null;
  } catch {
    return null;
  }
}

async function fetchTokenBalances(
  client: ToriiClient,
  contractAddresses: string[],
  accountAddress: string
) {
  let cursor: string | undefined = undefined;
  const items: TokenBalance[] = [];

  do {
    const page = await client.getTokenBalances({
      contract_addresses: contractAddresses,
      account_addresses: [accountAddress],
      token_ids: [],
      pagination: {
        limit: DEFAULT_LIMIT,
        cursor,
        direction: "Forward",
        order_by: [],
      },
    });
    if (Array.isArray(page?.items)) {
      items.push(...page.items);
    }
    cursor = page?.next_cursor;
  } while (cursor);

  return items;
}

export function useEgsSessionTokens(params: {
  games: EgsGame[];
  accountAddress?: string;
  enabled?: boolean;
  pollIntervalMs?: number;
}) {
  const { games, accountAddress, enabled = true, pollIntervalMs = 15000 } = params;
  const [tokensByWorld, setTokensByWorld] = useState<Record<string, EgsSessionToken[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const clientsRef = useRef<Map<string, Promise<ToriiClient>>>(new Map());

  const groups = useMemo<TokenGroup[]>(() => {
    const next = new Map<string, TokenGroup>();
    for (const game of games) {
      if (!game.tokenAddress) continue;
      const toriiUrl = game.toriiUrl ?? web3Config.egsToriiUrl;
      if (!toriiUrl) continue;
      const worldAddress = normalizeAddress(game.worldAddress);
      if (!worldAddress) continue;
      const key = `${toriiUrl}::${worldAddress}`;
      const entry = next.get(key) ?? {
        key,
        toriiUrl,
        worldAddress,
        tokenAddresses: [],
      };
      entry.tokenAddresses.push(padAddress(game.tokenAddress));
      next.set(key, entry);
    }
    return Array.from(next.values()).map((group) => ({
      ...group,
      tokenAddresses: Array.from(new Set(group.tokenAddresses)),
    }));
  }, [games, web3Config.egsToriiUrl]);

  const groupsKey = useMemo(
    () =>
      groups
        .map((group) => `${group.key}:${group.tokenAddresses.join("|")}`)
        .sort()
        .join(","),
    [groups]
  );

  useEffect(() => {
    if (!enabled || !accountAddress || groups.length === 0) {
      setTokensByWorld({});
      setLoading(false);
      return;
    }

    let active = true;
    const paddedAccount = padAddress(accountAddress);

    async function getClient(group: TokenGroup) {
      const existing = clientsRef.current.get(group.key);
      if (existing) return existing;
      const created = Promise.resolve(
        new ToriiClient({
          toriiUrl: group.toriiUrl,
          worldAddress: group.worldAddress,
        })
      );
      clientsRef.current.set(group.key, created);
      return created;
    }

    async function fetchAll() {
      setLoading(true);
      setError(undefined);
      const nextTokensByWorld: Record<string, EgsSessionToken[]> = {};

      try {
        for (const group of groups) {
          const client = await getClient(group);
          const balances = await fetchTokenBalances(
            client,
            group.tokenAddresses,
            paddedAccount
          );

          const worldKey = normalizeAddress(group.worldAddress);
          const mapped = balances.map((balance) => ({
            worldAddress: worldKey,
            tokenAddress: normalizeAddress(balance.contract_address),
            tokenId: balance.token_id ?? "0x0",
            balance: balance.balance ?? "0",
            gameId: toGameId(balance.token_id),
            accountAddress: balance.account_address ?? paddedAccount,
          }));

          nextTokensByWorld[worldKey] = mapped;
        }

        if (active) {
          setTokensByWorld(nextTokensByWorld);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to fetch EGS sessions");
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchAll();
    const interval = setInterval(fetchAll, pollIntervalMs);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [groupsKey, accountAddress, enabled, pollIntervalMs, groups]);

  return { tokensByWorld, loading, error };
}
