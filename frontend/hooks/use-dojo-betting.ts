"use client";

import { useEffect, useMemo, useState } from "react";
import { web3Config } from "@/lib/web3-config";

// -----------------------------------------------------------------------
// Data Models
// -----------------------------------------------------------------------
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

export type Web2BettingPoolModel = {
  pool_id?: string;
  match_id?: string;
  game_provider_id?: string;
  player_1_tag?: string;
  player_2_tag?: string;
  proof_nullifier_used?: boolean;
};

export type BetModel = {
  pool_id?: string;
  bettor?: string;
  predicted_winner?: string;
  amount?: string;
  claimed?: boolean;
  placed_at?: string;
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

// -----------------------------------------------------------------------
// GraphQL Fetch Helper
// -----------------------------------------------------------------------
async function graphqlQuery<T = any>(
  query: string,
  variables?: Record<string, any>,
  toriiUrl: string = web3Config.toriiUrl
): Promise<T> {
  const graphqlUrl = toriiUrl.replace(/\/graphql\/?$/, "") + "/graphql";
  const res = await fetch(graphqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Torii GraphQL error: ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`Torii GraphQL: ${json.errors[0].message}`);
  return json.data as T;
}

function extractEdges<T>(data: any, queryName: string): T[] {
  const edges = data?.[queryName]?.edges ?? [];
  return edges.map((e: any) => e.node).filter(Boolean) as T[];
}

const POOL_FIELDS = `
  pool_id game_world game_id token status settlement_mode
  egs_token_id_p1 egs_token_id_p2 total_pot total_on_p1 total_on_p2
  bettor_count_p1 bettor_count_p2 winning_player winning_total
  distributable_amount claimed_amount claimed_winner_count
  protocol_fee_amount creator deadline player_1 player_2
`;

const WEB2_POOL_FIELDS = `
  pool_id match_id game_provider_id player_1_tag player_2_tag proof_nullifier_used
`;

const BET_FIELDS = `
  pool_id bettor predicted_winner amount claimed placed_at
`;

// -----------------------------------------------------------------------
// Hooks
// -----------------------------------------------------------------------
export function useAllBettingPools() {
  const [pools, setPools] = useState<BettingPoolModel[]>([]);
  const [web2Pools, setWeb2Pools] = useState<Web2BettingPoolModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setLoading(true);

    async function fetchPools() {
      try {
        const data = await graphqlQuery(`
          query {
            shobuBettingPoolModels(limit: 1000) {
              edges { node { ${POOL_FIELDS} } }
            }
            shobuWeb2BettingPoolModels(limit: 1000) {
              edges { node { ${WEB2_POOL_FIELDS} } }
            }
          }
        `);
        const fetched = extractEdges<BettingPoolModel>(data, "shobuBettingPoolModels");
        const fetchedWeb2 = extractEdges<Web2BettingPoolModel>(data, "shobuWeb2BettingPoolModels");
        if (active) {
          setPools(fetched);
          setWeb2Pools(fetchedWeb2);
          setLoading(false);
          setError(undefined);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to fetch pools");
          setLoading(false);
        }
      }
    }

    fetchPools();
    const interval = setInterval(fetchPools, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return { pools, web2Pools, loading, error };
}

export function useUserBets(bettorAddress: string | undefined) {
  const [bets, setBets] = useState<BetModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    if (!bettorAddress) {
      setBets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    async function fetchBets() {
      try {
        const queryAddress = (bettorAddress as string).toLowerCase();
        // Torii might pad or un-pad zeros, but typically lowercasing works for equal match
        const data = await graphqlQuery(`
          query {
            shobuBetModels(where: { bettor: "${queryAddress}" }, limit: 1000) {
              edges { node { ${BET_FIELDS} } }
            }
          }
        `);
        const fetched = extractEdges<BetModel>(data, "shobuBetModels");
        if (active) {
          setBets(fetched);
          setLoading(false);
          setError(undefined);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to fetch bets");
          setLoading(false);
        }
      }
    }

    fetchBets();
    const interval = setInterval(fetchBets, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [bettorAddress]);

  return { bets, loading, error };
}

export function useBettingPool(poolId: number) {
  const [data, setData] = useState<BettingPoolModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setLoading(true);

    async function fetchPool() {
      try {
        const res = await graphqlQuery(`
          query {
            shobuBettingPoolModels(where: { pool_id: ${poolId} }, limit: 1) {
              edges { node { ${POOL_FIELDS} } }
            }
          }
        `);
        const item = extractEdges<BettingPoolModel>(res, "shobuBettingPoolModels")[0] ?? null;
        if (active) {
          setData(item);
          setLoading(false);
          setError(undefined);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to fetch pool");
          setLoading(false);
        }
      }
    }

    fetchPool();
    const interval = setInterval(fetchPool, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [poolId]);

  return { data, loading, error };
}

export function useWeb2BettingPool(poolId: number) {
  const [data, setData] = useState<Web2BettingPoolModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function fetchPool() {
      try {
        const res = await graphqlQuery(`
          query {
            shobuWeb2BettingPoolModels(where: { pool_id: ${poolId} }, limit: 1) {
              edges { node { ${WEB2_POOL_FIELDS} } }
            }
          }
        `);
        const item = extractEdges<Web2BettingPoolModel>(res, "shobuWeb2BettingPoolModels")[0] ?? null;
        if (active) {
          setData(item);
          setLoading(false);
        }
      } catch (err) {
        if (active) setLoading(false);
      }
    }

    fetchPool();
    const interval = setInterval(fetchPool, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [poolId]);

  return { data, loading };
}

export function useOddsSnapshot(poolId: number) {
  const [data, setData] = useState<OddsSnapshotModel | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchOdds() {
      try {
        const res = await graphqlQuery(`
          query {
            shobuOddsSnapshotModels(where: { pool_id: ${poolId} }, limit: 1) {
              edges { node { pool_id implied_prob_p1 implied_prob_p2 last_updated } }
            }
          }
        `);
        const item = extractEdges<OddsSnapshotModel>(res, "shobuOddsSnapshotModels")[0] ?? null;
        if (active) setData(item);
      } catch (err) {
        // ignore odds fetch errors silently
      }
    }

    fetchOdds();
    const interval = setInterval(fetchOdds, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [poolId]);

  return { data, loading: !data };
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
  const [data, setData] = useState<DenshokanConfigModel | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchConfig() {
      try {
        const res = await graphqlQuery(`
          query {
            shobuDenshokanConfigModels(limit: 1) {
              edges { node { id token_contract enabled } }
            }
          }
        `);
        const item = extractEdges<DenshokanConfigModel>(res, "shobuDenshokanConfigModels")[0] ?? null;
        if (active) setData(item);
      } catch (err) {
      }
    }
    fetchConfig();
  }, []);

  return { data, loading: false, error: undefined };
}
