"use client";

import { useEffect, useMemo, useState } from "react";
import { KeysClause, ToriiQueryBuilder } from "@dojoengine/sdk";
import { useDojoSdk } from "@/providers/dojo-provider";

export type BettingPoolModel = {
  pool_id?: string;
  game_world?: string;
  game_id?: string;
  token?: string;
  status?: string;
  settlement_mode?: string;
  egs_token_id_p1?: string;
  egs_token_id_p2?: string;
  total_pot?: string;
  total_on_p1?: string;
  total_on_p2?: string;
  bettor_count_p1?: string;
  bettor_count_p2?: string;
  winning_player?: string;
  winning_total?: string;
  distributable_amount?: string;
  claimed_amount?: string;
  claimed_winner_count?: string;
  protocol_fee_amount?: string;
  creator?: string;
  deadline?: string;
  player_1?: string;
  player_2?: string;
};

export type OddsSnapshotModel = {
  pool_id?: string;
  implied_prob_p1?: string;
  implied_prob_p2?: string;
  last_updated?: string;
};

export type DenshokanConfigModel = {
  id?: string;
  token_contract?: string;
  enabled?: boolean;
};

function toFelt(value: number) {
  return `0x${value.toString(16)}`;
}

function extractModel(entity: any, modelName: string) {
  if (!entity?.models) return null;
  const [namespace, name] = modelName.split("-");
  return entity.models?.[namespace]?.[name] ?? entity.models?.[modelName] ?? null;
}

function buildKeyQuery(modelName: string, key: string) {
  const model = modelName as `${string}-${string}`;
  return new ToriiQueryBuilder().withClause(
    KeysClause([model], [key], "FixedLen").build()
  );
}

async function fetchSingleModel(sdk: any, modelName: string, key: string) {
  const result = await sdk.getEntities({
    query: buildKeyQuery(modelName, key),
  });
  const entity = result?.items?.[0];
  return extractModel(entity, modelName);
}

function useDojoModel<T>(modelName: string, key: string) {
  const { sdk, status } = useDojoSdk();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!sdk || status !== "ready") return;
    const currentSdk = sdk;
    let active = true;
    setLoading(true);
    setError(undefined);

    async function boot() {
      try {
        const initial = (await fetchSingleModel(currentSdk, modelName, key)) as T | null;
        if (active) {
          setData(initial);
          setLoading(false);
        }

        const query = buildKeyQuery(modelName, key);
        const queryWithKeys =
          typeof (query as any).includeHashedKeys === "function"
            ? (query as any).includeHashedKeys()
            : query;

        const [, subscription] = await currentSdk.subscribeEntityQuery({
          query: queryWithKeys,
          callback: ({ data: updates }: { data?: any[] }) => {
            if (!updates || !active) return;
            const nextEntity = updates[0];
            const nextModel = extractModel(nextEntity, modelName) as T | null;
            if (nextModel) {
              setData(nextModel);
            }
          },
        });

        return () => {
          subscription?.cancel?.();
        };
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Dojo query failed");
        setLoading(false);
      }
    }

    let cleanup: (() => void) | undefined;
    boot().then((dispose) => {
      if (typeof dispose === "function") cleanup = dispose;
    });
    return () => {
      active = false;
      cleanup?.();
    };
  }, [sdk, status, modelName, key]);

  return { data, loading, error };
}

export function useBettingPool(poolId: number) {
  const key = useMemo(() => toFelt(poolId), [poolId]);
  return useDojoModel<BettingPoolModel>("shobu-BettingPool", key);
}

function extractPoolModel(entity: any): BettingPoolModel | null {
  if (!entity?.models) return null;
  return entity.models?.shobu?.BettingPool ?? entity.models?.["shobu-BettingPool"] ?? null;
}

export function useAllBettingPools() {
  const { sdk, status } = useDojoSdk();
  const [pools, setPools] = useState<BettingPoolModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!sdk || status !== "ready") return;
    const currentSdk = sdk;
    let active = true;
    setLoading(true);
    setError(undefined);

    async function boot() {
      try {
        const query = new ToriiQueryBuilder().withEntityModels(["shobu-BettingPool"]).withLimit(1000);
        const result = await currentSdk.getEntities({ query });
        const resultAny = result as any;
        const items =
          typeof resultAny?.getItems === "function" ? resultAny.getItems() : resultAny?.items ?? [];
        const nextPools = items
          .map((item: any) => extractPoolModel(item))
          .filter(Boolean) as BettingPoolModel[];

        if (active) {
          setPools(nextPools);
          setLoading(false);
        }

        const queryWithKeys =
          typeof (query as any).includeHashedKeys === "function"
            ? (query as any).includeHashedKeys()
            : query;

        const [, subscription] = await currentSdk.subscribeEntityQuery({
          query: queryWithKeys,
          callback: ({ data: updates }: { data?: any[] }) => {
            if (!active || !updates || updates.length === 0) return;
            setPools((prev) => {
              const copy = [...prev];
              for (const update of updates) {
                const model = extractPoolModel(update);
                if (!model?.pool_id) continue;
                const idx = copy.findIndex((p) => p.pool_id === model.pool_id);
                if (idx >= 0) copy[idx] = model;
                else copy.push(model);
              }
              return copy;
            });
          },
        });

        return () => subscription?.cancel?.();
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to fetch pools");
        setLoading(false);
      }
    }

    let cleanup: (() => void) | undefined;
    boot().then((dispose) => {
      if (typeof dispose === "function") cleanup = dispose;
    });
    return () => {
      active = false;
      cleanup?.();
    };
  }, [sdk, status]);

  return { pools, loading, error };
}

export function useOddsSnapshot(poolId: number) {
  const key = useMemo(() => toFelt(poolId), [poolId]);
  return useDojoModel<OddsSnapshotModel>("shobu-OddsSnapshot", key);
}

export function usePoolOdds(poolId: number) {
  const { data } = useOddsSnapshot(poolId);
  const impliedP1 = typeof data?.implied_prob_p1 === "string"
    ? Number(data.implied_prob_p1)
    : Number(data?.implied_prob_p1 ?? 0);
  const impliedP2 = typeof data?.implied_prob_p2 === "string"
    ? Number(data.implied_prob_p2)
    : Number(data?.implied_prob_p2 ?? 0);

  const odds = useMemo(() => {
    const p1 = impliedP1 > 0 ? 10000 / impliedP1 : 0;
    const p2 = impliedP2 > 0 ? 10000 / impliedP2 : 0;
    return { p1, p2, impliedP1, impliedP2 };
  }, [impliedP1, impliedP2]);

  return odds;
}

export function useDenshokanConfig() {
  const key = useMemo(() => toFelt(1), []);
  return useDojoModel<DenshokanConfigModel>("shobu-DenshokanConfig", key);
}
