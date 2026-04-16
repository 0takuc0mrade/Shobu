'use client'

import { Suspense, useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { TopNavBar } from '@/components/top-nav-bar'
import { Activity, Radio, Coins, TrendingUp, LineChart, Wallet, Loader2 } from 'lucide-react'
import { useBettingPool, usePoolOdds, useWeb2BettingPool } from '@/hooks/use-dojo-betting'
import { usePlaceBet } from '@/hooks/use-betting-actions'
import { useMatchName } from '@/hooks/use-match-name'
import { useMarkets } from '@/hooks/use-markets'
import { useStarkSdk } from '@/providers/stark-sdk-provider'
import { usePrivyStatus } from '@/providers/privy-status-context'
import { useEgs } from '@/providers/egs-provider'
import { formatUnits } from '@/lib/token-utils'
import { web3Config } from '@/lib/web3-config'

function formatPot(raw?: string, decimals = 18): string {
  if (!raw || raw === '0') return '0'
  try { return Number(formatUnits(BigInt(raw), decimals)).toLocaleString('en-US', { maximumFractionDigits: 2 }) } catch { return '0' }
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-container-highest/60 ${className}`} />
}

function MatchPageContent() {
  const searchParams = useSearchParams()
  const poolIdParam = searchParams.get('pool')
  const poolId = poolIdParam ? Number(poolIdParam) : web3Config.activePoolId

  const { data: pool, loading: poolLoading } = useBettingPool(poolId)
  const odds = usePoolOdds(poolId)
  const { matchName } = useMatchName(String(poolId), String(pool?.game_id ?? '0'), 'web2')
  const { data: web2Pool } = useWeb2BettingPool(poolId)
  const { getMarket } = useMarkets()

  // Decode the match_id from the Web2 pool to look up the market context
  const rawMatchId = web2Pool?.match_id
  const market = getMarket(rawMatchId ?? null)
  const marketTitle = market?.market_title ?? null
  const { eventsByWorld } = useEgs()
  const { status: starkStatus } = useStarkSdk()

  const { authenticated: privyAuthenticated, isFreighterConnected } = usePrivyStatus()

  const chainType = starkStatus === 'connected' ? 'starknet' : isFreighterConnected ? 'stellar' : privyAuthenticated ? 'evm' : null

  const { placeBet, status: betStatus, error: betError } = usePlaceBet()
  const [wagerAmount, setWagerAmount] = useState('500.00')
  const [predictedWinner, setPredictedWinner] = useState<'p1' | 'p2'>('p1')

  const selectedOdds = predictedWinner === 'p1' ? odds.p1 : odds.p2
  const potentialReturn = useMemo(() => {
    const amount = parseFloat(wagerAmount) || 0
    return (amount * selectedOdds).toFixed(2)
  }, [wagerAmount, selectedOdds])

  const handleExecuteBet = useCallback(async () => {
    if (!pool || !chainType) return
    const winner = predictedWinner === 'p1' ? pool.player_1 : pool.player_2
    if (!winner) return
    await placeBet({
      poolId,
      predictedWinner: winner,
      amount: wagerAmount,
      tokenAddress: pool.token ?? web3Config.tokens.strk.address,
      chainType,
      isPlayer1: predictedWinner === 'p1',
    })
  }, [pool, chainType, predictedWinner, poolId, wagerAmount, placeBet])

  const worldEvents = pool?.game_world ? (eventsByWorld[pool.game_world.toLowerCase()] ?? []) : []

  // Binary market labels: YES / NO
  const p1Label = 'YES'
  const p2Label = 'NO'

  return (
    <div className="flex flex-col min-h-screen bg-surface text-foreground font-sans w-full">
      <TopNavBar />

      <main className="flex-1 pb-24 overflow-x-hidden pt-4 max-w-3xl mx-auto w-full">
        {/* Hero Section */}
        <section className="px-4">
          <div className="relative group border border-outline-variant/30 overflow-hidden shadow-2xl">
            <div className="aspect-video w-full bg-black relative">
              <img className="w-full h-full object-cover opacity-80" alt="eSports broadcast" src="https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-between p-4">
                <div className="flex justify-between items-start w-full">
                  <span className="bg-primary-container text-on-primary-container text-[9px] md:text-[10px] font-bold px-2 py-1 tracking-widest uppercase flex items-center gap-1.5 shadow-[0_0_10px_rgba(138,43,226,0.3)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                    {pool?.status === 'Open' || pool?.status === '0' ? 'LIVE MARKET' : 'RESOLVED'}
                  </span>
                  <div className="bg-black/50 backdrop-blur-md px-2 py-1 text-[9px] md:text-[10px] font-mono text-white border border-white/10 rounded-sm">
                    POOL #{poolId}
                  </div>
                </div>
                <div className="flex justify-between items-end w-full">
                  <div>
                    {poolLoading ? (
                      <SkeletonLine className="h-8 w-48 mb-2" />
                    ) : (
                      <h2 className="font-headline font-bold text-xl md:text-2xl tracking-tight text-white drop-shadow-md leading-snug">
                        {marketTitle ?? matchName ?? `Pool #${poolId}`}
                      </h2>
                    )}
                  </div>
                  <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded border border-white/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                    <span className="text-[10px] font-mono text-white">
                      {pool?.total_pot ? `${formatPot(pool.total_pot)} USDC` : 'LIVE'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feed & Probability */}
        <section className="px-4 grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* Vision Consensus Feed */}
          <div className="bg-surface-container-low p-5 relative overflow-hidden border border-transparent">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary/40"></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-headline text-[10px] md:text-xs font-semibold text-primary/80 uppercase tracking-widest flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-primary" /> Vision Consensus Feed
              </h3>
              <Activity className="w-3.5 h-3.5 text-primary/40" />
            </div>
            <div className="space-y-3 font-mono text-[10px] md:text-[11px]">
              {worldEvents.length > 0 ? (
                worldEvents.slice(-3).map((evt, i) => (
                  <div key={evt.id} className="flex items-start" style={{ opacity: 1 - i * 0.2 }}>
                    <span className="text-primary/60 shrink-0 mr-3 w-16">[{new Date(evt.seenAt).toLocaleTimeString('en-GB', { hour12: false }).slice(0, 8)}]</span>
                    <span className="text-on-surface uppercase leading-relaxed">Block #{evt.blockNumber} — Oracle consensus event</span>
                  </div>
                ))
              ) : (
                <div className="flex items-start opacity-70">
                  <span className="text-primary/40 shrink-0 mr-3">[--.--]</span>
                  <span className="text-on-surface/80 uppercase leading-relaxed">Awaiting oracle events for this market...</span>
                </div>
              )}
            </div>
          </div>

          {/* Win Probability */}
          <div className="bg-surface-container-low p-5 border border-transparent">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-headline text-[10px] md:text-xs font-semibold text-primary/80 uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" /> YES Probability
                </h3>
                <p className="text-3xl md:text-4xl font-headline font-bold text-white tracking-tighter mt-2">
                  {odds.impliedP1 > 0 ? `${(odds.impliedP1 / 100).toFixed(1)}%` : '—'}
                  <span className="text-sm font-light text-emerald-400/80 ml-1">YES</span>
                </p>
              </div>
              {odds.p1 > 0 && (
                <div className="bg-emerald-500/10 px-2 py-1 border border-emerald-500/20">
                  <span className="text-[10px] font-mono font-bold text-emerald-400">{odds.p1.toFixed(2)}x</span>
                </div>
              )}
            </div>
            <div className="h-20 md:h-24 w-full flex items-end gap-[2px]">
              {[40, 45, 42, 55, 65, 60, 70].map((h, i) => (
                <div key={i} className="flex-1 bg-[#353534] hover:bg-[#4c4354] transition-colors cursor-pointer" style={{ height: `${h}%` }}></div>
              ))}
              <div className="flex-1 bg-primary/40 border-t-2 border-primary relative" style={{ height: `${odds.impliedP1 > 0 ? odds.impliedP1 / 100 : 74}%` }}>
                <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white shadow-[0_0_10px_#fff]"></div>
              </div>
            </div>
          </div>
        </section>

        {/* Betting Terminal */}
        <section className="px-4 mt-4">
          <div className="bg-surface-container-low p-5 md:p-6 border-t-[3px] border-primary relative shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-headline text-[10px] md:text-xs font-bold text-white uppercase tracking-[0.3em] flex items-center gap-2">
                <Coins className="w-4 h-4 text-primary" /> Execution Terminal
              </h3>
              <span className="text-[9px] text-[#cfc2d7] uppercase tracking-widest font-mono bg-[#353534] px-2 py-1">
                {chainType === 'starknet' ? 'Starknet' : chainType === 'evm' ? 'Beam Network' : 'No Wallet'}
              </span>
            </div>

            {!chainType ? (
              <div className="py-8 flex flex-col items-center gap-3">
                <Wallet className="w-6 h-6 text-on-surface-variant/40" />
                <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">Connect wallet to place bets</p>
              </div>
            ) : poolLoading ? (
              <div className="space-y-4"><SkeletonLine className="h-16 w-full" /><SkeletonLine className="h-16 w-full" /><SkeletonLine className="h-12 w-full" /></div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row gap-3 md:gap-4 mb-6 md:mb-8">
                  <button
                    onClick={() => setPredictedWinner('p1')}
                    className={`flex-1 py-4 px-5 text-left transition-all relative ${
                      predictedWinner === 'p1' ? 'border-l-[3px] border-primary bg-surface-container-highest' : 'bg-surface-container-lowest/50 border-l-[3px] border-transparent'
                    }`}
                  >
                    <span className="text-[9px] md:text-[10px] font-mono text-emerald-400/80 uppercase block mb-1">Yes</span>
                    <span className="text-xl md:text-2xl font-headline font-bold text-emerald-400 block mb-1">YES</span>
                    <span className="text-xs font-mono text-emerald-400 font-semibold">{odds.p1 > 0 ? `${odds.p1.toFixed(2)}x` : '—'}</span>
                    {predictedWinner === 'p1' && <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_5px_#8a2be2]"></div>}
                  </button>
                  <button
                    onClick={() => setPredictedWinner('p2')}
                    className={`flex-1 py-4 px-5 text-left transition-all ${
                      predictedWinner === 'p2' ? 'border-l-[3px] border-primary bg-surface-container-highest' : 'bg-surface-container-lowest/50 border-l-[3px] border-transparent'
                    }`}
                  >
                    <span className="text-[9px] md:text-[10px] font-mono text-red-400/80 uppercase block mb-1">No</span>
                    <span className="text-xl md:text-2xl font-headline font-bold text-red-400">NO</span>
                    <span className="block text-xs font-mono text-red-400">{odds.p2 > 0 ? `${odds.p2.toFixed(2)}x` : '—'}</span>
                  </button>
                </div>

                <div className="space-y-5">
                  <div className="relative">
                    <label className="text-[9px] md:text-[10px] font-mono text-primary/60 uppercase absolute top-2.5 left-4 z-10 font-bold tracking-widest">Wager Amount (USDC)</label>
                    <input
                      className="w-full bg-[#0e0e0e] border-0 border-b-2 border-outline-variant pt-8 pb-3 px-4 font-mono text-xl md:text-2xl text-white focus:ring-0 focus:border-primary transition-colors outline-none"
                      type="text"
                      value={wagerAmount}
                      onChange={e => setWagerAmount(e.target.value)}
                    />
                    <div className="absolute right-4 bottom-3.5 flex gap-2">
                      <button className="text-[10px] font-mono font-bold text-primary px-2.5 py-1 bg-primary/10 hover:bg-primary/20 transition-colors uppercase tracking-widest">Max</button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 px-1 border-b border-white/5">
                    <span className="text-[10px] md:text-xs font-mono text-gray-400 uppercase tracking-widest">Potential Return</span>
                    <span className="text-[11px] md:text-sm font-mono font-bold text-emerald-400">{potentialReturn} USDC</span>
                  </div>
                  <button
                    onClick={handleExecuteBet}
                    disabled={betStatus === 'submitting'}
                    className="w-full py-4 md:py-5 bg-gradient-to-br from-primary-container to-primary text-on-primary-container font-headline font-bold uppercase tracking-[0.2em] md:tracking-[0.3em] text-[11px] md:text-sm shadow-[0_0_20px_rgba(138,43,226,0.3)] hover:shadow-[0_0_30px_rgba(138,43,226,0.5)] active:scale-[0.98] transition-all mt-4 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {betStatus === 'submitting' ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : 'Execute Bet'}
                  </button>
                  {betStatus === 'success' && <div className="text-[10px] text-green-400 font-mono text-center uppercase tracking-widest">✓ Transaction confirmed</div>}
                  {betError && <div className="text-[10px] text-red-400 font-mono text-center truncate">{betError}</div>}
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center bg-surface border-t-2 border-surface-container-low h-16">
        <a className="flex flex-col items-center justify-center text-primary bg-surface-container-low border-t-2 border-primary -mt-[2px] w-full h-full" href="/match">
          <Activity className="w-5 h-5 mb-1" /><span className="font-sans text-[9px] uppercase tracking-widest font-semibold">Live</span>
        </a>
        <a className="flex flex-col items-center justify-center text-gray-500 w-full h-full hover:bg-surface-container-lowest" href="/resolved">
          <LineChart className="w-5 h-5 mb-1" /><span className="font-sans text-[9px] uppercase tracking-widest font-semibold">Markets</span>
        </a>
        <a className="flex flex-col items-center justify-center text-gray-500 w-full h-full hover:bg-surface-container-lowest" href="/portfolio">
          <Wallet className="w-5 h-5 mb-1" /><span className="font-sans text-[9px] uppercase tracking-widest font-semibold">Portfolio</span>
        </a>
      </nav>
    </div>
  )
}

export default function MatchPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-surface text-foreground"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <MatchPageContent />
    </Suspense>
  )
}
