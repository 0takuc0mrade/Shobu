"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const BUDOKAN_TORII_URL = process.env.NEXT_PUBLIC_BUDOKAN_TORII_URL || "";

// Phase enum from Budokan: 0=Scheduled, 1=Registration, 2=Staging, 3=Live, 4=Submission, 5=Finalized
const PHASE_LABELS: Record<number, string> = {
  0: "Scheduled",
  1: "Registration",
  2: "Staging",
  3: "Live",
  4: "Submission",
  5: "Finalized",
};

export type BudokanTournament = {
  id: string;
  name: string;
  description: string;
  phase: number;
  phaseLabel: string;
  entryCount: number;
  startTime: number;
  endTime: number;
  prizePool: string;
};

type BudokanContextValue = {
  tournaments: BudokanTournament[];
  loading: boolean;
  error?: string;
  refetch: () => void;
};

const BudokanContext = createContext<BudokanContextValue | null>(null);

// Introspect Budokan Torii to find the correct model names
async function introspectToriiModels(toriiUrl: string): Promise<string[]> {
  const res = await fetchWithTimeout(`${toriiUrl}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `{ __schema { queryType { fields { name } } } }`,
    }),
  });
  if (!res.ok) throw new Error(`Torii introspection failed: ${res.status}`);
  const json = await res.json();
  const fields = json?.data?.__schema?.queryType?.fields ?? [];
  return fields.map((f: { name: string }) => f.name);
}

// Discover and fetch tournaments from Budokan Torii
async function fetchBudokanTournaments(toriiUrl: string): Promise<BudokanTournament[]> {
  const fieldNames = await introspectToriiModels(toriiUrl);

  // Look for Tournament model queries (e.g. "budokanTournamentModels" or similar)
  const tournamentQuery = fieldNames.find(
    (n) => /tournament/i.test(n) && /models$/i.test(n) && !/connection/i.test(n)
  );

  if (!tournamentQuery) {
    // Fallback: try to find any model with "tournament" in the name
    const possibleQueries = fieldNames.filter((n) => /tournament/i.test(n));
    if (possibleQueries.length === 0) {
      console.warn("No tournament models found in Budokan Torii. Available fields:", fieldNames.filter(n => /models$/i.test(n)));
      return [];
    }
  }

  const queryName = tournamentQuery || fieldNames.find((n) => /tournament/i.test(n)) || "";
  if (!queryName) return [];

  // Try fetching with common field shapes
  const query = `{
    ${queryName} {
      edges {
        node {
          tournament_id
          name
          description
          phase
          entry_count
          start_time
          end_time
          prize_pool
        }
      }
    }
  }`;

  try {
    const res = await fetchWithTimeout(`${toriiUrl}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`Tournament query failed: ${res.status}`);
    const json = await res.json();

    // Handle the response
    const data = json?.data?.[queryName];
    if (!data) return [];

    const edges = data?.edges ?? [];
    return edges.map((edge: Record<string, Record<string, string | number>>) => {
      const node = edge.node ?? edge;
      const phase = Number(node.phase ?? node.current_phase ?? 0);
      return {
        id: String(node.tournament_id ?? node.id ?? ""),
        name: String(node.name ?? `Tournament ${node.tournament_id ?? ""}`),
        description: String(node.description ?? ""),
        phase,
        phaseLabel: PHASE_LABELS[phase] ?? `Phase ${phase}`,
        entryCount: Number(node.entry_count ?? node.entries ?? 0),
        startTime: Number(node.start_time ?? 0),
        endTime: Number(node.end_time ?? 0),
        prizePool: String(node.prize_pool ?? "0"),
      };
    });
  } catch (err) {
    // If the field names don't match, try a simpler query
    console.warn("Tournament query failed, trying simplified query:", err);
    return [];
  }
}

export function BudokanProvider({ children }: { children: React.ReactNode }) {
  const [tournaments, setTournaments] = useState<BudokanTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const fetchData = useCallback(async () => {
    if (!BUDOKAN_TORII_URL) {
      setLoading(false);
      setError("BUDOKAN_TORII_URL not configured");
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const data = await fetchBudokanTournaments(BUDOKAN_TORII_URL);
      setTournaments(data);
    } catch (err) {
      console.error("Budokan fetch error:", err);
      if (err instanceof Error && err.name === "AbortError") {
        setError("Budokan request timed out");
      } else {
        setError(err instanceof Error ? err.message : "Failed to fetch tournaments");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const value = useMemo<BudokanContextValue>(
    () => ({ tournaments, loading, error, refetch: fetchData }),
    [tournaments, loading, error, fetchData]
  );

  return <BudokanContext.Provider value={value}>{children}</BudokanContext.Provider>;
}

export function useBudokan() {
  const context = useContext(BudokanContext);
  if (!context) {
    throw new Error("useBudokan must be used within BudokanProvider");
  }
  return context;
}
