'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BetSlip } from './bet-slip';
import { useBettingPool, usePoolOdds } from '@/hooks/use-dojo-betting';
import { web3Config } from '@/lib/web3-config';

export function BettingPanel() {
  const [selectedPlayer, setSelectedPlayer] = useState<'playerA' | 'playerB' | null>(null);
  const poolId = web3Config.activePoolId;
  const { data: pool } = useBettingPool(poolId);
  const odds = usePoolOdds(poolId);
  const displayOdds = {
    playerA: odds.p1 || 1.45,
    playerB: odds.p2 || 2.1,
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Odds Display */}
      <Card className="card-border bg-slate-900/50 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-neon-purple">Live Odds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Player A Option */}
          <button
            onClick={() => {
              setSelectedPlayer('playerA');
            }}
            className={`w-full p-4 rounded-lg border-2 transition-all duration-200 ${
              selectedPlayer === 'playerA'
                ? 'border-neon-purple bg-neon-purple/10'
                : 'border-slate-700/50 bg-slate-800/30 hover:border-neon-purple/50'
            }`}
          >
            <div className="flex justify-between items-center">
              <div className="text-left">
                <p className="font-semibold text-white">Champion (Player A)</p>
                <p className="text-xs text-gray-400 mt-1">Expected Win: High</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-neon-purple">
                  {displayOdds.playerA.toFixed(2)}x
                </p>
              </div>
            </div>
          </button>

          {/* Player B Option */}
          <button
            onClick={() => {
              setSelectedPlayer('playerB');
            }}
            className={`w-full p-4 rounded-lg border-2 transition-all duration-200 ${
              selectedPlayer === 'playerB'
                ? 'border-neon-blue bg-neon-blue/10'
                : 'border-slate-700/50 bg-slate-800/30 hover:border-neon-blue/50'
            }`}
          >
            <div className="flex justify-between items-center">
              <div className="text-left">
                <p className="font-semibold text-white">Challenger (Player B)</p>
                <p className="text-xs text-gray-400 mt-1">Expected Win: Underdog</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-neon-blue">
                  {displayOdds.playerB.toFixed(2)}x
                </p>
              </div>
            </div>
          </button>

          {/* Odds Info */}
          <div className="text-xs text-gray-500 text-center pt-2">
            Odds update every 5 seconds
          </div>
        </CardContent>
      </Card>

      {/* Bet Slip */}
      <div className="flex-1">
        <BetSlip 
          selectedPlayer={selectedPlayer}
          odds={selectedPlayer === 'playerA' ? displayOdds.playerA : selectedPlayer === 'playerB' ? displayOdds.playerB : 0}
          poolId={poolId}
          pool={pool}
        />
      </div>
    </div>
  );
}
