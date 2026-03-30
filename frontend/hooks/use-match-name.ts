import { useState, useEffect } from 'react';

const matchNameCache = new Map<string, string>();

export function useMatchName(poolId: string, rawGameId: string, type: string) {
  const [matchName, setMatchName] = useState<string | null>(matchNameCache.get(poolId) || null);
  const [loading, setLoading] = useState<boolean>(!matchNameCache.has(poolId));

  useEffect(() => {
    // If it's already in cache, skip fetching
    if (matchNameCache.has(poolId)) {
      setMatchName(matchNameCache.get(poolId)!);
      setLoading(false);
      return;
    }

    if (!rawGameId || rawGameId === '0') {
      const fallback = `Pool #${poolId}`;
      matchNameCache.set(poolId, fallback);
      setMatchName(fallback);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const fetchName = async () => {
      try {
        const response = await fetch('/api/resolve-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poolId, rawGameId, type }),
        });

        if (!response.ok) throw new Error('Failed to resolve match name');
        
        const data = await response.json();
        
        if (isMounted) {
          matchNameCache.set(poolId, data.matchName);
          setMatchName(data.matchName);
          setLoading(false);
        }
      } catch (error) {
        console.error('[useMatchName] Error:', error);
        if (isMounted) {
          const fallback = `Pool #${poolId}`;
          matchNameCache.set(poolId, fallback);
          setMatchName(fallback);
          setLoading(false);
        }
      }
    };

    fetchName();

    return () => {
      isMounted = false;
    };
  }, [poolId, rawGameId, type]);

  return { matchName, loading };
}
