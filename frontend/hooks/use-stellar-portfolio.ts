'use client'

import { useState, useEffect } from 'react'
import { web3Config } from '@/lib/web3-config'

export interface StellarBetEntry {
  poolId: number
  stellarPoolId: number
  amount: bigint
  predictedWinner: string
  claimed: boolean
  poolStatus: number
  totalPot: bigint
}

export interface StellarPoolEntry {
  poolId: number
  stellarPoolId: number
  status: number
  totalPot: bigint
  totalOnP1: bigint
  totalOnP2: bigint
  player1: string
  player2: string
}

export function useStellarPortfolio(stellarAddress?: string) {
  const [stellarBets, setStellarBets] = useState<StellarBetEntry[]>([])
  const [stellarPools, setStellarPools] = useState<StellarPoolEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!stellarAddress) {
      setStellarBets([])
      setStellarPools([])
      return
    }

    let isMounted = true
    setLoading(true)

    async function fetchData() {
      try {
        const { fetchStellarPoolMap, getStellarPool, getStellarBet } = await import('@/lib/stellar-pool-reader')
        const contractId = web3Config.stellarEscrowAddress

        if (!contractId) {
          console.warn('[stellar-portfolio] No escrow address configured')
          return
        }

        // 1. Fetch the pool ID map (starknet pool ID → stellar pool ID)
        const poolMap = await fetchStellarPoolMap()
        const entries = Object.entries(poolMap)

        if (entries.length === 0) {
          console.log('[stellar-portfolio] No pools in stellar-pool-map.json')
          return
        }

        const pools: StellarPoolEntry[] = []
        const bets: StellarBetEntry[] = []

        // 2. For each known pool, fetch pool state and check for user bets
        for (const [starkId, stellarId] of entries) {
          try {
            const poolData = await getStellarPool(contractId, stellarId)
            if (!poolData) continue

            pools.push({
              poolId: Number(starkId),
              stellarPoolId: stellarId,
              status: poolData.status,
              totalPot: poolData.totalPot,
              totalOnP1: poolData.totalOnP1,
              totalOnP2: poolData.totalOnP2,
              player1: poolData.player1,
              player2: poolData.player2,
            })

            // 3. Check if the connected user has a bet on this pool
            const betData = await getStellarBet(contractId, stellarId, stellarAddress!)
            if (betData && betData.amount > 0n) {
              bets.push({
                poolId: Number(starkId),
                stellarPoolId: stellarId,
                amount: betData.amount,
                predictedWinner: betData.predictedWinner,
                claimed: betData.claimed,
                poolStatus: poolData.status,
                totalPot: poolData.totalPot,
              })
            }
          } catch (err) {
            console.warn(`[stellar-portfolio] Error fetching pool ${stellarId}:`, err)
          }
        }

        if (isMounted) {
          setStellarPools(pools)
          setStellarBets(bets)
        }
      } catch (err) {
        console.error("[stellar-portfolio] Error fetching stellar portfolio:", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    
    fetchData()

    return () => { isMounted = false }
  }, [stellarAddress])

  return { stellarBets, stellarPools, loading }
}
