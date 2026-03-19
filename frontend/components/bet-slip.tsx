'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePlaceBet } from '@/hooks/use-betting-actions';
import { normalizeAddress, web3Config, getTokenByAddress, supportedTokens } from '@/lib/web3-config';

interface BetSlipProps {
  selectedPlayer: 'playerA' | 'playerB' | null;
  odds: number;
  poolId: number;
  pool?: {
    player_1?: string;
    player_2?: string;
    token?: string;
  } | null;
}

export function BetSlip({ selectedPlayer, odds, poolId, pool }: BetSlipProps) {
  const [betAmount, setBetAmount] = useState('100');
  const poolToken = useMemo(() => {
    if (!pool?.token) return web3Config.tokens.strk;
    return getTokenByAddress(pool.token);
  }, [pool?.token]);

  const { placeBet, status: placeStatus, error: placeError } = usePlaceBet();

  const maxBet = 10000; // simplified
  const amount = parseFloat(betAmount) || 0;
  const potentialPayout = (amount * odds).toFixed(2);
  const profit = (amount * (odds - 1)).toFixed(2);
  const isPlacing = placeStatus === 'submitting';

  const predictedWinner = useMemo(() => {
    if (!selectedPlayer) return undefined;
    return selectedPlayer === 'playerA' ? pool?.player_1 : pool?.player_2;
  }, [selectedPlayer, pool?.player_1, pool?.player_2]);

  const handleMaxClick = () => {
    setBetAmount(maxBet.toString());
  };

  const handlePlaceBet = async () => {
    if (!selectedPlayer || amount <= 0 || !predictedWinner) return;
    await placeBet({
      poolId,
      predictedWinner,
      amount: betAmount,
      tokenAddress: poolToken.address,
    });
    setBetAmount('100');
  };

  const playerName = selectedPlayer === 'playerA' ? 'Champion (Player A)' : 'Challenger (Player B)';
  const playerColor = selectedPlayer === 'playerA' ? 'text-neon-purple' : 'text-neon-blue';

  return (
    <Card className="card-border bg-slate-900/50 border-slate-700/50 flex flex-col h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-neon-purple">Bet Slip</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        {/* Selected Player Display */}
        {selectedPlayer ? (
          <div className={`p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 ${playerColor}`}>
            <p className="text-xs text-gray-400 mb-1">Selected Bet</p>
            <p className="font-semibold">{playerName}</p>
            <p className="text-sm mt-1">{odds.toFixed(2)}x odds</p>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-slate-800/50 border border-dashed border-slate-700 text-gray-500 text-center text-sm">
            Select a player to place a bet
          </div>
        )}

        {/* Currency Display */}
        <div className="flex justify-between items-center p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
          <span className="text-xs text-gray-400">Required Currency:</span>
          <span className="text-sm font-bold text-neon-blue">{poolToken.symbol}</span>
        </div>

        {/* Bet Amount Input */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 font-medium">
            Bet Amount ({poolToken.symbol})
          </label>
          <div className="relative">
            <Input
              type="number"
              min="0"
              max={maxBet}
              step="10"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              placeholder="Enter amount"
              disabled={!selectedPlayer}
              className="bg-slate-800 border-slate-700/50 text-white placeholder:text-gray-600 pr-12 disabled:opacity-50"
            />
            <button
              onClick={handleMaxClick}
              disabled={!selectedPlayer}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-neon-purple hover:text-neon-purple/80 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Payout Info */}
        <div className="space-y-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400">Stake</span>
            <span className="text-sm font-semibold text-white">
              {betAmount} {poolToken.symbol}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400">Odds</span>
            <span className="text-sm font-semibold text-neon-purple">
              {selectedPlayer ? odds.toFixed(2) : '—'}x
            </span>
          </div>
          <div className="border-t border-slate-700/50 pt-2 mt-2 flex justify-between items-center">
            <span className="text-xs font-medium text-gray-300">Potential Payout</span>
            <span className="text-lg font-bold text-neon-blue">
              {selectedPlayer ? `${potentialPayout} ${poolToken.symbol}` : '—'}
            </span>
          </div>
          {selectedPlayer && amount > 0 && (
            <div className="flex justify-between items-center text-xs text-neon-purple">
              <span>Net Profit</span>
              <span>+{profit} {poolToken.symbol}</span>
            </div>
          )}
        </div>

        {/* Place Bet Button */}
        <Button
          onClick={handlePlaceBet}
          disabled={!selectedPlayer || amount <= 0 || isPlacing}
          className="w-full mt-auto bg-gradient-to-r from-neon-purple to-neon-blue text-slate-900 font-bold py-6 text-base rounded-lg hover:shadow-lg hover:shadow-neon-purple/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPlacing ? (
            <span className="flex items-center gap-2">
              <span className="inline-block animate-spin">⟳</span>
              Placing Bet...
            </span>
          ) : (
            'Place Bet'
          )}
        </Button>

        {/* Session Keys Note */}
        <p className="text-xs text-gray-500 text-center mt-2">
          Gasless transaction via Cartridge Session Keys
        </p>

        {placeError && (
          <p className="text-xs text-red-400 text-center mt-2">{placeError}</p>
        )}
      </CardContent>
    </Card>
  );
}
