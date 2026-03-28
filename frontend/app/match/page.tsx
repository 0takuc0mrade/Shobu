'use client';

import { useState } from 'react';
import { TopNavBar } from '@/components/top-nav-bar';
import { Sidebar } from '@/components/sidebar';
import { MatchSpectator } from '@/components/match-spectator';
import { BettingPanel } from '@/components/betting-panel';

export default function MatchPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopNavBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 lg:p-6 min-h-0 overflow-y-auto lg:overflow-hidden">
          {/* Left Panel — game spectator */}
          <div className="w-full lg:flex-[3] flex flex-col gap-4 min-w-0 shrink-0 lg:shrink lg:overflow-y-auto">
            <MatchSpectator />
          </div>
          
          {/* Right Panel — odds + bet slip */}
          <div className="w-full lg:flex-[2] flex flex-col gap-4 min-w-0 shrink-0 lg:shrink lg:overflow-y-auto">
            <BettingPanel />
          </div>
        </main>
      </div>
    </div>
  );
}
