'use client';

import { useMemo, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useSearchParams } from 'next/navigation';
import { useBettingPool, useDenshokanConfig, usePoolOdds } from '@/hooks/use-dojo-betting';
import { useEgsTokenStats } from '@/hooks/use-egs-stats';
import { useEgs } from '@/providers/egs-provider';
import { web3Config } from '@/lib/web3-config';
import { normalizeAddress } from '@/lib/address-utils';

function LiveStatsContent() {
  const searchParams = useSearchParams();
  const poolIdParam = searchParams.get('poolId');
  const poolId = poolIdParam ? parseInt(poolIdParam, 10) : web3Config.activePoolId;
  const { data: pool } = useBettingPool(poolId);
  const odds = usePoolOdds(poolId);
  const { data: denshokanConfig } = useDenshokanConfig();
  const { eventsByWorld } = useEgs();

  const egsToken = denshokanConfig?.token_contract;
  const egsP1 = useEgsTokenStats(egsToken, pool?.egs_token_id_p1);
  const egsP2 = useEgsTokenStats(egsToken, pool?.egs_token_id_p2);
  const worldKey = pool?.game_world ? normalizeAddress(pool.game_world) : '';
  const worldEvents = worldKey
    ? eventsByWorld[worldKey] ?? []
    : [];
  const liveEventCount = pool?.game_id
    ? worldEvents.filter((event) => event.gameId === Number(pool.game_id)).length
    : worldEvents.length;

  const totals = useMemo(() => {
    const totalPot = Number(pool?.total_pot ?? 0);
    const totalOnP1 = Number(pool?.total_on_p1 ?? 0);
    const totalOnP2 = Number(pool?.total_on_p2 ?? 0);
    const shareP1 = totalPot > 0 ? (totalOnP1 / totalPot) * 100 : 0;
    const shareP2 = totalPot > 0 ? (totalOnP2 / totalPot) * 100 : 0;
    return { totalPot, totalOnP1, totalOnP2, shareP1, shareP2 };
  }, [pool?.total_pot, pool?.total_on_p1, pool?.total_on_p2]);

  const playerA = useMemo(
    () => ({
      health: odds.impliedP1 ? odds.impliedP1 / 100 : 0,
      resources: totals.shareP1,
      kills: liveEventCount,
      score: egsP1.score || totals.totalOnP1,
    }),
    [odds.impliedP1, totals.shareP1, totals.totalOnP1, liveEventCount, egsP1.score]
  );

  const playerB = useMemo(
    () => ({
      health: odds.impliedP2 ? odds.impliedP2 / 100 : 0,
      resources: totals.shareP2,
      kills: liveEventCount,
      score: egsP2.score || totals.totalOnP2,
    }),
    [odds.impliedP2, totals.shareP2, totals.totalOnP2, liveEventCount, egsP2.score]
  );

  const formatScore = (val: number) => {
    if (!val) return "0";
    const inTokens = val / 1e18;
    return new Intl.NumberFormat('en-US', {
      notation: "compact",
      maximumFractionDigits: 2
    }).format(inTokens);
  };

  const StatCard = ({ 
    title, 
    player, 
    stats, 
    accentColor 
  }: { 
    title: string; 
    player: string; 
    stats: typeof playerA;
    accentColor: string;
  }) => (
    <Card className="bg-slate-900/50 border-slate-700/50 flex flex-col">
      <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-3">
        <CardTitle className={`text-xs sm:text-sm font-semibold ${accentColor}`}>{title}</CardTitle>
        <p className="text-[10px] sm:text-xs text-gray-400">{player}</p>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 space-y-3 sm:space-y-4">
        {/* Health Bar */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-medium text-gray-300">Health</span>
            <span className="text-xs font-bold text-neon-purple">{Math.round(stats.health)}%</span>
          </div>
          <Progress 
            value={stats.health} 
            className="h-2 bg-slate-800"
          />
        </div>

        {/* Resources Bar */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-medium text-gray-300">Resources</span>
            <span className="text-xs font-bold text-neon-blue">{Math.round(stats.resources)}%</span>
          </div>
          <Progress 
            value={stats.resources} 
            className="h-2 bg-slate-800"
          />
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700/50">
          <div className="space-y-1 min-w-0">
            <p className="text-[10px] sm:text-xs text-gray-400">Kills</p>
            <p className={`text-base sm:text-lg font-bold truncate ${accentColor}`}>{stats.kills}</p>
          </div>
          <div className="space-y-1 min-w-0">
            <p className="text-[10px] sm:text-xs text-gray-400">Score</p>
            <p className={`text-base sm:text-lg font-bold truncate ${accentColor}`} title={stats.score.toString()}>{formatScore(stats.score)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 h-full">
      <StatCard 
        title="Player A - Champion"
        player="@PlayerA_Champion"
        stats={playerA}
        accentColor="text-neon-purple"
      />
      <StatCard 
        title="Player B - Challenger"
        player="@PlayerB_Challenger"
        stats={playerB}
        accentColor="text-neon-blue"
      />
    </div>
  );
}

export function LiveStats() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Loading stats...</div>}>
      <LiveStatsContent />
    </Suspense>
  );
}
