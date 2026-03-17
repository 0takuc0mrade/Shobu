'use client'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useEgs } from '@/providers/egs-provider'
import { web3Config } from '@/lib/web3-config'
import { formatUnits } from '@/lib/token-utils'
import { sameAddress } from '@/lib/address-utils'

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
  if (!pool?.total_pot) return 'No active pool'
  let raw: bigint
  try {
    raw = BigInt(pool.total_pot)
  } catch {
    return `${pool.total_pot} TOKEN`
  }
  const tokenAddress = pool.token ?? ''
  const knownToken =
    sameAddress(tokenAddress, web3Config.tokens.strk.address)
      ? web3Config.tokens.strk
      : sameAddress(tokenAddress, web3Config.tokens.eth.address)
        ? web3Config.tokens.eth
        : null

  if (!knownToken) return `${pool.total_pot} TOKEN`
  const formatted = formatUnits(raw, knownToken.decimals)
  return `${formatted} ${knownToken.symbol}`
}

function isLive(lastSeenAt?: number) {
  if (!lastSeenAt) return false
  const ageMs = Date.now() - lastSeenAt
  return ageMs < Math.max(web3Config.egsPollIntervalMs * 2, 15000)
}

export function GameGrid() {
  const { games, loading, error, lastSeenAtByWorld } = useEgs()

  if (loading && games.length === 0) {
    return <div className="text-sm text-muted-foreground">Loading EGS games…</div>
  }

  if (error && games.length === 0) {
    return <div className="text-sm text-muted-foreground">{error}</div>
  }

  if (games.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No EGS games discovered yet. Set `NEXT_PUBLIC_EGS_GAMES_API` to enable discovery.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {games.map((game, index) => {
        const lastSeenAt = lastSeenAtByWorld[game.worldAddress]
        const live = isLive(lastSeenAt)
        const poolLabel = formatPool(game.pool)
        const gradient = game.color
          ? `linear-gradient(135deg, ${game.color} 0%, #06b6d4 100%)`
          : pickGradient(game.name ?? `${game.gameId}-${index}`)

        return (
        <Card
          key={`${game.worldAddress}-${game.gameId}`}
          className="overflow-hidden hover:shadow-lg hover:shadow-neon-purple/30 transition-all duration-300 card-border group cursor-pointer"
        >
          {/* Thumbnail */}
          <div
            className="h-32 relative overflow-hidden bg-gradient-to-br"
            style={{ backgroundImage: gradient }}
          >
            {/* Live Badge */}
            {live && (
              <div className="absolute top-3 right-3">
                <Badge className="bg-neon-purple/20 text-neon-purple border-neon-purple/50 live-pulse gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-neon-purple animate-pulse" />
                  LIVE
                </Badge>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            {/* Game Name */}
            <div>
              <h3 className="font-bold text-foreground group-hover:text-neon-blue transition-colors">
                {game.name}
              </h3>
            </div>

            {/* Players */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">EGS Game</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Game ID {game.gameId}</span>
                {game.bettable ? (
                  <span className="text-neon-blue">Bettable</span>
                ) : (
                  <span className="text-gray-500">No Pool</span>
                )}
              </div>
            </div>

            {/* Pool */}
            <div className="border-t border-slate-700/50 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Betting Pool</p>
                <p className="font-bold text-neon-blue">{poolLabel}</p>
              </div>
            </div>
          </div>
        </Card>
        )
      })}
    </div>
  )
}
