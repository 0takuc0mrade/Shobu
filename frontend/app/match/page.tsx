'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TopNavBar } from '@/components/top-nav-bar';
import { Sidebar } from '@/components/sidebar';
import { MatchSpectator } from '@/components/match-spectator';
import { BettingPanel } from '@/components/betting-panel';
import { ProbabilityChart } from '@/components/ProbabilityChart';
import { Trollbox } from '@/components/Trollbox';
import { web3Config } from '@/lib/web3-config';

function MatchPageContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const searchParams = useSearchParams();
  const poolIdParam = searchParams.get('poolId');
  const poolId = poolIdParam ? parseInt(poolIdParam, 10) : web3Config.activePoolId;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopNavBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 lg:p-6 min-h-0 overflow-y-auto lg:overflow-hidden">
          {/* Left Panel — game spectator + probability chart */}
          <div className="w-full lg:flex-[3] flex flex-col gap-4 min-w-0 shrink-0 lg:shrink lg:overflow-y-auto">
            <MatchSpectator />
            <ProbabilityChart />
          </div>
          
          {/* Right Panel — odds + bet slip */}
          <div className="w-full lg:flex-[2] flex flex-col gap-4 min-w-0 shrink-0 lg:shrink lg:overflow-y-auto">
            <BettingPanel />
          </div>
        </main>
      </div>

      {/* Floating Trollbox */}
      <Trollbox poolId={poolId} />
    </div>
  );
}

export default function MatchPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-background text-foreground">Loading...</div>}>
      <MatchPageContent />
    </Suspense>
  );
}

