'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BrainCircuit, RefreshCw } from 'lucide-react';

interface AnalystInsightCardProps {
  poolId: number;
  totalPot: number;
  totalP1: number;
  totalP2: number;
  oddsP1: number;
  oddsP2: number;
  p1Name: string;
  p2Name: string;
}

function generateInsight(props: AnalystInsightCardProps): string {
  const { totalPot, totalP1, totalP2, oddsP1, oddsP2, p1Name, p2Name } = props;

  if (totalPot === 0) {
    return `This market has no liquidity yet. Be the first to place a bet and set the opening odds.`;
  }

  const p1Pct = totalPot > 0 ? (totalP1 / totalPot) * 100 : 50;
  const p2Pct = totalPot > 0 ? (totalP2 / totalPot) * 100 : 50;
  const dominant = p1Pct > p2Pct ? p1Name : p2Name;
  const underdog = p1Pct > p2Pct ? p2Name : p1Name;
  const dominantPct = Math.max(p1Pct, p2Pct).toFixed(0);
  const underdogOdds = p1Pct > p2Pct ? oddsP2 : oddsP1;
  const spread = Math.abs(p1Pct - p2Pct);

  if (spread < 10) {
    return `Market is tightly contested — ${p1Name} holds ${p1Pct.toFixed(0)}% of liquidity vs ${p2Name} at ${p2Pct.toFixed(0)}%. Odds are nearly even, suggesting high uncertainty. Total pool: ${totalPot.toFixed(2)} STRK.`;
  }

  if (spread > 40) {
    return `Heavy imbalance detected: ${dominantPct}% of all bets are on ${dominant}. ${underdog} at ${underdogOdds.toFixed(2)}x represents a high-risk, high-reward contrarian play. Pool: ${totalPot.toFixed(2)} STRK.`;
  }

  return `Market liquidity favors ${dominant} (${dominantPct}% of pool). ${underdog} at ${underdogOdds.toFixed(2)}x offers a +${((underdogOdds - 1) * 100).toFixed(0)}% potential return. Total pool: ${totalPot.toFixed(2)} STRK.`;
}

export function AnalystInsightCard(props: AnalystInsightCardProps) {
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoInsight = useMemo(() => generateInsight(props), [
    props.totalPot, props.totalP1, props.totalP2,
    props.oddsP1, props.oddsP2, props.p1Name, props.p2Name,
  ]);

  const fetchDeepAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: props.poolId,
          message: `Analyze pool #${props.poolId}: ${props.p1Name} (${props.oddsP1.toFixed(2)}x) vs ${props.p2Name} (${props.oddsP2.toFixed(2)}x). Total pool: ${props.totalPot.toFixed(2)} STRK. P1 has ${props.totalP1.toFixed(2)} STRK, P2 has ${props.totalP2.toFixed(2)} STRK. Give a concise market insight.`,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setAiInsight(
          data.result?.output ??
          data.result?.message ??
          JSON.stringify(data.result)
        );
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to reach analyst');
    } finally {
      setLoading(false);
    }
  }, [props.poolId, props.totalPot, props.totalP1, props.totalP2, props.oddsP1, props.oddsP2, props.p1Name, props.p2Name]);

  const displayText = aiInsight ?? autoInsight;

  return (
    <Card className="card-border glass-card relative overflow-hidden group shrink-0">
      <div className="absolute inset-0 bg-gradient-to-r from-neon-purple/5 to-neon-blue/5 group-hover:from-neon-purple/10 group-hover:to-neon-blue/10 transition-colors duration-500" />
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-foreground">
          <BrainCircuit className="w-4 h-4 text-neon-purple" />
          Shobu Analyst AI
          <button
            onClick={fetchDeepAnalysis}
            disabled={loading}
            className="ml-auto flex items-center gap-1 text-[10px] font-medium text-neon-purple/70 hover:text-neon-purple transition-colors disabled:opacity-50"
            title="Get AI-powered deep analysis"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Analyzing…' : 'Deep Analysis'}
          </button>
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          {aiInsight ? 'AI Agent Insight' : 'Autonomous Market Insight'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-xs text-red-400 leading-relaxed">{error}</p>
        ) : (
          <p className="text-xs text-gray-300 leading-relaxed italic">
            &ldquo;{displayText}&rdquo;
          </p>
        )}
      </CardContent>
    </Card>
  );
}
