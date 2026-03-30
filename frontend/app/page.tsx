'use client'

import { Zap } from 'lucide-react'
import { useState } from 'react'
import { TopNavBar } from '@/components/top-nav-bar'
import { Sidebar } from '@/components/sidebar'
import { HeroBanner } from '@/components/hero-banner'
import { GameGrid } from '@/components/game-grid'
import { UserRequestedMarket } from '@/components/UserRequestedMarket'

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-slate-dark text-foreground">
      {/* Sidebar - hidden by default on mobile */}
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Navigation */}
        <TopNavBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

        {/* Main Content Area */}
        <div className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto w-full">
            {/* Hero Banner */}
            <HeroBanner />

            {/* Request a Market */}
            <div className="fade-in-up" style={{ animationDelay: '0.1s' }}>
              <UserRequestedMarket />
            </div>

            {/* Active Games Section */}
            <div className="space-y-3 sm:space-y-4 fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-neon-blue" />
                <h2 className="text-xl sm:text-2xl font-bold">Active Games</h2>
              </div>
              <GameGrid />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

