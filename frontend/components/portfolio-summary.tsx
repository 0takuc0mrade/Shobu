'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, Wallet, Trophy } from 'lucide-react';
import { useClaimWinnings } from '@/hooks/use-betting-actions';
import { web3Config, supportedTokens } from '@/lib/web3-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUserBets, useAllBettingPools } from '@/hooks/use-dojo-betting';
import { useStarkSdk } from '@/providers/stark-sdk-provider';
import { formatUnits } from '@/lib/token-utils';
import { sameAddress } from '@/lib/address-utils';

export function PortfolioSummary() {
  const { wallet } = useStarkSdk();
  const address = wallet?.account?.address;
  const { bets } = useUserBets(address);
  const { pools } = useAllBettingPools();

  let totalWagered = 0;
  let totalWon = 0;
  let claimableWinnings = 0;

  const poolMap = new Map(pools.map(p => [Number(p.pool_id), p]));

  bets.forEach((bet) => {
    const amount = Number(formatUnits(BigInt(bet.amount || '0'), web3Config.tokens.strk.decimals));
    totalWagered += amount;

    const pool = poolMap.get(Number(bet.pool_id));
    if (pool && Number(pool.status) === 1) { // 1 = settled
      if (sameAddress(bet.predicted_winner, pool.winning_player)) {
        const isP1 = sameAddress(pool.winning_player, pool.player_1);
        const totalOnWinner = isP1 ? BigInt(pool.total_on_p1 || '1') : BigInt(pool.total_on_p2 || '1');
        const betAmt = BigInt(bet.amount || '0');
        const distAmt = BigInt(pool.distributable_amount || '0');
        
        if (totalOnWinner > 0n) {
          const payoutWei = (betAmt * distAmt) / totalOnWinner;
          const payout = Number(formatUnits(payoutWei, web3Config.tokens.strk.decimals));
          totalWon += payout;
          if (!bet.claimed) {
            claimableWinnings += payout;
          }
        }
      }
    }
  });

  const { claim, status: claimStatus, error: claimError } = useClaimWinnings();
  const [payoutToken, setPayoutToken] = useState(web3Config.tokens.strk.address);
  // Track if a swap attempt failed to show the fallback button
  const [swapFailed, setSwapFailed] = useState(false);

  const handleClaimAll = async (overrideToken?: string) => {
    setSwapFailed(false);
    const targetToken = overrideToken || payoutToken;
    const isSwap = targetToken !== web3Config.tokens.strk.address;

    try {
      await claim({
        poolId: web3Config.activePoolId,
        amount: claimableWinnings.toString(),
        poolTokenAddress: web3Config.tokens.strk.address,
        payoutTokenAddress: targetToken
      });
      // The hook doesn't throw on error, it sets claimStatus to 'error' and updates claimError
    } catch {
      if (isSwap) setSwapFailed(true);
    }
  };

  // React to hook's error state since claim() catches its own errors
  useEffect(() => {
    if (claimStatus === 'error' && payoutToken !== web3Config.tokens.strk.address) {
      setSwapFailed(true);
    }
  }, [claimStatus, payoutToken]);

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
          {claimableWinnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} STRK
        </p>
        
        <div className="mt-4 space-y-2">
          <label className="text-xs text-gray-400 font-medium">Receive As:</label>
          <Select value={payoutToken} onValueChange={setPayoutToken}>
            <SelectTrigger className="w-full bg-slate-800 border-slate-700/50 text-white">
              <SelectValue placeholder="Select token" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700/50">
              {supportedTokens.map((t) => (
                <SelectItem key={t.id} value={t.address} className="text-white hover:bg-slate-700 focus:bg-slate-700">
                  {t.symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          onClick={() => handleClaimAll()}
          disabled={claimStatus === 'submitting'}
          className="mt-4 w-full px-4 py-2 rounded-lg bg-gradient-to-r from-chart-3 to-chart-3/80 text-slate-dark font-semibold hover:from-chart-3/80 hover:to-chart-3/60 transition-all duration-300 shadow-lg hover:shadow-chart-3/50"
          style={{
            boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)',
          }}
        >
          {claimStatus === 'submitting' ? 'Claiming...' : 'Claim All'}
        </button>

        {swapFailed && (
          <button
            onClick={() => {
              setPayoutToken(web3Config.tokens.strk.address);
              handleClaimAll(web3Config.tokens.strk.address);
            }}
            disabled={claimStatus === 'submitting'}
            className="mt-3 w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 font-semibold hover:bg-slate-700 hover:text-white transition-all duration-300 shadow-sm"
          >
            Claim Original Token (STRK)
          </button>
        )}

        {claimError && (
          <div className="mt-3 p-3 rounded-md bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-400 text-center font-medium">{claimError}</p>
            {swapFailed && (
              <p className="text-[10px] text-red-300/80 text-center mt-1">
                The atomic swap likely failed due to slippage or low liquidity. Try claiming the original token.
              </p>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3 text-center">Available to claim</p>
      </Card>
    </div>
  );
}
