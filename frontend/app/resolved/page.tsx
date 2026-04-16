'use client'

import { useMemo, useState } from 'react'
import { TopNavBar } from '@/components/top-nav-bar'
import { Activity, LineChart, Wallet, CheckCircle2, XCircle, Clock, Terminal, Settings } from 'lucide-react'
import { useAllBettingPools, useUserBets } from '@/hooks/use-dojo-betting'
import { useStarkSdk } from '@/providers/stark-sdk-provider'
import { formatUnits } from '@/lib/token-utils'
import { resolveTokenSymbol, resolveTokenDecimals } from '@/lib/token-formatters'
import { usePrivyStatus } from '@/providers/privy-status-context'
import { ClaimButton } from '@/components/claim-button'

function formatPot(raw?: string, decimals = 18): string {
  if (!raw || raw === '0') return '0'
  try { return Number(formatUnits(BigInt(raw), decimals)).toLocaleString('en-US', { maximumFractionDigits: 2 }) } catch { return '0' }
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-container-highest/60 ${className}`} />
}

function decodeHexStr(hex?: string) {
  if (!hex || hex === '0x0') return 'Unknown'
  try {
    const h = BigInt(hex).toString(16)
    return (h.match(/.{1,2}/g) || []).map(b => String.fromCharCode(parseInt(b, 16))).join('')
  } catch { return hex?.slice(0, 10) ?? 'Unknown' }
}

export default function ResolvedMarketsPage() {
  const { pools, web2Pools, loading: poolsLoading } = useAllBettingPools()
  const { address, status } = useStarkSdk()
  const { authenticated: privyAuthenticated, isFreighterConnected } = usePrivyStatus()
  const isStarknetConnected = status === 'connected'
  const chainType = isStarknetConnected ? 'starknet' : (privyAuthenticated || isFreighterConnected) ? 'stellar' : null
  const { bets } = useUserBets(address)
  const [filter, setFilter] = useState<string>('ALL')

  // Filter to settled pools
  const settledPools = useMemo(() => {
    return pools.filter(p => {
      // Pools are settled when winning_player is set
      if (!p.winning_player || p.winning_player === '0x0' || p.winning_player === '0') return false
      return true
    }).sort((a, b) => Number(b.pool_id) - Number(a.pool_id))
  }, [pools])

  // Enrich with web2 data and apply filter
  const enrichedPools = useMemo(() => {
    return settledPools.map(pool => {
      const w2 = web2Pools.find(w => w.pool_id === pool.pool_id)
      const p1Tag = w2?.player_1_tag ? decodeHexStr(w2.player_1_tag).split('#')[0] : pool.player_1?.slice(0, 8) ?? '?'
      const p2Tag = w2?.player_2_tag ? decodeHexStr(w2.player_2_tag).split('#')[0] : pool.player_2?.slice(0, 8) ?? '?'
      const provider = w2?.game_provider_id ? decodeHexStr(w2.game_provider_id) : ''
      const isWinnerP1 = pool.winning_player === pool.player_1
      const userBet = bets.find(b => b.pool_id === pool.pool_id)
      const userWon = userBet ? userBet.predicted_winner === pool.winning_player : null

      return { ...pool, p1Tag, p2Tag, provider, isWinnerP1, userBet, userWon }
    }).filter(pool => {
      if (filter === 'ALL') return true
      const prov = pool.provider.toUpperCase()
      if (filter === 'LOL') return prov.includes('RIOT') || prov.includes('LOL')
      if (filter === 'CS2') return prov.includes('CS') || prov.includes('VALVE')
      if (filter === 'VAL') return prov.includes('VAL')
      return true
    })
  }, [settledPools, web2Pools, bets, filter])

  // Aggregate stats
  const stats = useMemo(() => {
    let totalVolume = 0n
    let userPayouts = 0n
    let correctPredictions = 0
    let totalWithOdds = 0

    for (const pool of settledPools) {
      totalVolume += BigInt(pool.total_pot ?? '0')
      // Check if the pool's winner matches what we'd consider the AI's prediction (P1 by default if implied_p1 > 50%)
      const totalP1 = BigInt(pool.total_on_p1 ?? '0')
      const totalP2 = BigInt(pool.total_on_p2 ?? '0')
      if (totalP1 + totalP2 > 0n) {
        totalWithOdds++
        const p1Favored = totalP1 > totalP2
        if ((p1Favored && pool.winning_player === pool.player_1) || (!p1Favored && pool.winning_player === pool.player_2)) {
          correctPredictions++
        }
      }

      const userBet = bets.find(b => b.pool_id === pool.pool_id)
      if (userBet && userBet.predicted_winner === pool.winning_player) {
        const amount = BigInt(userBet.amount ?? '0')
        const winnerTotal = BigInt(pool.winning_total ?? pool.total_on_p1 ?? '1')
        const totalPot = BigInt(pool.total_pot ?? '0')
        if (winnerTotal > 0n) {
          userPayouts += (amount * totalPot) / winnerTotal
        }
      }
    }

    return {
      totalVolume: formatPot(totalVolume.toString()),
      oracleAccuracy: totalWithOdds > 0 ? ((correctPredictions / totalWithOdds) * 100).toFixed(1) : '—',
      userPayouts: formatPot(userPayouts.toString()),
    }
  }, [settledPools, bets])

  const filters = ['ALL', 'LOL', 'CS2', 'VAL']

  return (
    <div className="flex h-screen bg-surface text-foreground font-sans overflow-hidden flex-col">
      <TopNavBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="bg-surface text-xs uppercase hidden md:flex flex-col items-center py-6 w-20 border-r border-surface-container-low z-40 shrink-0">
          <div className="flex flex-col gap-8 flex-1 w-full">
            <button className="group flex flex-col items-center gap-1 text-muted-foreground hover:text-primary py-4 w-full transition-all">
              <Terminal className="w-5 h-5 mb-1" /><span className="font-mono scale-75">Terminal</span>
            </button>
            <button className="group flex flex-col items-center gap-1 text-neon-purple border-l-2 border-neon-purple bg-surface-container-low py-4 w-full transition-all">
              <LineChart className="w-5 h-5 mb-1" /><span className="font-mono scale-75">Resolved</span>
            </button>
            <button className="group flex flex-col items-center gap-1 text-muted-foreground hover:text-primary py-4 w-full transition-all">
              <Wallet className="w-5 h-5 mb-1" /><span className="font-mono scale-75">Portfolio</span>
            </button>
            <button className="group flex flex-col items-center gap-1 text-muted-foreground hover:text-primary py-4 w-full transition-all">
              <Settings className="w-5 h-5 mb-1" /><span className="font-mono scale-75">Settings</span>
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto bg-surface pb-24 md:pb-8">
          <div className="p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
              <div>
                <h1 className="font-headline text-2xl md:text-4xl font-bold tracking-tighter text-white uppercase">Resolved Markets</h1>
                <p className="text-muted-foreground font-headline text-[10px] md:text-xs tracking-widest mt-2 uppercase">
                  Oracle Settlement Log · {settledPools.length} Markets Settled
                </p>
              </div>
              <div className="flex gap-2">
                {filters.map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 md:px-4 py-1.5 text-[10px] font-headline font-bold uppercase tracking-widest transition-all ${
                      filter === f
                        ? 'bg-primary-container text-on-primary-container'
                        : 'bg-surface-container-low text-on-surface-variant hover:text-white hover:bg-surface-container-high'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-4 md:gap-6">
              <div className="bg-surface-container-low p-4 md:p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/40"></div>
                <span className="font-headline text-[10px] tracking-widest text-[#cfc2d7] uppercase">Total Settled Volume</span>
                <div className="font-headline text-xl md:text-2xl font-bold tracking-tighter text-white mt-2">{stats.totalVolume}</div>
                <span className="text-[10px] font-mono text-primary">USDC</span>
              </div>
              <div className="bg-surface-container-low p-4 md:p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/40"></div>
                <span className="font-headline text-[10px] tracking-widest text-[#cfc2d7] uppercase">Oracle Accuracy</span>
                <div className="font-headline text-xl md:text-2xl font-bold tracking-tighter text-white mt-2">{stats.oracleAccuracy}%</div>
                <span className="text-[10px] font-mono text-emerald-400">Consensus match rate</span>
              </div>
              <div className="bg-surface-container-low p-4 md:p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/40"></div>
                <span className="font-headline text-[10px] tracking-widest text-[#cfc2d7] uppercase">Your Payouts</span>
                <div className="font-headline text-xl md:text-2xl font-bold tracking-tighter text-white mt-2">{stats.userPayouts}</div>
                <span className="text-[10px] font-mono text-primary">USDC Claimed</span>
              </div>
            </div>

            {/* Table */}
            {poolsLoading ? (
              <div className="bg-surface-container-low p-6 space-y-4">
                {[1, 2, 3, 4].map(i => <SkeletonLine key={i} className="h-12 w-full" />)}
              </div>
            ) : enrichedPools.length === 0 ? (
              <div className="bg-surface-container-low p-12 text-center">
                <Clock className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-4" />
                <p className="text-sm text-on-surface-variant uppercase tracking-widest">No settled markets found</p>
                <p className="text-[10px] text-on-surface-variant/60 mt-2 font-mono">Markets will appear here after oracle resolution</p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block bg-surface-container-low overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-highest/30 tracking-widest text-[#cfc2d7] uppercase font-headline text-[10px]">
                        <th className="px-6 py-4 font-semibold">Match</th>
                        <th className="px-6 py-4 font-semibold">Result</th>
                        <th className="px-6 py-4 font-semibold">Pool Size</th>
                        <th className="px-6 py-4 font-semibold">Your Bet</th>
                        <th className="px-6 py-4 font-semibold">Outcome</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#353534]/30 font-mono text-xs">
                      {enrichedPools.map(pool => (
                        <tr key={pool.pool_id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4">
                            <div className="text-white font-bold">{pool.p1Tag} vs {pool.p2Tag}</div>
                            <div className="text-[10px] text-on-surface-variant mt-1">{pool.provider || `Pool #${pool.pool_id}`}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-primary font-bold">{pool.isWinnerP1 ? pool.p1Tag : pool.p2Tag}</span>
                          </td>
                          <td className="px-6 py-4 text-white">{formatPot(pool.total_pot)} {resolveTokenSymbol(pool, chainType)}</td>
                          <td className="px-6 py-4 text-white">
                            {pool.userBet ? `${formatPot(pool.userBet.amount)} ${resolveTokenSymbol(pool, chainType)}` : '—'}
                          </td>
                          <td className="px-6 py-4">
                            {pool.userWon === true && (
                              <div className="flex items-center gap-2 text-green-400 font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> WON
                                {chainType && pool.userBet && (
                                  <ClaimButton 
                                    pool={pool} 
                                    userBetAmount={pool.userBet.amount ?? '0'} 
                                    chainType={chainType} 
                                    className="ml-2"
                                  />
                                )}
                              </div>
                            )}
                            {pool.userWon === false && (
                              <span className="flex items-center gap-1 text-red-400 font-bold"><XCircle className="w-3.5 h-3.5" /> LOST</span>
                            )}
                            {pool.userWon === null && (
                              <span className="text-on-surface-variant">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3">
                  {enrichedPools.map(pool => (
                    <div key={pool.pool_id} className="bg-surface-container-low p-4 border-l-2 border-primary/30">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-xs font-bold text-white">{pool.p1Tag} vs {pool.p2Tag}</p>
                          <p className="text-[9px] text-on-surface-variant mt-0.5">{pool.provider || `Pool #${pool.pool_id}`}</p>
                        </div>
                        {pool.userWon === true && (
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-green-400 bg-green-400/10 px-2 py-0.5">WON</span>
                            {chainType && pool.userBet && (
                              <ClaimButton 
                                pool={pool} 
                                userBetAmount={pool.userBet.amount ?? '0'} 
                                chainType={chainType}
                              />
                            )}
                          </div>
                        )}
                        {pool.userWon === false && <span className="text-[9px] font-bold text-red-400 bg-red-400/10 px-2 py-0.5">LOST</span>}
                      </div>
                      <div className="flex justify-between text-[10px] font-mono mt-2">
                        <span className="text-on-surface-variant">Winner: <span className="text-primary">{pool.isWinnerP1 ? pool.p1Tag : pool.p2Tag}</span></span>
                        <span className="text-white">{formatPot(pool.total_pot)} {resolveTokenSymbol(pool, chainType)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center bg-surface border-t-2 border-surface-container-low h-16">
        <a className="flex flex-col items-center justify-center text-gray-500 w-full h-full" href="/match">
          <Activity className="w-5 h-5 mb-1" /><span className="font-sans text-[9px] uppercase tracking-widest font-semibold">Live</span>
        </a>
        <a className="flex flex-col items-center justify-center text-primary w-full h-full border-t-2 border-primary -mt-[2px]" href="/resolved">
          <LineChart className="w-5 h-5 mb-1" /><span className="font-sans text-[9px] uppercase tracking-widest font-semibold">Resolved</span>
        </a>
        <a className="flex flex-col items-center justify-center text-gray-500 w-full h-full" href="/portfolio">
          <Wallet className="w-5 h-5 mb-1" /><span className="font-sans text-[9px] uppercase tracking-widest font-semibold">Portfolio</span>
        </a>
      </nav>
    </div>
  )
}
