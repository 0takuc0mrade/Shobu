"use client";

import { useEffect, useState } from "react";
import { EgsGame, EgsSessionToken } from "@/lib/egs-types";

// Removed @dojoengine/torii-client dependency to fix Termux WASM incompatibility

export function useEgsSessionTokens(params: {
  games: EgsGame[];
  accountAddress?: string;
  enabled?: boolean;
  pollIntervalMs?: number;
}) {
  const { games, accountAddress, enabled = true } = params;
  const [tokensByWorld, setTokensByWorld] = useState<Record<string, EgsSessionToken[]>>({});
  const [loading, setLoading] = useState(false);
  const [error] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled || !accountAddress || games.length === 0) {
      setTokensByWorld({});
      setLoading(false);
      return;
    }
    
    // Fallback/Mock Implementation until Token Balances GraphQL query is fully supported
    setLoading(false);
  }, [games, accountAddress, enabled]);

  return { tokensByWorld, loading, error };
}
