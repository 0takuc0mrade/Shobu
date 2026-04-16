'use client'

import { useMemo } from 'react'
import { TopNavBar } from '@/components/top-nav-bar'
import { Wallet, Settings, Terminal, LineChart, Activity, TrendingUp, Link2, Download, PlusSquare, Network, Coins } from 'lucide-react'
import { useStarkSdk } from '@/providers/stark-sdk-provider'
import { useAllBettingPools, useUserBets } from '@/hooks/use-dojo-betting'
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

export default function PortfolioPage() {
  const { address, status } = useStarkSdk()
  const { authenticated: privyAuthenticated, evmAddress: privyEvmAddress, stellarAddress: privyStellarAddress, isFreighterConnected } = usePrivyStatus()
  
  // Connected if ANY wallet is active (Starknet, BEAM/EVM, or Stellar)
  const isStarknetConnected = status === 'connected' && Boolean(address)
  const isConnected = isStarknetConnected || privyAuthenticated || isFreighterConnected
  const chainType = isStarknetConnected ? 'starknet' : (privyAuthenticated || isFreighterConnected) ? 'stellar' : null
  
  const { bets, loading: betsLoading } = useUserBets(address)
  const { pools, loading: poolsLoading } = useAllBettingPools()

  // Compute portfolio stats from user bets + pools
  const stats = useMemo(() => {
    if (!bets.length || !pools.length) return { netValue: '0', totalPnl: '0', winRate: 0, activeBets: [], settledBets: [] }

    let totalStaked = 0n
    let totalWon = 0n
    let wins = 0
    let settled = 0
    const activeBets: typeof bets = []
    const settledBets: typeof bets = []

    for (const bet of bets) {
      const pool = pools.find(p => p.pool_id === bet.pool_id)
      const amount = BigInt(bet.amount ?? '0')
      totalStaked += amount

      if (pool?.status === 'Settled' || pool?.winning_player) {
        settled++
        if (pool.winning_player === bet.predicted_winner) {
          wins++
          // Simplified payout estimation
          const totalOnWinner = BigInt(pool.winning_total ?? pool.total_on_p1 ?? '1')
          const totalPot = BigInt(pool.total_pot ?? '0')
          if (totalOnWinner > 0n) {
            totalWon += (amount * totalPot) / totalOnWinner
          }
        }
        settledBets.push(bet)
      } else {
        activeBets.push(bet)
      }
    }

    const pnl = totalWon - totalStaked
    return {
      netValue: formatPot(totalStaked.toString()),
      totalPnl: `${pnl >= 0n ? '+' : ''}${formatPot(pnl.toString())}`,
      winRate: settled > 0 ? (wins / settled) * 100 : 0,
      activeBets,
      settledBets,
    }
  }, [bets, pools])

  const loading = betsLoading || poolsLoading

  return (
    <div className="flex h-screen bg-surface text-foreground font-sans overflow-hidden flex-col">
      <TopNavBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="bg-surface text-xs uppercase flex flex-col items-center py-6 w-16 md:w-20 border-r border-surface-container-low z-40 shrink-0 hidden md:flex">
          <div className="flex flex-col gap-8 flex-1 w-full">
            <button className="group flex flex-col items-center gap-1 text-muted-foreground hover:text-primary py-4 w-full transition-all">
              <Terminal className="w-5 h-5 mb-1" /><span className="font-mono scale-75">Terminal</span>
            </button>
            <button className="group flex flex-col items-center gap-1 text-muted-foreground hover:text-primary py-4 w-full transition-all">
              <LineChart className="w-5 h-5 mb-1" /><span className="font-mono scale-75">Analytics</span>
            </button>
            <button className="group flex flex-col items-center gap-1 text-neon-purple border-l-2 border-neon-purple bg-surface-container-low py-4 w-full transition-all">
              <Wallet className="w-5 h-5 mb-1" /><span className="font-mono scale-75">Portfolio</span>
            </button>
            <button className="group flex flex-col items-center gap-1 text-muted-foreground hover:text-primary py-4 w-full transition-all">
              <Settings className="w-5 h-5 mb-1" /><span className="font-mono scale-75">Settings</span>
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto bg-surface pb-24 md:pb-8">
          <div className="p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto">

            {/* MOBILE LAYOUT */}
            <div className="block md:hidden space-y-6">
              {!isConnected ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <Wallet className="w-10 h-10 text-on-surface-variant/30" />
                  <p className="text-xs text-on-surface-variant uppercase tracking-widest">Connect wallet to view portfolio</p>
                </div>
              ) : loading ? (
                <div className="space-y-4 px-2">
                  <SkeletonLine className="h-10 w-48" />
                  <SkeletonLine className="h-28 w-full" />
                  <SkeletonLine className="h-20 w-full" />
                </div>
              ) : (
                <>
                  <section className="relative px-2">
                    <div className="flex flex-col gap-1 relative z-10">
                      <span className="text-[10px] font-headline uppercase tracking-widest text-[#988ca0]">Total Value Portfolio</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-headline font-bold text-white tracking-tighter">${stats.netValue}</span>
                        <span className="text-primary font-mono text-xs font-medium">{stats.totalPnl}</span>
                      </div>
                    </div>
                  </section>

                  <section className="grid grid-cols-2 gap-px bg-outline-variant/30 border border-outline-variant/30">
                    <div className="bg-surface-container-low p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div className="p-1.5 bg-surface-container-highest"><Link2 className="w-3.5 h-3.5 text-primary" /></div>
                        <span className="text-[9px] font-mono text-[#988ca0]">BEAM_NET</span>
                      </div>
                      <div className="mt-2">
                        <p className="text-[9px] uppercase tracking-widest text-[#988ca0] mb-1 font-headline">Beam Wallet</p>
                        <p className="font-mono text-base font-medium text-white">—</p>
                      </div>
                    </div>
                    <div className="bg-surface-container-low p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div className="p-1.5 bg-surface-container-highest"><Network className="w-3.5 h-3.5 text-primary" /></div>
                        <span className="text-[9px] font-mono text-[#988ca0]">STARK_L2</span>
                      </div>
                      <div className="mt-2">
                        <p className="text-[9px] uppercase tracking-widest text-[#988ca0] mb-1 font-headline">Starknet Wallet</p>
                        <p className="font-mono text-base font-medium text-white">${stats.netValue}</p>
                      </div>
                    </div>
                  </section>

                  <section>
                    <div className="flex border-b border-outline-variant/30 mb-2">
                      <button className="py-3 text-[10px] font-headline uppercase tracking-widest text-primary border-b-2 border-primary mr-6">Active Positions ({stats.activeBets.length})</button>
                      <button className="py-3 text-[10px] font-headline uppercase tracking-widest text-[#988ca0]">Past ({stats.settledBets.length})</button>
                    </div>
                    <div className="flex flex-col gap-2">
                      {stats.activeBets.length === 0 ? (
                        <div className="py-6 text-center text-[10px] text-on-surface-variant uppercase tracking-widest font-mono">No active positions</div>
                      ) : (
                        stats.activeBets.slice(0, 5).map(bet => {
                          const pool = pools.find(p => p.pool_id === bet.pool_id)
                          return (
                            <div key={`${bet.pool_id}-${bet.bettor}`} className="p-4 bg-surface-container-low/80 flex justify-between items-center">
                              <div className="flex gap-3 items-center">
                                <div className="w-8 h-8 bg-surface-container-highest flex items-center justify-center">
                                  <TrendingUp className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                  <p className="font-headline font-bold text-xs">Pool #{bet.pool_id}</p>
                                  <p className="text-[9px] font-mono text-[#988ca0] uppercase">Predicted: {bet.predicted_winner?.slice(0, 6)}…</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-mono text-xs text-white font-medium">
                                  {formatPot(bet.amount)}{' '}
                                  {resolveTokenSymbol(pool, chainType)}
                                </p>
                                <p className="text-[8px] font-mono text-primary uppercase mt-1">Active</p>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </section>
                </>
              )}
            </div>

            {/* DESKTOP LAYOUT */}
            <div className="hidden md:block space-y-8">
              {!isConnected ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <Wallet className="w-12 h-12 text-on-surface-variant/30" />
                  <p className="text-sm text-on-surface-variant uppercase tracking-widest">Connect wallet to view portfolio</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-end">
                    <div>
                      <h1 className="font-headline text-4xl font-bold tracking-tighter text-white uppercase">Portfolio Overview</h1>
                      <p className="text-muted-foreground font-headline text-xs tracking-widest mt-2 uppercase">
                        Protocol Terminal / {(address || privyEvmAddress || privyStellarAddress)?.slice(0, 6)}…{(address || privyEvmAddress || privyStellarAddress)?.slice(-4)}
                      </p>
                    </div>
                    <div className="flex gap-4">
                      <button className="px-6 py-2 border border-outline-variant hover:border-primary text-gray-300 hover:text-white font-headline font-semibold text-xs tracking-widest transition-all uppercase flex items-center gap-2">
                        <Download className="w-3 h-3" /> Export
                      </button>
                      <button className="px-6 py-2 bg-primary-container text-on-primary-container font-headline font-bold text-xs tracking-widest hover:brightness-110 transition-all uppercase flex items-center gap-2">
                        <PlusSquare className="w-3 h-3" /> Stake More
                      </button>
                    </div>
                  </div>

                  {loading ? (
                    <div className="grid grid-cols-3 gap-6">
                      {[1, 2, 3].map(i => <div key={i} className="bg-surface-container-low p-6 space-y-3"><SkeletonLine className="h-4 w-24" /><SkeletonLine className="h-8 w-40" /></div>)}
                    </div>
                  ) : (
                    <>
                      {/* Stats Cards */}
                      <div className="grid grid-cols-3 gap-6">
                        <div className="bg-surface-container-low p-6 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-50"></div>
                          <div className="flex justify-between items-start mb-4">
                            <span className="font-headline text-xs tracking-widest text-[#cfc2d7] uppercase">Net Staked (USDC)</span>
                            <Wallet className="w-4 h-4 text-primary/40" />
                          </div>
                          <div className="font-headline text-3xl font-bold tracking-tighter text-white">{stats.netValue}</div>
                          <div className="mt-4 flex items-center gap-2">
                            <span className="text-xs font-mono text-[#dcb8ff]">{bets.length} bets</span>
                          </div>
                        </div>
                        <div className="bg-surface-container-low p-6 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-neon-purple opacity-50"></div>
                          <div className="flex justify-between items-start mb-4">
                            <span className="font-headline text-xs tracking-widest text-[#cfc2d7] uppercase">Total PnL</span>
                            <TrendingUp className="w-4 h-4 text-primary/40" />
                          </div>
                          <div className="font-headline text-3xl font-bold tracking-tighter text-white">{stats.totalPnl}</div>
                        </div>
                        <div className="bg-surface-container-low p-6 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-50"></div>
                          <div className="flex justify-between items-start mb-4">
                            <span className="font-headline text-xs tracking-widest text-[#cfc2d7] uppercase">Win Rate</span>
                            <Activity className="w-4 h-4 text-primary/40" />
                          </div>
                          <div className="font-headline text-3xl font-bold tracking-tighter text-white">{stats.winRate.toFixed(1)}%</div>
                          <div className="mt-4 flex items-center gap-4">
                            <div className="flex-1 h-1 bg-[#353534]">
                              <div className="h-full bg-primary shadow-[0_0_10px_rgba(220,184,255,0.5)]" style={{ width: `${stats.winRate}%` }}></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Chain Split */}
                      <div className="grid grid-cols-2 gap-6">
                        <div className="bg-surface-container-low p-8 border-l border-primary/20 hover:border-primary/50 transition-colors">
                          <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 bg-[#353534] flex items-center justify-center"><Link2 className="w-4 h-4 text-primary" /></div>
                            <h2 className="font-headline text-lg font-bold tracking-tighter text-white uppercase">Beam Network</h2>
                          </div>
                          <div className="space-y-4 font-mono text-xs">
                            <div className="flex justify-between items-center py-3 border-b border-[#353534]/50">
                              <span className="text-[#cfc2d7]">Locked Stake</span><span className="text-white">— USDC</span>
                            </div>
                            <div className="flex justify-between items-center py-3">
                              <span className="text-[#cfc2d7]">Status</span><span className="text-gray-400">Not connected</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-surface-container-low p-8 border-l border-primary/20 hover:border-primary/50 transition-colors">
                          <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 bg-[#353534] flex items-center justify-center"><Terminal className="w-4 h-4 text-primary" /></div>
                            <h2 className="font-headline text-lg font-bold tracking-tighter text-white uppercase">Starknet Assets</h2>
                          </div>
                          <div className="space-y-4 font-mono text-xs">
                            <div className="flex justify-between items-center py-3 border-b border-[#353534]/50">
                              <span className="text-[#cfc2d7]">Active Bets</span><span className="text-white">{stats.activeBets.length} positions</span>
                            </div>
                            <div className="flex justify-between items-center py-3 border-b border-[#353534]/50">
                              <span className="text-[#cfc2d7]">Total Staked</span><span className="text-white">{stats.netValue} USDC</span>
                            </div>
                            <div className="flex justify-between items-center py-3">
                              <span className="text-[#cfc2d7]">Settled</span><span className="text-primary">{stats.settledBets.length} pools</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Activity Table */}
                      <div className="bg-surface-container-low overflow-hidden">
                        <div className="p-6 border-b border-[#353534]/50 flex justify-between items-center">
                          <h2 className="font-headline text-lg font-bold tracking-tighter text-white uppercase">Recent Activity</h2>
                          <span className="text-[10px] text-primary font-headline tracking-widest uppercase flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                            {bets.length} total bets
                          </span>
                        </div>
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-surface-container-highest/30 tracking-widest text-[#cfc2d7] uppercase font-headline text-[10px]">
                              <th className="px-6 py-4 font-semibold">Pool</th>
                              <th className="px-6 py-4 font-semibold">Predicted</th>
                              <th className="px-6 py-4 font-semibold">Amount</th>
                              <th className="px-6 py-4 font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#353534]/30 font-mono text-xs">
                            {bets.slice(0, 10).map(bet => {
                              const pool = pools.find(p => p.pool_id === bet.pool_id)
                              const isSettled = pool?.winning_player
                              const isWin = isSettled && pool.winning_player === bet.predicted_winner
                              return (
                                <tr key={`${bet.pool_id}-${bet.bettor}`} className="hover:bg-white/5 transition-colors">
                                  <td className="px-6 py-4 text-gray-300">Pool #{bet.pool_id}</td>
                                  <td className="px-6 py-4 text-white">{bet.predicted_winner?.slice(0, 8)}…</td>
                                  <td className="px-6 py-4 text-white">
                                    {formatPot(bet.amount)}{' '}
                                    {resolveTokenSymbol(pool, chainType)}
                                  </td>
                                  <td className="px-6 py-4">
                                    {isSettled ? (
                                      <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase font-headline ${isWin ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-400'}`}>
                                          {isWin ? 'Won' : 'Lost'}
                                        </span>
                                        {isWin && chainType && (
                                          <ClaimButton 
                                            pool={pool} 
                                            userBetAmount={bet.amount ?? '0'} 
                                            chainType={chainType} 
                                            className="ml-2"
                                          />
                                        )}
                                      </div>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold uppercase font-headline">Active</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                            {bets.length === 0 && (
                              <tr><td colSpan={4} className="px-6 py-8 text-center text-on-surface-variant text-xs uppercase tracking-widest">No betting history found</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center bg-surface border-t-2 border-surface-container-low h-16">
        <a className="flex flex-col items-center justify-center text-gray-500 w-full h-full" href="/match">
          <Activity className="w-5 h-5 mb-1" /><span className="font-sans text-[9px] uppercase tracking-widest font-semibold">Live</span>
        </a>
        <a className="flex flex-col items-center justify-center text-gray-500 w-full h-full" href="/">
          <LineChart className="w-5 h-5 mb-1" /><span className="font-sans text-[9px] uppercase tracking-widest font-semibold">Markets</span>
        </a>
        <a className="flex flex-col items-center justify-center text-primary w-full h-full border-t-2 border-primary -mt-[2px]" href="/portfolio">
          <Wallet className="w-5 h-5 mb-1" /><span className="font-sans text-[9px] uppercase tracking-widest font-semibold">Portfolio</span>
        </a>
      </nav>
    </div>
  )
}
