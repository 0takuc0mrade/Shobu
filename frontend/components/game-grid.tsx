'use client'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Trophy, Users, Clock, Swords } from 'lucide-react'
import { useBudokan, BudokanTournament } from '@/providers/budokan-provider'
import { useEgs } from '@/providers/egs-provider'
import { web3Config } from '@/lib/web3-config'
import { formatUnits } from '@/lib/token-utils'
import { sameAddress } from '@/lib/address-utils'
import Link from 'next/link'

const gradients = [
  'linear-gradient(135deg, #a855f7 0%, #06b6d4 100%)',
  'linear-gradient(135deg, #06b6d4 0%, #10b981 100%)',
  'linear-gradient(135deg, #d946ef 0%, #a855f7 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
  'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
]

function pickGradient(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % gradients.length
  }
  return gradients[hash] ?? gradients[0]
}

function formatPool(pool?: { total_pot?: string; token?: string } | null) {
  if (!pool?.total_pot) return null
  let raw: bigint
  try { raw = BigInt(pool.total_pot) } catch { return `${pool.total_pot} TOKEN` }
  const tokenAddress = pool.token ?? ''
  const knownToken = sameAddress(tokenAddress, web3Config.tokens.strk.address)
    ? web3Config.tokens.strk
    : sameAddress(tokenAddress, web3Config.tokens.eth.address)
      ? web3Config.tokens.eth
      : null
  if (!knownToken) return `${pool.total_pot} TOKEN`
  return `${formatUnits(raw, knownToken.decimals)} ${knownToken.symbol}`
}

const phaseColors: Record<number, string> = {
  0: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  1: 'bg-green-500/20 text-green-400 border-green-500/50',
  2: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  3: 'bg-neon-purple/20 text-neon-purple border-neon-purple/50',
  4: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  5: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 md:gap-6">
      {[...Array(6)].map((_, i) => (
        <Card key={i} className="overflow-hidden card-border">
          <div className="h-28 sm:h-32 shimmer" />
          <div className="p-4 space-y-3">
            <div className="h-4 w-3/4 rounded shimmer" />
            <div className="h-3 w-1/2 rounded shimmer" />
            <div className="border-t border-slate-700/50 pt-3">
              <div className="h-3 w-2/3 rounded shimmer" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

function TournamentCard({ tournament, index }: { tournament: BudokanTournament; index: number }) {
  const gradient = pickGradient(tournament.name || tournament.id)
  const isLive = tournament.phase === 3
  const isOpen = tournament.phase <= 2

  return (
    <Link href={`/match?tournamentId=${tournament.id}`} className="block">
      <Card
        className="overflow-hidden hover:shadow-lg hover:shadow-neon-purple/20 transition-all duration-300 card-border group cursor-pointer hover:-translate-y-1 scale-in"
        style={{ animationDelay: `${index * 0.06}s` }}
      >
      {/* Thumbnail */}
      <div
        className="h-28 sm:h-32 relative overflow-hidden"
        style={{ backgroundImage: gradient }}
      >
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />

        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Trophy className="w-8 h-8 text-white/30 group-hover:text-white/50 transition-colors" />
        </div>

        {/* Phase Badge */}
        <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3">
          <Badge className={`${phaseColors[tournament.phase] ?? phaseColors[0]} gap-1.5 text-xs`}>
            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-neon-purple animate-pulse" />}
            {tournament.phaseLabel}
          </Badge>
        </div>

        {/* Source badge */}
        <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3">
          <Badge className="bg-black/30 text-white/80 border-white/20 text-xs gap-1">
            <Swords className="w-3 h-3" />
            Budokan
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
        <div>
          <h3 className="font-bold text-sm sm:text-base text-foreground group-hover:text-neon-blue transition-colors duration-200 truncate">
            {tournament.name || `Tournament #${tournament.id}`}
          </h3>
          {tournament.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {tournament.description}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {tournament.entryCount} entries
          </span>
          {isOpen && (
            <span className="flex items-center gap-1 text-green-400">
              <Clock className="w-3 h-3" />
              Open
            </span>
          )}
        </div>

        {/* Bottom */}
        <div className="border-t border-slate-700/50 pt-2 sm:pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Tournament #{tournament.id}</p>
            <p className={`font-bold text-sm ${isLive ? 'text-neon-purple' : isOpen ? 'text-green-400' : 'text-muted-foreground'}`}>
              {isLive ? '🔴 LIVE' : isOpen ? 'Bettable' : tournament.phaseLabel}
            </p>
          </div>
        </div>
      </div>
    </Card>
    </Link>
  )
}

function EgsCard({ game, index }: { game: ReturnType<typeof useEgs>['games'][0]; index: number }) {
  const gradient = game.color
    ? `linear-gradient(135deg, ${game.color} 0%, #06b6d4 100%)`
    : pickGradient(game.name ?? `${game.gameId}-${index}`)
  const poolLabel = formatPool(game.pool)

  return (
    <Link href={game.pool?.pool_id ? `/match?poolId=${game.pool.pool_id}` : '#'} className="block">
      <Card
        className="overflow-hidden hover:shadow-lg hover:shadow-neon-purple/20 transition-all duration-300 card-border group cursor-pointer hover:-translate-y-1 scale-in"
        style={{ animationDelay: `${index * 0.06}s` }}
      >
      <div className="h-28 sm:h-32 relative overflow-hidden" style={{ backgroundImage: gradient }}>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
        <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3">
          <Badge className="bg-black/30 text-white/80 border-white/20 text-xs">EGS</Badge>
        </div>
      </div>
      <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
        <h3 className="font-bold text-sm sm:text-base text-foreground group-hover:text-neon-blue transition-colors duration-200 truncate">
          {game.name}
        </h3>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Game ID {game.gameId}</span>
          {game.bettable ? (
            <span className="text-neon-blue font-medium">Bettable</span>
          ) : (
            <span className="text-gray-500">No Pool</span>
          )}
        </div>
        <div className="border-t border-slate-700/50 pt-2 sm:pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Betting Pool</p>
            <p className={`font-bold text-sm ${!poolLabel ? 'text-muted-foreground text-xs' : 'text-neon-blue'}`}>
              {poolLabel ?? 'No active pool'}
            </p>
          </div>
        </div>
      </div>
    </Card>
    </Link>
  )
}

export function GameGrid() {
  const { tournaments, loading: budokanLoading, error: budokanError } = useBudokan()
  const { games: egsGames, loading: egsLoading } = useEgs()
  const loading = budokanLoading && egsLoading

  if (loading && tournaments.length === 0 && egsGames.length === 0) {
    return <LoadingSkeleton />
  }

  const hasTournaments = tournaments.length > 0
  const hasEgsGames = egsGames.length > 0

  if (!hasTournaments && !hasEgsGames) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <div className="text-center space-y-2">
          <p className="text-2xl">🏟️</p>
          <p>No tournaments or games discovered yet.</p>
          {budokanError && <p className="text-xs text-destructive">{budokanError}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Budokan Tournaments */}
      {hasTournaments && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-neon-purple" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Budokan Tournaments</h3>
            <Badge className="bg-neon-purple/10 text-neon-purple border-neon-purple/30 text-xs">{tournaments.length}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 md:gap-6">
            {tournaments.map((t, i) => (
              <TournamentCard key={t.id} tournament={t} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* EGS Games */}
      {hasEgsGames && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-neon-blue" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">EGS Games</h3>
            <Badge className="bg-neon-blue/10 text-neon-blue border-neon-blue/30 text-xs">{egsGames.length}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 md:gap-6">
            {egsGames.map((game, i) => (
              <EgsCard key={`${game.worldAddress}-${game.gameId}`} game={game} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
