'use client';

import { useState } from 'react';
import { TopNavBar } from '@/components/top-nav-bar';
import { Sidebar } from '@/components/sidebar';
import { MatchSpectator } from '@/components/match-spectator';
import { BettingPanel } from '@/components/betting-panel';

export default function MatchPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex-1 flex flex-col">
        <TopNavBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 flex gap-6 p-6 overflow-hidden">
          {/* Left Panel - 60% */}
          <div className="flex-[3] flex flex-col gap-4 min-w-0">
            <MatchSpectator />
          </div>
          
          {/* Right Panel - 40% */}
          <div className="flex-[2] flex flex-col gap-4 min-w-0">
            <BettingPanel />
          </div>
        </main>
      </div>
    </div>
  );
}
