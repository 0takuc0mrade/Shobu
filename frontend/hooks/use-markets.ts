'use client'

import { useState, useEffect } from 'react'

export interface MarketContext {
  market_title: string
  resolution_criteria: string
}

type MarketsDB = Record<string, MarketContext>

let cachedMarkets: MarketsDB | null = null

/**
 * Fetches the LLM-generated market contexts from /markets.json.
 * Cross-reference a pool's Web2 match_id to get the Polymarket-style
 * market_title and resolution_criteria.
 */
export function useMarkets() {
  const [markets, setMarkets] = useState<MarketsDB>(cachedMarkets ?? {})
  const [loading, setLoading] = useState(!cachedMarkets)

  useEffect(() => {
    if (cachedMarkets) return

    let active = true

    async function fetchMarkets() {
      try {
        const res = await fetch('/markets.json')
        if (!res.ok) throw new Error(`Failed to fetch markets.json: ${res.status}`)
        const data: MarketsDB = await res.json()
        cachedMarkets = data
        if (active) {
          setMarkets(data)
          setLoading(false)
        }
      } catch (err) {
        console.warn('[useMarkets] Could not load markets.json:', err)
        if (active) setLoading(false)
      }
    }

    fetchMarkets()
    // Re-fetch every 60s to pick up newly created markets
    const interval = setInterval(() => {
      cachedMarkets = null
      fetchMarkets()
    }, 60_000)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  /**
   * Look up market context by match_id (e.g. "TTV_12345" or "YT_abc123").
   */
  function getMarket(matchId: string | undefined | null): MarketContext | null {
    if (!matchId) return null
    return markets[matchId] ?? null
  }

  return { markets, loading, getMarket }
}
