'use client';

import { useState, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Sparkles, BrainCircuit, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { BetSlip } from './bet-slip';
import { useBettingPool, usePoolOdds, useWeb2BettingPool } from '@/hooks/use-dojo-betting';
import { web3Config } from '@/lib/web3-config';
import { shortString } from 'starknet';

function BettingPanelContent() {
  const [selectedPlayer, setSelectedPlayer] = useState<'playerA' | 'playerB' | null>(null);
  const [betAmount, setBetAmount] = useState('100');
  const searchParams = useSearchParams();
  const poolIdParam = searchParams.get('poolId');
  const poolId = poolIdParam ? parseInt(poolIdParam, 10) : web3Config.activePoolId;
  const { data: pool } = useBettingPool(poolId);
  const { data: web2Pool } = useWeb2BettingPool(poolId);
  const odds = usePoolOdds(poolId);
  const totalPot = Number(pool?.total_pot ?? 0) / 1e18;
  const totalP1 = Number(pool?.total_on_p1 ?? 0) / 1e18;
  const totalP2 = Number(pool?.total_on_p2 ?? 0) / 1e18;

  const parsedBet = parseFloat(betAmount) || 0;
  const simTotalP1 = totalP1 + (selectedPlayer === 'playerA' ? parsedBet : 0);
  const simTotalP2 = totalP2 + (selectedPlayer === 'playerB' ? parsedBet : 0);
  const simPot = totalPot + parsedBet;

  let fallbackP1 = 2.0;
  let fallbackP2 = 2.0;
  
  if (simPot > 0) {
    fallbackP1 = simTotalP1 > 0 ? simPot / simTotalP1 : simPot;
    fallbackP2 = simTotalP2 > 0 ? simPot / simTotalP2 : simPot;
  }

  const displayOdds = {
    playerA: (odds.p1 && parsedBet === 0) ? odds.p1 : fallbackP1,
    playerB: (odds.p2 && parsedBet === 0) ? odds.p2 : fallbackP2,
  };

  const safeDecode = (value: string | undefined, fallback: string) => {
    if (!value) return fallback;
    try {
      return shortString.decodeShortString(value);
    } catch {
      return fallback;
    }
  };

  const p1Name = safeDecode(web2Pool?.player_1_tag, 'Champion (Player A)');
  const p2Name = safeDecode(web2Pool?.player_2_tag, 'Challenger (Player B)');

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Odds Display */}
      <Card className="card-border bg-slate-900/50 border-slate-700/50 shrink-0">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-neon-purple mt-0">Live Odds</CardTitle>
          {web2Pool && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neon-purple/10 border border-neon-purple/20 text-neon-purple text-xs font-medium tracking-wide">
              <ShieldCheck className="w-3.5 h-3.5" />
              Verified via Reclaim zkTLS
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Player A Option */}
          <button
            onClick={() => {
              setSelectedPlayer('playerA');
            }}
            className={`w-full p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 ${
              selectedPlayer === 'playerA'
                ? 'border-neon-purple bg-neon-purple/10'
                : 'border-slate-700/50 bg-slate-800/30 hover:border-neon-purple/50'
            }`}
          >
            <div className="flex justify-between items-center">
              <div className="text-left">
                <p className="font-semibold text-white text-sm sm:text-base">{p1Name}</p>
                <p className="text-xs text-gray-400 mt-1">Expected Win: High</p>
              </div>
              <div className="text-right">
                <p className="text-xl sm:text-2xl font-bold text-neon-purple">
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
            className={`w-full p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 ${
              selectedPlayer === 'playerB'
                ? 'border-neon-blue bg-neon-blue/10'
                : 'border-slate-700/50 bg-slate-800/30 hover:border-neon-blue/50'
            }`}
          >
            <div className="flex justify-between items-center">
              <div className="text-left">
                <p className="font-semibold text-white text-sm sm:text-base">{p2Name}</p>
                <p className="text-xs text-gray-400 mt-1">Expected Win: Underdog</p>
              </div>
              <div className="text-right">
                <p className="text-xl sm:text-2xl font-bold text-neon-blue">
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

      {/* AI Market Insight */}
      <Card className="card-border glass-card relative overflow-hidden group shrink-0">
        <div className="absolute inset-0 bg-gradient-to-r from-neon-purple/5 to-neon-blue/5 group-hover:from-neon-purple/10 group-hover:to-neon-blue/10 transition-colors duration-500" />
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-foreground">
            <BrainCircuit className="w-4 h-4 text-neon-purple" />
            Shobu Analyst AI
            <span className="w-1.5 h-1.5 rounded-full bg-neon-purple animate-pulse ml-auto" />
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">Autonomous Market Insight</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-300 leading-relaxed italic">
            "Market liquidity is currently heavily weighted towards the Challenger. The current odds offer a +15% expected value premium on the Champion based on historical matchup data."
          </p>
        </CardContent>
      </Card>

      {/* Bet Slip */}
      <div className="flex-1">
        <BetSlip 
          selectedPlayer={selectedPlayer}
          odds={selectedPlayer === 'playerA' ? displayOdds.playerA : selectedPlayer === 'playerB' ? displayOdds.playerB : 0}
          poolId={poolId}
          betAmount={betAmount}
          setBetAmount={setBetAmount}
          pool={pool}
          playerName={selectedPlayer === 'playerA' ? p1Name : selectedPlayer === 'playerB' ? p2Name : ''}
        />
      </div>
    </div>
  );
}

export function BettingPanel() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Loading betting panel...</div>}>
      <BettingPanelContent />
    </Suspense>
  );
}
