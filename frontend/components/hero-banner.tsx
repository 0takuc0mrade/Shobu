'use client'

import { Play, Sparkles, Swords } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useBudokan } from '@/providers/budokan-provider'

export function HeroBanner() {
  const { tournaments } = useBudokan()
  const liveTournaments = tournaments.filter((t) => t.phase === 3)
  const openTournaments = tournaments.filter((t) => t.phase <= 2)
  const featured = liveTournaments[0] || openTournaments[0] || tournaments[0]

  return (
    <div className="relative rounded-xl overflow-hidden group card-border min-h-[200px] sm:min-h-[240px] md:min-h-[280px]">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-neon-purple/20 via-slate-mid to-neon-blue/20 gradient-shift" />

      {/* Animated grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(168,85,247,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Neon accent line */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-purple via-neon-blue to-neon-purple gradient-shift" />

      {/* Floating orbs */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-neon-purple/10 rounded-full blur-3xl float" />
      <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-neon-blue/10 rounded-full blur-3xl float" style={{ animationDelay: '3s' }} />

      {/* Content */}
      <div className="relative h-full flex flex-col justify-between p-5 sm:p-6 md:p-8 gap-4 sm:gap-6">
        {/* Top Section */}
        <div className="space-y-2 sm:space-y-3 fade-in-up">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-neon-purple/20 text-neon-purple border-neon-purple/50 w-fit gap-1.5 text-xs">
              <Swords className="w-3 h-3" />
              Budokan Tournaments
            </Badge>
            {liveTournaments.length > 0 && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/50 text-xs gap-1 live-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                {liveTournaments.length} LIVE
              </Badge>
            )}
          </div>

          {featured ? (
            <>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold neon-glow leading-tight">
                {featured.name || `Tournament #${featured.id}`}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground max-w-lg">
                {featured.description || `${featured.entryCount} entries · ${featured.phaseLabel}`}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold neon-glow leading-tight">
                Shōbu × Budokan
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground max-w-lg">
                Bet on tournament outcomes, head-to-head matchups, and PvE leaderboard positions
              </p>
            </>
          )}
        </div>

        {/* Bottom Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 fade-in-up" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-4 sm:gap-6 text-sm">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Tournaments</p>
              <p className="text-lg font-bold text-neon-purple">{tournaments.length}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Open to Bet</p>
              <p className="text-lg font-bold text-green-400">{openTournaments.length}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Live Now</p>
              <p className="text-lg font-bold text-red-400">{liveTournaments.length}</p>
            </div>
          </div>

          <button className="w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 rounded-full bg-neon-blue text-slate-dark font-semibold hover:bg-neon-blue/80 transition-all duration-300 shadow-lg hover:shadow-neon-blue/50 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 group/btn">
            <Play className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
            Explore Tournaments
          </button>
        </div>
      </div>
    </div>
  )
}
