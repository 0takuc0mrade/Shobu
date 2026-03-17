'use client';

import { useState } from 'react';
import { TopNavBar } from '@/components/top-nav-bar';
import { Sidebar } from '@/components/sidebar';
import { PortfolioSummary } from '@/components/portfolio-summary';
import { BettingHistoryTable } from '@/components/betting-history-table';

export default function PortfolioPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNavBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
            {/* Page Header */}
            <div>
              <h1 className="text-3xl md:text-4xl font-bold neon-glow">My Portfolio</h1>
              <p className="text-muted-foreground mt-2">Track your betting history and earnings</p>
            </div>

            {/* Portfolio Summary */}
            <PortfolioSummary />

            {/* Betting History */}
            <BettingHistoryTable />
          </div>
        </main>
      </div>
    </div>
  );
}
