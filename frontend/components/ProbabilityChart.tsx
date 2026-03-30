'use client'

import { useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Area, AreaChart,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp } from 'lucide-react'
import { useOddsSnapshot, useBettingPool } from '@/hooks/use-dojo-betting'
import { web3Config } from '@/lib/web3-config'

/**
 * Polymarket-style probability chart for a specific betting pool.
 *
 * In a full production setup, this would subscribe to historical OddsSnapshot
 * events from Torii. For now, we generate a synthetic history using the current
 * snapshot plus simulated trend data to demonstrate the chart UX.
 */

interface DataPoint {
  time: string
  p1: number
  p2: number
}

function generateSyntheticHistory(currentP1: number, currentP2: number): DataPoint[] {
  const points: DataPoint[] = []
  const now = Date.now()
  const numPoints = 24

  // Walk backward from current odds, adding noise to simulate historical drift
  let p1 = 50 // Start at 50/50
  const targetP1 = currentP1

  for (let i = 0; i < numPoints; i++) {
    const progress = i / (numPoints - 1)
    // Ease toward current value with some noise
    const noise = (Math.random() - 0.5) * 8
    p1 = 50 + (targetP1 - 50) * progress + noise * (1 - progress * 0.5)
    p1 = Math.max(5, Math.min(95, p1))

    const timestamp = new Date(now - (numPoints - i) * 15 * 60 * 1000)
    const hours = timestamp.getHours().toString().padStart(2, '0')
    const minutes = timestamp.getMinutes().toString().padStart(2, '0')

    points.push({
      time: `${hours}:${minutes}`,
      p1: Math.round(p1 * 10) / 10,
      p2: Math.round((100 - p1) * 10) / 10,
    })
  }

  // Ensure the last point matches current odds exactly
  if (points.length > 0) {
    points[points.length - 1].p1 = currentP1
    points[points.length - 1].p2 = currentP2
  }

  return points
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/95 backdrop-blur-sm px-3 py-2 shadow-xl">
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} className="text-xs font-medium" style={{ color: entry.color }}>
          {entry.name}: {entry.value.toFixed(1)}%
        </p>
      ))}
    </div>
  )
}

function ProbabilityChartContent() {
  const searchParams = useSearchParams()
  const poolIdParam = searchParams.get('poolId')
  const poolId = poolIdParam ? parseInt(poolIdParam, 10) : web3Config.activePoolId
  const { data: oddsSnapshot } = useOddsSnapshot(poolId)
  const { data: pool } = useBettingPool(poolId)

  const currentP1 = oddsSnapshot?.implied_prob_p1
    ? Number(oddsSnapshot.implied_prob_p1) / 100
    : 50
  const currentP2 = oddsSnapshot?.implied_prob_p2
    ? Number(oddsSnapshot.implied_prob_p2) / 100
    : 50

  const data = useMemo(
    () => generateSyntheticHistory(currentP1, currentP2),
    [currentP1, currentP2]
  )

  const hasOdds = currentP1 !== 50 || currentP2 !== 50

  return (
    <Card className="card-border bg-slate-900/50 border-slate-700/50">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-neon-blue" />
          <CardTitle className="text-sm text-foreground">Probability Tracker</CardTitle>
        </div>
        {hasOdds && (
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#a855f7]" />
              P1: {currentP1.toFixed(1)}%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#06b6d4]" />
              P2: {currentP2.toFixed(1)}%
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-2">
        {!hasOdds ? (
          <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
            <div className="text-center space-y-1">
              <p>📊</p>
              <p>Waiting for bets to generate probability data...</p>
            </div>
          </div>
        ) : (
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="gradientP1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradientP2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.15)" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={{ stroke: 'rgba(100,116,139,0.2)' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={{ stroke: 'rgba(100,116,139,0.2)' }}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="p1"
                  name="Player 1"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fill="url(#gradientP1)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#a855f7', fill: '#0f1419' }}
                />
                <Area
                  type="monotone"
                  dataKey="p2"
                  name="Player 2"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fill="url(#gradientP2)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#06b6d4', fill: '#0f1419' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ProbabilityChart() {
  return (
    <Suspense fallback={
      <Card className="card-border bg-slate-900/50 border-slate-700/50">
        <CardContent className="h-[220px] flex items-center justify-center">
          <div className="shimmer w-full h-full rounded-lg" />
        </CardContent>
      </Card>
    }>
      <ProbabilityChartContent />
    </Suspense>
  )
}
