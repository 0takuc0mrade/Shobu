'use client'

import { Gamepad2, TrendingUp, Trophy, BookOpen, Menu, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'
import { TopNavBar } from '@/components/top-nav-bar'
import { Sidebar } from '@/components/sidebar'
import { HeroBanner } from '@/components/hero-banner'
import { GameGrid } from '@/components/game-grid'

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen bg-slate-dark text-foreground">
      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navigation */}
        <TopNavBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

        {/* Main Content Area */}
        <div className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">
            {/* Hero Banner */}
            <HeroBanner />

            {/* Active Games Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-neon-blue" />
                <h2 className="text-2xl font-bold">Active Games</h2>
              </div>
              <GameGrid />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
