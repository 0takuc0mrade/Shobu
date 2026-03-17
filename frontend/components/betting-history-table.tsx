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

interface BettingRecord {
  id: string;
  match: string;
  date: string;
  outcome: string;
  wager: number;
  odds: number;
  status: 'won' | 'lost' | 'pending';
  potential?: number;
}

const mockBettingData: BettingRecord[] = [
  {
    id: '1',
    match: 'Nexus vs Vortex',
    date: '2024-03-15 14:32',
    outcome: 'Nexus Victory',
    wager: 500,
    odds: 1.85,
    status: 'won',
  },
  {
    id: '2',
    match: 'Cipher vs Echo',
    date: '2024-03-15 12:18',
    outcome: 'Cipher Victory',
    wager: 750,
    odds: 2.15,
    status: 'won',
  },
  {
    id: '3',
    match: 'Apex vs Storm',
    date: '2024-03-15 10:45',
    outcome: 'Storm Victory',
    wager: 1000,
    odds: 1.95,
    status: 'lost',
  },
  {
    id: '4',
    match: 'Inferno vs Frostbyte',
    date: '2024-03-15 09:22',
    outcome: 'Inferno Victory',
    wager: 600,
    odds: 2.45,
    status: 'pending',
    potential: 1470,
  },
  {
    id: '5',
    match: 'Phantom vs Nexus',
    date: '2024-03-14 20:15',
    outcome: 'Nexus Victory',
    wager: 800,
    odds: 1.65,
    status: 'won',
  },
  {
    id: '6',
    match: 'Blaze vs Titan',
    date: '2024-03-14 18:30',
    outcome: 'Titan Victory',
    wager: 450,
    odds: 3.25,
    status: 'lost',
  },
  {
    id: '7',
    match: 'Nexus vs Blaze',
    date: '2024-03-14 16:45',
    outcome: 'Nexus Victory',
    wager: 1200,
    odds: 1.55,
    status: 'pending',
    potential: 1860,
  },
  {
    id: '8',
    match: 'Cipher vs Phantom',
    date: '2024-03-14 14:20',
    outcome: 'Cipher Victory',
    wager: 300,
    odds: 2.85,
    status: 'won',
  },
];

export function BettingHistoryTable() {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      won: { color: 'bg-chart-3/10 text-chart-3 border-chart-3/50', text: 'Won' },
      lost: { color: 'bg-red-500/10 text-red-400 border-red-500/50', text: 'Lost' },
      pending: { color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/50', text: 'Pending' },
    };
    return statusMap[status] || statusMap.pending;
  };

  const filteredData = statusFilter === 'all'
    ? mockBettingData
    : statusFilter === 'active'
    ? mockBettingData.filter((d) => d.status === 'pending')
    : mockBettingData.filter((d) => d.status !== 'pending');

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
              filteredData.map((record) => {
                const statusDisplay = getStatusDisplay(record.status);
                const payout = record.wager * record.odds;
                const profit = payout - record.wager;

                return (
                  <TableRow
                    key={record.id}
                    className="border-slate-700/50 hover:bg-slate-dark/50 transition-colors"
                  >
                    <TableCell className="font-medium text-foreground">{record.match}</TableCell>
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
                            {record.potential} STRK potential
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
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
