'use client'

import { useState, useEffect } from 'react'

export function useStellarPoolOverlay(poolId: number, chainType: string | null, refreshKey: number) {
  const [data, setData] = useState<any>(null)
  const [odds, setOdds] = useState<{ p1: number; p2: number; impliedP1: number; impliedP2: number } | null>(null)

  useEffect(() => {
    if (chainType !== 'stellar' || !poolId) {
      setData(null)
      setOdds(null)
      return
    }

    let isMounted = true

    async function fetchStellarPool() {
      try {
        const { fetchStellarPoolMap, getStellarPool } = await import('@/lib/stellar-pool-reader')
        const { web3Config } = await import('@/lib/web3-config')
        const contractId = web3Config.stellarEscrowAddress || "CBWBJSBUSUYNYZYHW7MW7ARSGSUQ6T2MLMFO65D2L37LDGSXBQXP6VRR"
        
        const poolMap = await fetchStellarPoolMap()
        const stellarPoolId = poolMap[String(poolId)]
        if (stellarPoolId == null) return

        const poolData = await getStellarPool(contractId, stellarPoolId)
        if (!poolData || !isMounted) return

        // Map Soroban fields to match our UI
        const totalP1 = Number(poolData.totalOnP1 || 0)
        const totalP2 = Number(poolData.totalOnP2 || 0)
        const totalPot = Number(poolData.totalPot || 0)

        setData({
          total_on_p1: String(totalP1),
          total_on_p2: String(totalP2),
          total_pot: String(totalPot),
          status: poolData.status === 0 ? 'Open' : poolData.status === 1 ? 'Settled' : 'Cancelled',
          winning_player: poolData.winningPlayer,
          player_1: poolData.player1,
          player_2: poolData.player2,
          deadline: poolData.deadline,
        })

        if (totalP1 > 0 && totalP2 > 0) {
          const p1Odds = totalPot / totalP1
          const p2Odds = totalPot / totalP2
          const impliedP1 = (1 / p1Odds) * 100
          const impliedP2 = (1 / p2Odds) * 100
          setOdds({ p1: p1Odds, p2: p2Odds, impliedP1, impliedP2 })
        } else if (totalP1 > 0) {
          setOdds({ p1: 1, p2: 0, impliedP1: 100, impliedP2: 0 })
        } else if (totalP2 > 0) {
          setOdds({ p1: 0, p2: 1, impliedP1: 0, impliedP2: 100 })
        } else {
          setOdds({ p1: 0, p2: 0, impliedP1: 0, impliedP2: 0 })
        }
      } catch (err) {
        console.error("Error overlaying stellar pool:", err)
      }
    }

    fetchStellarPool()

    return () => { isMounted = false }
  }, [poolId, chainType, refreshKey])

  return { data, odds }
}
