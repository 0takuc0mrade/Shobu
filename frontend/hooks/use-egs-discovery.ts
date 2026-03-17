"use client";

import { useEffect, useMemo, useState } from "react";
import { web3Config } from "@/lib/web3-config";
import { EgsGame } from "@/lib/egs-types";
import { normalizeAddress } from "@/lib/address-utils";

const DEFAULT_POLL_MS = 15000;

function extractList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.games)) return payload.games;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function pickValue(obj: any, keys: string[]) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function normalizeNetwork(value?: string) {
  if (!value) return "";
  return value.toLowerCase().replace("sn_", "").replace("starknet_", "");
}

function matchesNetwork(value?: string) {
  if (!value) return true;
  const target = normalizeNetwork(web3Config.chainId);
  const candidate = normalizeNetwork(value);
  return target === candidate;
}

function toNumber(value: any) {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeGame(entry: any): EgsGame | null {
  const gameId =
    toNumber(pickValue(entry, ["game_id", "gameId", "id", "gameID"])) ?? null;
  if (gameId == null) return null;

  const worldAddress = pickValue(entry, [
    "world_address",
    "worldAddress",
    "dojo_world",
    "world",
    "world_contract",
    "worldContract",
  ]);
  const gameAddress = pickValue(entry, [
    "game_address",
    "gameAddress",
    "game_contract",
    "gameContract",
    "contract_address",
    "contractAddress",
    "actions_address",
    "actionsAddress",
  ]);
  const resolvedWorldAddress = worldAddress ?? gameAddress;
  const resolvedGameAddress = gameAddress ?? worldAddress;
  if (!resolvedWorldAddress) return null;

  const tokenAddress = pickValue(entry, [
    "token_address",
    "tokenAddress",
    "denshokan_token",
    "denshokanToken",
    "token_contract",
    "tokenContract",
    "erc721_address",
    "erc721Address",
    "game_token",
    "gameToken",
  ]);

  const toriiUrl = pickValue(entry, [
    "torii_url",
    "toriiUrl",
    "torii",
    "indexer_url",
    "indexerUrl",
    "torii_endpoint",
    "toriiEndpoint",
  ]);

  const name =
    pickValue(entry, ["name", "title", "game_name", "gameName"]) ??
    `EGS Game #${gameId}`;

  const image = pickValue(entry, [
    "image",
    "image_url",
    "imageUrl",
    "cover_url",
    "coverUrl",
    "thumbnail",
  ]);

  const color = pickValue(entry, ["color", "theme_color", "themeColor"]);
  const network = pickValue(entry, ["network", "chain", "chain_id", "chainId"]);

  if (!matchesNetwork(network)) return null;

  return {
    id: pickValue(entry, ["id", "game_id", "gameId"])?.toString(),
    gameId,
    name: String(name),
    worldAddress: normalizeAddress(String(resolvedWorldAddress)),
    gameAddress: resolvedGameAddress
      ? normalizeAddress(String(resolvedGameAddress))
      : undefined,
    tokenAddress: tokenAddress ? normalizeAddress(String(tokenAddress)) : undefined,
    toriiUrl: toriiUrl ? String(toriiUrl) : undefined,
    network: network ? String(network) : undefined,
    image: image ? String(image) : undefined,
    color: color ? String(color) : undefined,
    raw: entry,
  };
}

export function useEgsDiscovery() {
  const [games, setGames] = useState<EgsGame[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const apiUrl = web3Config.egsGamesApi;
  const pollMs = Number(process.env.NEXT_PUBLIC_DENSHOKAN_POLL_MS ?? DEFAULT_POLL_MS);

  useEffect(() => {
    if (!apiUrl) {
      setGames([]);
      setLoading(false);
      return;
    }

    let active = true;

    async function fetchGames() {
      setLoading(true);
      setError(undefined);
      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`Denshokan API failed: ${response.status}`);
        }
        const payload = await response.json();
        const entries = extractList(payload);
        const normalized = entries
          .map((entry) => normalizeGame(entry))
          .filter(Boolean) as EgsGame[];

        if (active) {
          setGames(normalized);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to fetch Denshokan games");
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchGames();
    const interval = setInterval(fetchGames, pollMs);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [apiUrl, pollMs]);

  const value = useMemo(
    () => ({
      games,
      loading,
      error,
    }),
    [games, loading, error]
  );

  return value;
}
