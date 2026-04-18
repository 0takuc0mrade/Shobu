'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter } from 'lucide-react';
import { useUserBets, useAllBettingPools } from '@/hooks/use-dojo-betting';
import { useStarkSdk } from '@/providers/stark-sdk-provider';
import { formatUnits } from '@/lib/token-utils';
import { sameAddress } from '@/lib/address-utils';
import { web3Config } from '@/lib/web3-config';
import { useMatchName } from '@/hooks/use-match-name';
import { Skeleton } from '@/components/ui/skeleton';
import { useClaimRefund } from '@/hooks/use-betting-actions';

interface BettingRecord {
  id: string;
  match: string;
  date: string;
  outcome: string;
  wager: number;
  odds: number;
  status: 'won' | 'lost' | 'pending' | 'cancelled';
  potential?: number;
  pool_id: string;
  game_id: string;
  settlement_mode: string;
}

function BetHistoryRow({ record }: { record: BettingRecord }) {
  const { refund, status: refundStatus } = useClaimRefund();

  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      won: { color: 'bg-chart-3/10 text-chart-3 border-chart-3/50', text: 'Won' },
      lost: { color: 'bg-red-500/10 text-red-400 border-red-500/50', text: 'Lost' },
      pending: { color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/50', text: 'Pending' },
      cancelled: { color: 'bg-gray-500/10 text-gray-400 border-gray-500/50', text: 'Cancelled' },
    };
    return statusMap[status] || statusMap.pending;
  };

  const statusDisplay = getStatusDisplay(record.status);
  const payout = record.wager * record.odds;
  const profit = payout - record.wager;

  // Utilize the custom OpenServ hook
  const { matchName, loading } = useMatchName(record.pool_id, record.game_id, record.settlement_mode);

  return (
    <TableRow className="border-slate-700/50 hover:bg-slate-dark/50 transition-colors">
      <TableCell className="font-medium text-foreground">
        {loading ? (
          <Skeleton className="h-5 w-40 bg-neon-purple/20 animate-pulse rounded" />
        ) : (
          matchName || record.match
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{record.date}</TableCell>
      <TableCell className="text-foreground">{record.outcome}</TableCell>
      <TableCell className="text-right text-foreground">
        {record.wager.toLocaleString()} STRK
      </TableCell>
      <TableCell className="text-right text-neon-purple font-semibold">
        {record.odds.toFixed(2)}x
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Badge
            className={`${statusDisplay.color} border`}
            variant="outline"
          >
            {statusDisplay.text}
          </Badge>
          {record.status === 'won' && (
            <span className="text-xs font-semibold" style={{ color: '#10b981' }}>
              +{profit.toLocaleString()} STRK
            </span>
          )}
          {record.status === 'pending' && (
            <span className="text-xs font-semibold text-yellow-400">
              {record.potential?.toFixed(2)} STRK potential
            </span>
          )}
          {record.status === 'cancelled' && (
            <button 
              className="ml-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs text-white"
              onClick={() => refund({ poolId: Number(record.pool_id) })}
              disabled={refundStatus === 'submitting'}
            >
              {refundStatus === 'submitting' ? 'Claiming...' : 'Claim Refund'}
            </button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}



export function BettingHistoryTable() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { wallet } = useStarkSdk();
  const address = wallet?.account?.address;
  const { bets } = useUserBets(address);
  const { pools } = useAllBettingPools();

  const poolMap = new Map(pools.map((p) => [Number(p.pool_id), p]));

  const realBettingData: BettingRecord[] = bets.map((bet) => {
    const pool = poolMap.get(Number(bet.pool_id));
    const wager = Number(formatUnits(BigInt(bet.amount || '0'), web3Config.tokens.strk.decimals));

    let matchName = `Pool #${bet.pool_id || '?'}`;
    let outcomeStr = 'Unknown';
    let betStatus: 'won' | 'lost' | 'pending' = 'pending';
    let odds = 1.0;

    if (pool) {
      if (pool.game_id && Number(pool.game_id) > 0) {
        matchName = `Game #${pool.game_id} (Pool #${bet.pool_id})`;
      }

      const isP1 = sameAddress(bet.predicted_winner, pool.player_1);
      outcomeStr = isP1 ? 'Player 1' : 'Player 2';

      const totalPot = Number(formatUnits(BigInt(pool.total_pot || '0'), web3Config.tokens.strk.decimals));
      const totalOnSide = isP1
        ? Number(formatUnits(BigInt(pool.total_on_p1 || '0'), web3Config.tokens.strk.decimals))
        : Number(formatUnits(BigInt(pool.total_on_p2 || '0'), web3Config.tokens.strk.decimals));

      if (totalOnSide > 0) {
        odds = totalPot / totalOnSide;
      }

      if (Number(pool.status) === 1) { // Settled
        if (sameAddress(bet.predicted_winner, pool.winning_player)) {
          betStatus = 'won';
        } else {
          betStatus = 'lost';
        }
      } else if (Number(pool.status) === 2) {
        // Cancelled
        betStatus = 'cancelled' as any;
      }
    }

    let dateStr = 'Unknown';
    if (bet.placed_at) {
      // Hex to int, placed_at is usually a hex timestamp
      let timestamp = 0;
      if (typeof bet.placed_at === 'string' && bet.placed_at.startsWith('0x')) {
        timestamp = parseInt(bet.placed_at, 16) * 1000;
      } else {
        timestamp = Number(bet.placed_at) * 1000;
      }
      
      const d = new Date(timestamp);
      if (!isNaN(d.getTime())) {
        dateStr = d.toISOString().replace('T', ' ').substring(0, 16);
      }
    }

    return {
      id: `${bet.pool_id}-${bet.bettor}-${bet.placed_at}`,
      match: matchName,
      date: dateStr,
      outcome: outcomeStr,
      wager,
      odds,
      status: betStatus,
      potential: wager * odds,
      pool_id: bet.pool_id || '0',
      game_id: pool?.game_id || '0',
      settlement_mode: pool?.settlement_mode || 'unknown',
    };
  }).sort((a, b) => b.date.localeCompare(a.date));

  const filteredData = statusFilter === 'all'
    ? realBettingData
    : statusFilter === 'active'
    ? realBettingData.filter((d) => d.status === 'pending')
    : realBettingData.filter((d) => d.status !== 'pending');

  return (
    <Card className="card-border bg-slate-mid/40 backdrop-blur">
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Betting History</h2>
            <p className="text-sm text-muted-foreground mt-1">View all your completed and active bets</p>
          </div>

          {/* Filter Dropdown */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40 bg-slate-dark border-slate-700/50 text-foreground hover:border-neon-purple/50">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent className="bg-slate-dark border-slate-700/50">
                <SelectItem value="all" className="text-foreground">
                  All Bets
                </SelectItem>
                <SelectItem value="active" className="text-foreground">
                  Active
                </SelectItem>
                <SelectItem value="completed" className="text-foreground">
                  Completed
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700/50 hover:bg-slate-dark/50">
              <TableHead className="text-muted-foreground">Match</TableHead>
              <TableHead className="text-muted-foreground">Date</TableHead>
              <TableHead className="text-muted-foreground">Outcome Predicted</TableHead>
              <TableHead className="text-muted-foreground text-right">Wager</TableHead>
              <TableHead className="text-muted-foreground text-right">Odds</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length > 0 ? (
              filteredData.map((record) => (
                <BetHistoryRow key={record.id} record={record} />
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No bets found for the selected filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer Stats */}
      <div className="p-6 border-t border-slate-700/50 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Total Bets</p>
          <p className="text-lg font-semibold text-foreground">{filteredData.length}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
          <p className="text-lg font-semibold" style={{ color: '#10b981' }}>
            {filteredData.length > 0
              ? (
                  ((filteredData.filter((d) => d.status === 'won').length / filteredData.length) *
                    100).toFixed(1)
                )
              : 0}
            %
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Total Wagered</p>
          <p className="text-lg font-semibold text-foreground">
            {filteredData
              .reduce((sum, d) => sum + d.wager, 0)
              .toLocaleString()}{' '}
            STRK
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Net Profit</p>
          <p className="text-lg font-semibold text-neon-purple">
            +
            {filteredData
              .filter((d) => d.status === 'won')
              .reduce((sum, d) => sum + d.wager * (d.odds - 1), 0)
              .toLocaleString()}{' '}
            STRK
          </p>
        </div>
      </div>
    </Card>
  );
}
