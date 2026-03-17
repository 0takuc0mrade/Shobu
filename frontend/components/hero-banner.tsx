'use client'

import { Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export function HeroBanner() {
  return (
    <div className="relative h-64 rounded-xl overflow-hidden group card-border">
      {/* Background with gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-700/40 via-slate-mid to-slate-700/40" />

      {/* Neon accent lines */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-purple via-neon-blue to-transparent" />

      {/* Content */}
      <div className="relative h-full flex flex-col justify-between p-8">
        {/* Top Section */}
        <div className="space-y-2">
          <Badge className="bg-neon-purple/20 text-neon-purple border-neon-purple/50 w-fit">
            Featured Live Game
          </Badge>
          <h2 className="text-4xl font-bold neon-glow">
            Dragon's Ascent: Season Finals
          </h2>
          <p className="text-muted-foreground">
            Watch elite players compete for 50,000 STRK prize pool
          </p>
        </div>

        {/* Bottom Section */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Players Competing</p>
            <p className="text-xl font-bold">Phoenix Guild vs Shadow Nexus</p>
          </div>

          <button className="px-6 py-3 rounded-full bg-neon-blue text-slate-dark font-semibold hover:bg-neon-blue/80 transition-all duration-300 shadow-lg hover:shadow-neon-blue/50 flex items-center gap-2 group/btn">
            <Play className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
            Spectate Now
          </button>
        </div>
      </div>
    </div>
  )
}
