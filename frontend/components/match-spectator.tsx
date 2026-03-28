'use client';

import { Suspense } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LiveStats } from './live-stats';
import { useBettingPool, useWeb2BettingPool } from '@/hooks/use-dojo-betting';
import { web3Config } from '@/lib/web3-config';
import { shortString } from 'starknet';

function MatchSpectatorContent() {
  const searchParams = useSearchParams();
  const poolIdParam = searchParams.get('poolId');
  const poolId = poolIdParam ? parseInt(poolIdParam, 10) : web3Config.activePoolId;
  const { data: pool } = useBettingPool(poolId);
  const { data: web2Pool } = useWeb2BettingPool(poolId);

  const safeDecode = (value: string | undefined, fallback: string) => {
    if (!value) return fallback;
    try {
      return shortString.decodeShortString(value);
    } catch {
      return fallback;
    }
  };

  const p1Name = safeDecode(web2Pool?.player_1_tag, 'Champion (A)');
  const p2Name = safeDecode(web2Pool?.player_2_tag, 'Challenger (B)');

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Video/Canvas Placeholder */}
      <div className="relative w-full aspect-video rounded-lg overflow-hidden card-border bg-slate-900">
        <Image
          src="/game-thumbnail.jpg"
          alt="Live Game Spectator"
          fill
          className="object-cover"
        />
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        
        {/* "LIVE" Badge */}
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <div className="relative">
            <div className="live-pulse w-3 h-3 bg-neon-purple rounded-full" />
          </div>
          <span className="text-sm font-bold text-neon-purple neon-glow">LIVE</span>
        </div>
        
        {/* Match Info Overlay */}
        <div className="absolute bottom-2 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4 text-white">
          <h2 className="text-base sm:text-xl font-bold text-balance">
            {pool?.game_id ? `Match #${pool.game_id}` : `Match Pool #${poolId}`}
          </h2>
          <p className="text-xs sm:text-sm text-gray-300 mt-0.5 sm:mt-1">
            Players: {p1Name} vs {p2Name}
          </p>
        </div>
      </div>

      {/* Tabbed Interface */}
      <Tabs defaultValue="live-stats" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3 bg-slate-900/50 border border-slate-700/50 rounded-lg text-xs sm:text-sm">
          <TabsTrigger 
            value="live-stats"
            className="data-[state=active]:bg-neon-purple data-[state=active]:text-slate-900 text-gray-300 hover:text-white transition-colors"
          >
            Live Stats
          </TabsTrigger>
          <TabsTrigger 
            value="match-history"
            className="data-[state=active]:bg-neon-blue data-[state=active]:text-slate-900 text-gray-300 hover:text-white transition-colors"
          >
            Match History
          </TabsTrigger>
          <TabsTrigger 
            value="game-rules"
            className="data-[state=active]:bg-neon-purple data-[state=active]:text-slate-900 text-gray-300 hover:text-white transition-colors"
          >
            Game Rules
          </TabsTrigger>
        </TabsList>

        {/* Live Stats Tab */}
        <TabsContent value="live-stats" className="flex-1 overflow-auto">
          <LiveStats />
        </TabsContent>

        {/* Match History Tab */}
        <TabsContent value="match-history" className="flex-1">
          <Card className="bg-slate-900/50 border-slate-700/50 h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-neon-purple">Match History</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex items-center justify-center">
              <p className="text-gray-400 text-center">
                Previous encounters and historical data will appear here as matches are played.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Game Rules Tab */}
        <TabsContent value="game-rules" className="flex-1">
          <Card className="bg-slate-900/50 border-slate-700/50 h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-neon-blue">Game Rules</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-300 text-sm space-y-3 overflow-auto">
              <div>
                <h4 className="font-semibold text-white mb-1">Objective</h4>
                <p>Defeat your opponent by reducing their health to zero or achieving victory conditions.</p>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-1">Resource Management</h4>
                <p>Manage your resources strategically. Once depleted, recovery takes time.</p>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-1">Scoring</h4>
                <p>Each successful action grants points. Higher scores unlock special abilities.</p>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-1">Betting Rules</h4>
                <p>Bets are locked when the match begins. Payouts calculated based on final odds.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function MatchSpectator() {
  return (
    <Suspense fallback={<div className="w-full aspect-video flex items-center justify-center bg-slate-900 rounded-lg">Loading...</div>}>
      <MatchSpectatorContent />
    </Suspense>
  );
}
