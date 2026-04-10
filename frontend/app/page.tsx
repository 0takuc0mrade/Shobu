'use client'

import { useState, useMemo, useCallback } from 'react'
import { Terminal, LineChart, Wallet, Settings, FileText, HelpCircle, Activity, Send, Radio, Coins, TrendingUp, Loader2 } from 'lucide-react'
import { TopNavBar } from '@/components/top-nav-bar'
import { useEgs } from '@/providers/egs-provider'
import { useStarkSdk } from '@/providers/stark-sdk-provider'
import { usePrivyStatus } from '@/providers/privy-status-context'
import { useBettingPool, usePoolOdds } from '@/hooks/use-dojo-betting'
import { usePlaceBet } from '@/hooks/use-betting-actions'
import { useMatchName } from '@/hooks/use-match-name'
import { formatUnits } from '@/lib/token-utils'
import { web3Config } from '@/lib/web3-config'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatPot(raw?: string, decimals = 18): string {
  if (!raw || raw === '0') return '0'
  try {
    const val = formatUnits(BigInt(raw), decimals)
    return Number(val).toLocaleString('en-US', { maximumFractionDigits: 2 })
  } catch { return '0' }
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-container-highest/60 ${className}`} />
}

// ---------------------------------------------------------------------------
// Market Card
// ---------------------------------------------------------------------------
function MarketCard({
  game,
  isSelected,
  onSelect,
}: {
  game: any
  isSelected: boolean
  onSelect: () => void
}) {
  const poolId = game.pool?.pool_id ? Number(game.pool.pool_id) : 0
  const { matchName } = useMatchName(
    String(poolId),
    String(game.pool?.game_id ?? game.gameId ?? '0'),
    game.pool?.game_world === '0xWeb2' ? 'web2' : 'onchain'
  )
  const isLive = game.pool && Number(game.pool.deadline) * 1000 > Date.now()
  const pot = formatPot(game.pool?.total_pot)

  return (
    <button
      onClick={onSelect}
      className={`bg-surface-container-low p-3 border-l-2 group cursor-pointer hover:bg-surface-container-high transition-all text-left w-full ${
        isSelected ? 'border-primary bg-surface-container-high' : 'border-outline-variant'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-[9px] font-bold text-on-surface-variant uppercase truncate mr-2">
          {game.name?.length > 24 ? game.name.slice(0, 22) + '…' : game.name}
        </span>
        {isLive ? (
          <span className="text-[9px] font-bold text-primary flex items-center gap-1 shrink-0">
            <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
            LIVE
          </span>
        ) : (
          <span className="text-[9px] font-bold text-on-surface-variant shrink-0">Upcoming</span>
        )}
      </div>
      <div className="text-[11px] font-bold mb-1 text-white truncate">{matchName ?? game.name}</div>
      <div className="text-[10px] text-on-surface-variant">Pool: {pot} USDC</div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const { games, loading: egsLoading, error: egsError, eventsByWorld } = useEgs()
  const { address: starkAddress, status: starkStatus } = useStarkSdk()

  const { authenticated: privyAuthenticated } = usePrivyStatus()

  const chainType = starkStatus === 'connected' ? 'starknet' : privyAuthenticated ? 'evm' : null
  const connectedAddress = starkAddress ?? undefined

  // Pool selection state (in-place bet slip)
  const bettableGames = useMemo(() => games.filter(g => g.bettable), [games])
  const [selectedPoolId, setSelectedPoolId] = useState<number | null>(null)

  // Auto-select first bettable pool if none selected
  const activePoolId = selectedPoolId ?? (bettableGames[0]?.pool?.pool_id ? Number(bettableGames[0].pool.pool_id) : web3Config.activePoolId)

  const { data: selectedPool, loading: poolLoading } = useBettingPool(activePoolId)
  const odds = usePoolOdds(activePoolId)
  const { matchName: selectedMatchName } = useMatchName(
    String(activePoolId),
    String(selectedPool?.game_id ?? '0'),
    'web2'
  )

  // Bet execution
  const { placeBet, status: betStatus, error: betError } = usePlaceBet()
  const [wagerAmount, setWagerAmount] = useState('100.00')
  const [predictedWinner, setPredictedWinner] = useState<'p1' | 'p2'>('p1')

  const selectedOdds = predictedWinner === 'p1' ? odds.p1 : odds.p2
  const potentialReturn = useMemo(() => {
    const amount = parseFloat(wagerAmount) || 0
    return (amount * selectedOdds).toFixed(2)
  }, [wagerAmount, selectedOdds])

  const handleExecuteBet = useCallback(async () => {
    if (!selectedPool || !chainType) return
    const winner = predictedWinner === 'p1' ? selectedPool.player_1 : selectedPool.player_2
    if (!winner) return
    await placeBet({
      poolId: activePoolId,
      predictedWinner: winner,
      amount: wagerAmount,
      tokenAddress: selectedPool.token ?? web3Config.tokens.strk.address,
      chainType,
    })
  }, [selectedPool, chainType, predictedWinner, activePoolId, wagerAmount, placeBet])

  // Events for selected pool's world
  const selectedWorldEvents = selectedPool?.game_world
    ? (eventsByWorld[selectedPool.game_world.toLowerCase()] ?? [])
    : []

  return (
    <div className="flex h-screen bg-surface text-foreground font-sans overflow-hidden flex-col">
      <TopNavBar />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Desktop SideNavBar */}
        <aside className="bg-surface text-xs uppercase hidden md:flex flex-col items-center py-6 w-20 border-r border-surface-container-low z-40 shrink-0">
          <div className="flex flex-col gap-8 flex-1 w-full">
            <button className="group flex flex-col items-center gap-1 text-neon-purple border-l-2 border-neon-purple bg-surface-container-low py-4 w-full">
              <Terminal className="w-5 h-5 mb-1" />
              <span className="font-mono scale-75">Terminal</span>
            </button>
            <button className="group flex flex-col items-center gap-1 text-muted-foreground hover:text-primary py-4 w-full transition-all">
              <LineChart className="w-5 h-5 mb-1" />
              <span className="font-mono scale-75">Analytics</span>
            </button>
            <button className="group flex flex-col items-center gap-1 text-muted-foreground hover:text-primary py-4 w-full transition-all">
              <Wallet className="w-5 h-5 mb-1" />
              <span className="font-mono scale-75">Markets</span>
            </button>
            <button className="group flex flex-col items-center gap-1 text-muted-foreground hover:text-primary py-4 w-full transition-all">
              <Settings className="w-5 h-5 mb-1" />
              <span className="font-mono scale-75">Settings</span>
            </button>
          </div>
          <div className="flex flex-col gap-6 pb-4">
            <button className="text-muted-foreground hover:text-primary transition-colors"><FileText className="w-5 h-5" /></button>
            <button className="text-muted-foreground hover:text-primary transition-colors"><HelpCircle className="w-5 h-5" /></button>
          </div>
        </aside>

        {/* ---- DESKTOP MAIN CONTENT ---- */}
        <main className="hidden md:grid flex-1 grid-cols-10 overflow-y-auto bg-surface">
          
          {/* Center Column (70%) */}
          <div className="col-span-10 xl:col-span-7 flex flex-col border-r border-surface-container-low min-w-0">
            
            {/* Hero Stream */}
            <section className="p-6">
              <div className="relative aspect-video bg-black border border-surface-container-highest overflow-hidden select-none">
                <img className="w-full h-full object-cover opacity-80" alt="Stream Placeholder" src="https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                <div className="absolute top-4 left-4 flex gap-4">
                  <div className="bg-black/60 backdrop-blur-md px-3 py-1 flex items-center gap-2 border-l-2 border-primary">
                    <span className="w-2 h-2 bg-red-600 animate-[pulse_2s_infinite]"></span>
                    <span className="text-[10px] font-bold tracking-tighter uppercase text-white">Live Oracle Stream</span>
                  </div>
                  <div className="bg-black/60 backdrop-blur-md px-3 py-1 flex items-center gap-2">
                    <Activity className="w-3 h-3 text-primary" />
                    <span className="text-[10px] font-bold tracking-tighter uppercase text-white">
                      {egsLoading ? '...' : `${bettableGames.length} Markets Active`}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Vision Consensus Terminal */}
            <section className="px-6 pb-6 flex-1 flex flex-col min-h-[300px]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-headline text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                  <span className="w-1 h-3 bg-primary"></span>
                  Vision Consensus Feed
                </h2>
                <span className="font-mono text-[10px] text-on-surface-variant uppercase">
                  {selectedWorldEvents.length > 0 ? `${selectedWorldEvents.length} events` : 'Latency: 14ms'}
                </span>
              </div>
              <div className="flex-1 bg-surface-container-lowest border border-surface-container-low p-4 font-mono text-[11px] space-y-2 overflow-y-auto">
                {selectedWorldEvents.length > 0 ? (
                  selectedWorldEvents.slice(-6).map((evt, i) => (
                    <div key={evt.id} className="flex gap-4" style={{ opacity: 1 - i * 0.12 }}>
                      <span className="text-on-surface-variant shrink-0">
                        [{new Date(evt.seenAt).toLocaleTimeString('en-GB', { hour12: false })}]
                      </span>
                      <span className="text-neon-purple font-bold">EVENT:</span>
                      <span className="truncate">{evt.data?.[0] ? `Block #${evt.blockNumber} — Data: ${evt.data[0].slice(0, 18)}…` : `Oracle event #${evt.eventIndex}`}</span>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="flex gap-4 text-on-surface-variant">
                      <span>[{new Date().toLocaleTimeString('en-GB', { hour12: false })}]</span>
                      <span className="text-primary font-bold">SYSTEM:</span>
                      <span>Awaiting oracle events... {egsError ? `(${egsError})` : 'Monitoring active pools.'}</span>
                    </div>
                    <div className="flex gap-4">
                      <span className="text-on-surface-variant">[--:--:--]</span>
                      <span className="text-green-500 font-bold">STATUS:</span>
                      <span>{chainType ? `${chainType.toUpperCase()} wallet connected. Ready for consensus.` : 'No wallet connected. Connect to receive live events.'}</span>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Active Markets Grid */}
            <section className="px-6 py-6 border-t border-surface-container-low">
              <h3 className="font-headline text-[10px] font-extrabold uppercase tracking-[0.2em] mb-4 text-on-surface-variant">Active Markets Grid</h3>
              {egsLoading ? (
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-surface-container-low p-3 border-l-2 border-outline-variant space-y-2">
                      <SkeletonLine className="h-3 w-20" />
                      <SkeletonLine className="h-4 w-32" />
                      <SkeletonLine className="h-3 w-24" />
                    </div>
                  ))}
                </div>
              ) : bettableGames.length === 0 ? (
                <div className="text-center py-8 text-on-surface-variant text-xs font-mono uppercase tracking-widest">
                  Awaiting Oracle Sync — No active markets detected
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {bettableGames.slice(0, 6).map(game => (
                    <MarketCard
                      key={game.id}
                      game={game}
                      isSelected={Number(game.pool?.pool_id) === activePoolId}
                      onSelect={() => setSelectedPoolId(Number(game.pool?.pool_id))}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Panel (30%) — Live Bet Slip */}
          <aside className="col-span-10 xl:col-span-3 flex flex-col bg-surface-container-lowest min-w-0 border-l border-surface-container-low xl:border-l-0">
            
            {/* Analyst Insight Card */}
            <div className="p-6 border-b border-surface-container-low">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-headline text-xs font-bold uppercase tracking-widest text-primary">Analyst Insight</h2>
                <Activity className="w-4 h-4 text-on-surface-variant" />
              </div>
              <div className="bg-surface-container-low p-4 relative overflow-hidden">
                <div className="relative z-10">
                  {poolLoading ? (
                    <div className="space-y-2"><SkeletonLine className="h-4 w-40" /><SkeletonLine className="h-3 w-full" /></div>
                  ) : selectedPool ? (
                    <>
                      <div className="text-xs font-bold mb-1 text-white">{selectedMatchName ?? `Pool #${activePoolId}`}</div>
                      <p className="text-[10px] text-on-surface-variant leading-relaxed mb-4">
                        P1 Win Probability: {(odds.impliedP1 / 100).toFixed(1)}% · P2: {(odds.impliedP2 / 100).toFixed(1)}%
                        {selectedPool.total_pot && ` · Pool: ${formatPot(selectedPool.total_pot)} USDC`}
                      </p>
                    </>
                  ) : (
                    <div className="text-[10px] text-on-surface-variant">Select a market to view analytics</div>
                  )}
                </div>
                <div className="h-20 w-full mt-2 relative">
                  <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                    <path d="M0 40 L0 30 Q 25 10, 50 25 T 100 5 L 100 40 Z" fill="url(#purpleGradient)" fillOpacity="0.2"></path>
                    <path d="M0 30 Q 25 10, 50 25 T 100 5" fill="none" stroke="#8A2BE2" strokeWidth="1"></path>
                    <defs>
                      <linearGradient id="purpleGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#8A2BE2"></stop>
                        <stop offset="100%" stopColor="#8A2BE2" stopOpacity="0"></stop>
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </div>

            {/* Bet Slip Module */}
            <div className="p-6 flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-headline text-xs font-bold uppercase tracking-widest text-white">Bet Slip</h2>
                <span className="text-[10px] text-on-surface-variant">
                  {chainType === 'starknet' ? '⚡ Starknet' : chainType === 'evm' ? '🔵 Beam Network' : 'Multi-Chain Enabled'}
                </span>
              </div>
              
              {!chainType ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
                  <Wallet className="w-8 h-8 text-on-surface-variant/40" />
                  <p className="text-xs text-on-surface-variant uppercase tracking-widest">Connect wallet to place bets</p>
                </div>
              ) : poolLoading ? (
                <div className="space-y-4"><SkeletonLine className="h-10 w-full" /><SkeletonLine className="h-10 w-full" /><SkeletonLine className="h-12 w-full" /></div>
              ) : selectedPool ? (
                <div className="space-y-6">
                  {/* Odds Toggle */}
                  <div className="grid grid-cols-2 bg-surface-container-low p-1">
                    <button
                      onClick={() => setPredictedWinner('p1')}
                      className={`text-[10px] font-bold py-2 uppercase tracking-tighter transition-all ${
                        predictedWinner === 'p1' ? 'bg-surface-container-highest text-white' : 'text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      P1 <span className="text-primary ml-2">{odds.p1 > 0 ? `${odds.p1.toFixed(2)}x` : '—'}</span>
                    </button>
                    <button
                      onClick={() => setPredictedWinner('p2')}
                      className={`text-[10px] font-bold py-2 uppercase tracking-tighter transition-all ${
                        predictedWinner === 'p2' ? 'bg-surface-container-highest text-white' : 'text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      P2 <span className="text-on-surface-variant ml-2">{odds.p2 > 0 ? `${odds.p2.toFixed(2)}x` : '—'}</span>
                    </button>
                  </div>
                  
                  {/* Amount Input */}
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 block">Amount to Position</label>
                    <div className="relative">
                      <input
                        className="w-full bg-surface-container-low border-b-2 border-surface-container-highest focus:border-primary transition-all px-4 py-3 text-sm font-bold text-white outline-none"
                        placeholder="0.00"
                        type="text"
                        value={wagerAmount}
                        onChange={e => setWagerAmount(e.target.value)}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary">USDC</span>
                    </div>
                  </div>
                  
                  {/* Summary */}
                  <div className="space-y-2 py-4 border-y border-surface-container-low">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-on-surface-variant">Est. Payout</span>
                      <span className="font-bold text-white">{potentialReturn} USDC</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-on-surface-variant">Network</span>
                      <span className="font-bold text-white">{chainType === 'starknet' ? 'Starknet Sepolia' : 'Beam Testnet'}</span>
                    </div>
                  </div>
                  
                  {/* Execute CTA */}
                  <button
                    onClick={handleExecuteBet}
                    disabled={betStatus === 'submitting' || !wagerAmount || parseFloat(wagerAmount) <= 0}
                    className="w-full bg-primary-container text-on-primary-container font-headline font-bold py-4 text-xs uppercase tracking-[0.3em] hover:brightness-110 transition-all shadow-[0_0_20px_rgba(138,43,226,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {betStatus === 'submitting' ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : 'Execute Bet'}
                  </button>

                  {betStatus === 'success' && (
                    <div className="text-[10px] text-green-400 font-mono text-center uppercase tracking-widest">✓ Transaction confirmed</div>
                  )}
                  {betError && (
                    <div className="text-[10px] text-red-400 font-mono text-center truncate">{betError}</div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-xs text-on-surface-variant uppercase tracking-widest">No market selected</p>
                </div>
              )}

              {/* Chat Module */}
              <div className="mt-auto pt-6 border-t border-surface-container-low">
                <div className="flex items-center gap-2 mb-3">
                  <Send className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Oracle Chat</span>
                </div>
                <div className="flex gap-2">
                  <input className="flex-1 bg-surface-container-low border-none text-[10px] py-2 px-3 outline-none focus:ring-1 focus:ring-primary/30 text-white" placeholder="Type a message..." type="text" />
                  <button className="bg-surface-container-highest p-2 hover:bg-surface-container-lowest transition-colors">
                    <Send className="w-4 h-4 text-on-surface-variant" />
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </main>

        {/* ---- MOBILE MAIN CONTENT (stitch 8) ---- */}
        <main className="md:hidden flex-1 pb-24 overflow-y-auto w-full">
          {/* Hero Section */}
          <section className="px-2 pt-4">
            <div className="relative group border border-outline-variant/30 overflow-hidden shadow-2xl">
              <div className="aspect-video w-full bg-black relative">
                <img className="w-full h-full object-cover opacity-80" alt="eSports broadcast" src="https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-between p-4">
                  <div className="flex justify-between items-start w-full">
                    <span className="bg-primary-container text-on-primary-container text-[9px] font-bold px-2 py-1 tracking-widest uppercase flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                      LIVE STREAM
                    </span>
                    <div className="bg-black/50 backdrop-blur-md px-2 py-1 text-[9px] font-mono text-white border border-white/10 rounded-sm">
                      {egsLoading ? '...' : `${bettableGames.length} ACTIVE`}
                    </div>
                  </div>
                  <div className="flex justify-between items-end w-full">
                    <h2 className="font-headline font-bold text-2xl tracking-tight text-white drop-shadow-md">
                      {selectedMatchName ?? 'Select Market'}
                    </h2>
                    <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded border border-white/5">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                      <span className="text-[10px] font-mono text-white">LIVE</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Vision Consensus Feed (Mobile) */}
          <section className="px-2 gap-4 mt-4">
            <div className="bg-surface-container-low p-5 relative overflow-hidden border border-transparent mb-4">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary/40"></div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-headline text-[10px] font-semibold text-primary/80 uppercase tracking-widest flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-primary" /> Vision Consensus Feed
                </h3>
                <Activity className="w-3.5 h-3.5 text-primary/40" />
              </div>
              <div className="space-y-3 font-mono text-[10px]">
                {selectedWorldEvents.length > 0 ? (
                  selectedWorldEvents.slice(-3).map((evt, i) => (
                    <div key={evt.id} className="flex items-start" style={{ opacity: 1 - i * 0.2 }}>
                      <span className="text-primary/60 shrink-0 mr-3 w-16">[{new Date(evt.seenAt).toLocaleTimeString('en-GB', { hour12: false }).slice(0, 8)}]</span>
                      <span className="text-on-surface uppercase leading-relaxed">Block #{evt.blockNumber} event detected</span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-start opacity-70">
                    <span className="text-primary/40 shrink-0 mr-3">[--.--]</span>
                    <span className="text-on-surface/80 uppercase leading-relaxed">Awaiting oracle sync...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Win Probability (Mobile) */}
            <div className="bg-surface-container-low p-5 border border-transparent">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-headline text-[10px] font-semibold text-primary/80 uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5" /> Win Probability
                  </h3>
                  <p className="text-3xl font-headline font-bold text-white tracking-tighter mt-2">
                    {odds.impliedP1 > 0 ? `${(odds.impliedP1 / 100).toFixed(1)}%` : '—'}
                    <span className="text-sm font-light text-primary/60 ml-1">P1</span>
                  </p>
                </div>
                {odds.impliedP1 > 0 && (
                  <div className="bg-emerald-500/10 px-2 py-1 border border-emerald-500/20">
                    <span className="text-[10px] font-mono font-bold text-emerald-400">{odds.p1.toFixed(2)}x</span>
                  </div>
                )}
              </div>
              <div className="h-20 w-full flex items-end gap-[2px]">
                {[40, 45, 42, 55, 65, 60, 70, odds.impliedP1 > 0 ? odds.impliedP1 / 100 : 74].map((h, i) => (
                  <div key={i} className={`flex-1 transition-colors cursor-pointer ${i === 7 ? 'bg-primary/40 border-t-2 border-primary relative' : 'bg-[#353534] hover:bg-[#4c4354]'}`} style={{ height: `${h}%` }}>
                    {i === 7 && <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white shadow-[0_0_10px_#fff]"></div>}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Mobile Betting Terminal */}
          <section className="px-2 mt-4">
            <div className="bg-surface-container-low p-5 border-t-[3px] border-primary relative shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-headline text-[10px] font-bold text-white uppercase tracking-[0.3em] flex items-center gap-2">
                  <Coins className="w-4 h-4 text-primary" /> Execution Terminal
                </h3>
                <span className="text-[9px] text-[#cfc2d7] uppercase tracking-widest font-mono bg-[#353534] px-2 py-1">
                  {chainType === 'starknet' ? 'Starknet' : chainType === 'evm' ? 'Beam Network' : 'No Wallet'}
                </span>
              </div>

              {!chainType ? (
                <div className="py-8 flex flex-col items-center gap-3">
                  <Wallet className="w-6 h-6 text-on-surface-variant/40" />
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">Connect wallet to trade</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-3 mb-6">
                    <button
                      onClick={() => setPredictedWinner('p1')}
                      className={`flex-1 py-4 px-5 text-left transition-all relative ${
                        predictedWinner === 'p1' ? 'border-l-[3px] border-primary bg-surface-container-highest' : 'bg-surface-container-lowest/50 border-l-[3px] border-transparent'
                      }`}
                    >
                      <span className="text-[9px] font-mono text-gray-400 uppercase block mb-1">Outcome A</span>
                      <span className="text-xl font-headline font-bold text-white block mb-1">Player 1</span>
                      <span className="text-xs font-mono text-primary font-semibold">{odds.p1 > 0 ? `${odds.p1.toFixed(2)}x` : '—'}</span>
                      {predictedWinner === 'p1' && <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_5px_#8a2be2]"></div>}
                    </button>
                    <button
                      onClick={() => setPredictedWinner('p2')}
                      className={`flex-1 py-4 px-5 text-left transition-all ${
                        predictedWinner === 'p2' ? 'border-l-[3px] border-primary bg-surface-container-highest' : 'bg-surface-container-lowest/50 border-l-[3px] border-transparent'
                      }`}
                    >
                      <span className="text-[9px] font-mono text-gray-500 uppercase block mb-1">Outcome B</span>
                      <span className="text-xl font-headline font-bold text-[#cfc2d7]">Player 2</span>
                      <span className="block text-xs font-mono text-gray-500">{odds.p2 > 0 ? `${odds.p2.toFixed(2)}x` : '—'}</span>
                    </button>
                  </div>

                  <div className="space-y-5">
                    <div className="relative">
                      <label className="text-[9px] font-mono text-primary/60 uppercase absolute top-2.5 left-4 z-10 font-bold tracking-widest">Wager Amount (USDC)</label>
                      <input
                        className="w-full bg-[#0e0e0e] border-0 border-b-2 border-outline-variant pt-8 pb-3 px-4 font-mono text-xl text-white focus:ring-0 focus:border-primary transition-colors outline-none"
                        type="text"
                        value={wagerAmount}
                        onChange={e => setWagerAmount(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-between items-center py-2 px-1 border-b border-white/5">
                      <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Potential Return</span>
                      <span className="text-[11px] font-mono font-bold text-emerald-400">{potentialReturn} USDC</span>
                    </div>
                    <button
                      onClick={handleExecuteBet}
                      disabled={betStatus === 'submitting'}
                      className="w-full py-4 bg-gradient-to-br from-primary-container to-primary text-on-primary-container font-headline font-bold uppercase tracking-[0.2em] text-[11px] shadow-[0_0_20px_rgba(138,43,226,0.3)] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {betStatus === 'submitting' ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : 'Execute Bet'}
                    </button>
                    {betStatus === 'success' && <div className="text-[10px] text-green-400 font-mono text-center uppercase">✓ Confirmed</div>}
                    {betError && <div className="text-[10px] text-red-400 font-mono text-center truncate">{betError}</div>}
                  </div>
                </>
              )}
            </div>
          </section>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center bg-surface border-t-2 border-surface-container-low h-16 pointer-events-auto">
        <a className="flex flex-col items-center justify-center text-primary bg-surface-container-low border-t-2 border-primary -mt-[2px] w-full h-full" href="/">
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
