'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, Wallet, Trophy } from 'lucide-react';
import { useClaimWinnings } from '@/hooks/use-betting-actions';
import { web3Config } from '@/lib/web3-config';

export function PortfolioSummary() {
  const totalWagered = 12500.50;
  const totalWon = 18750.25;
  const claimableWinnings = 3250.75;
  const { claim, status: claimStatus, error: claimError } = useClaimWinnings();

  const handleClaimAll = async () => {
    await claim(web3Config.activePoolId);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Total Wagered Card */}
      <Card className="card-border bg-slate-mid/40 backdrop-blur p-6 hover:border-neon-purple/50 transition-all duration-300">
        <div className="flex items-start justify-between mb-4">
          <div className="p-2 rounded-lg bg-neon-purple/10">
            <TrendingUp className="w-6 h-6 text-neon-purple" />
          </div>
        </div>
        <p className="text-muted-foreground text-sm mb-2">Total Wagered</p>
        <p className="text-3xl font-bold text-foreground">{totalWagered.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        <p className="text-xs text-muted-foreground mt-3">Across all bets</p>
      </Card>

      {/* Total Won Card */}
      <Card className="card-border bg-slate-mid/40 backdrop-blur p-6 hover:border-neon-blue/50 transition-all duration-300">
        <div className="flex items-start justify-between mb-4">
          <div className="p-2 rounded-lg bg-neon-blue/10">
            <Trophy className="w-6 h-6 text-neon-blue" />
          </div>
        </div>
        <p className="text-muted-foreground text-sm mb-2">Total Won</p>
        <p className="text-3xl font-bold text-foreground">{totalWon.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        <p className="text-xs text-muted-foreground mt-3">Winnings earned</p>
      </Card>

      {/* Claimable Winnings Card */}
      <Card className="card-border bg-slate-mid/40 backdrop-blur p-6 border-chart-3/50 hover:border-chart-3 transition-all duration-300">
        <div className="flex items-start justify-between mb-4">
          <div className="p-2 rounded-lg bg-chart-3/10">
            <Wallet className="w-6 h-6" style={{ color: '#10b981' }} />
          </div>
        </div>
        <p className="text-muted-foreground text-sm mb-2">Claimable Winnings</p>
        <p className="text-3xl font-bold" style={{ color: '#10b981' }}>
          {claimableWinnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <button
          onClick={handleClaimAll}
          disabled={claimStatus === 'submitting'}
          className="mt-4 w-full px-4 py-2 rounded-lg bg-gradient-to-r from-chart-3 to-chart-3/80 text-slate-dark font-semibold hover:from-chart-3/80 hover:to-chart-3/60 transition-all duration-300 shadow-lg hover:shadow-chart-3/50"
          style={{
            boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)',
          }}
        >
          {claimStatus === 'submitting' ? 'Claiming...' : 'Claim All'}
        </button>
        {claimError && (
          <p className="text-xs text-red-400 mt-2">{claimError}</p>
        )}
        <p className="text-xs text-muted-foreground mt-3">Available to claim</p>
      </Card>
    </div>
  );
}
