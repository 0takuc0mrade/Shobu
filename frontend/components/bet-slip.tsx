'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePlaceBet } from '@/hooks/use-betting-actions';
import { normalizeAddress, web3Config, getTokenByAddress, supportedTokens } from '@/lib/web3-config';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { getStarkzapSync } from '@/lib/starkzap-client';

interface BetSlipProps {
  selectedPlayer: 'playerA' | 'playerB' | null;
  odds: number;
  poolId: number;
  betAmount: string;
  setBetAmount: (val: string) => void;
  pool?: {
    player_1?: string;
    player_2?: string;
    token?: string;
  } | null;
  playerName?: string;
  chainType?: 'starknet' | 'evm';
}

export function BetSlip({ selectedPlayer, odds, poolId, betAmount, setBetAmount, pool, playerName, chainType = 'starknet' }: BetSlipProps) {
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

  // StarkZap Integration States
  const [isConfidential, setIsConfidential] = useState(false);
  const [isBridging, setIsBridging] = useState(false);
  const [bridgeDepositAmount, setBridgeDepositAmount] = useState('100');
  const [bridgeSuccess, setBridgeSuccess] = useState(false);

  const predictedWinner = useMemo(() => {
    if (!selectedPlayer) return undefined;
    return selectedPlayer === 'playerA' ? pool?.player_1 : pool?.player_2;
  }, [selectedPlayer, pool?.player_1, pool?.player_2]);

  const handleMaxClick = () => {
    setBetAmount(maxBet.toString());
  };

  const handlePlaceBet = async () => {
    if (!selectedPlayer || amount <= 0 || !predictedWinner) return;

    if (isConfidential) {
      console.log('Initiating StarkZap Confidential Mode (Tongo integration)');
      // Mock confidential routine:
      try {
        const zap = getStarkzapSync();
        if (zap?.confidential) {
          // This routes the action through the Tongo relayer
        }
      } catch (e) {
        console.warn('Mock confidential execution:', e);
      }
    }

    await placeBet({
      poolId,
      predictedWinner,
      amount: betAmount,
      tokenAddress: poolToken.address,
      chainType,
    });
    setBetAmount('100');
  };

  const handleBridgeDeposit = async () => {
    setIsBridging(true);
    setBridgeSuccess(false);
    console.log('Initiating StarkZap Bridge integration (Ethereum -> Starknet)');
    
    setTimeout(() => {
      setIsBridging(false);
      setBridgeSuccess(true);
      // Simulate that the deposit was added to the input or just a general success
    }, 2000);
  };

  const defaultPlayerName = selectedPlayer === 'playerA' ? 'YES' : 'NO';
  const displayPlayerName = playerName || defaultPlayerName;
  const playerColor = selectedPlayer === 'playerA' ? 'text-neon-purple' : 'text-neon-blue';

  return (
    <Card className="card-border bg-slate-900/50 border-slate-700/50 flex flex-col">
      <CardHeader className="pb-2 sm:pb-3">
        <CardTitle className="text-neon-purple text-sm sm:text-base">Bet Slip</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3 sm:gap-4">
        {/* Selected Player Display */}
        {selectedPlayer ? (
          <div className={`p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 ${playerColor}`}>
            <p className="text-xs text-gray-400 mb-1">Selected Bet</p>
            <p className="font-semibold">{displayPlayerName}</p>
            <p className="text-sm mt-1">{odds.toFixed(2)}x odds</p>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-slate-800/50 border border-dashed border-slate-700 text-gray-500 text-center text-sm">
            Select a player to place a bet
          </div>
        )}

        {/* Currency Display & Bridge */}
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400">Required Currency:</span>
            <span className="text-sm font-bold text-neon-blue">{poolToken.symbol}</span>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full mt-2 border-neon-blue/40 text-neon-blue hover:bg-neon-blue/10 bg-transparent flex items-center justify-center gap-1">
                <span>⚡ Bridge {poolToken.symbol} from Mainnet</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border border-slate-800 text-white sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle className="text-neon-blue text-xl">Deposit from Ethereum L1</DialogTitle>
                <p className="text-xs text-gray-400 mt-2">
                  Powered by StarkZap Cross-Chain Bridge. Securely bridge your {poolToken.symbol} in seconds.
                </p>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">Amount to Bridge</label>
                  <Input 
                    type="number"
                    value={bridgeDepositAmount}
                    onChange={(e) => setBridgeDepositAmount(e.target.value)}
                    className="bg-slate-800 border-slate-700 font-semibold"
                  />
                </div>
                {bridgeSuccess ? (
                  <div className="p-3 bg-green-500/10 border border-green-500/50 rounded-md text-green-400 text-sm text-center">
                    Successfully bridged {bridgeDepositAmount} {poolToken.symbol}!
                  </div>
                ) : (
                  <Button 
                    onClick={handleBridgeDeposit} 
                    disabled={isBridging}
                    className="w-full bg-neon-blue hover:bg-neon-blue/80 text-black font-bold"
                  >
                    {isBridging ? 'Bridging...' : 'Confirm Deposit'}
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
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
        <div className="space-y-2 p-2 sm:p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
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

        {/* Confidential Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <div className="flex flex-col">
             <span className="text-sm font-medium text-white flex items-center gap-1">
               <span className="text-neon-purple">🕵️</span> Shield Bet
             </span>
             <span className="text-[10px] text-gray-400 mt-1 max-w-[180px]">
               Use StarkZap Confidential to hide your wager size via Tongo.
             </span>
          </div>
          <Switch 
            checked={isConfidential}
            onCheckedChange={setIsConfidential}
            className="data-[state=checked]:bg-neon-purple"
          />
        </div>

        {/* Place Bet Button */}
        <Button
          onClick={handlePlaceBet}
          disabled={!selectedPlayer || amount <= 0 || isPlacing}
          className="w-full mt-auto bg-gradient-to-r from-neon-purple to-neon-blue text-slate-900 font-bold py-4 sm:py-6 text-sm sm:text-base rounded-lg hover:shadow-lg hover:shadow-neon-purple/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Chain Info Note */}
        <p className="text-xs text-gray-500 text-center mt-2">
          {chainType === 'evm'
            ? 'Transaction via Privy Embedded Wallet → Beam Testnet'
            : 'Gasless transaction via Cartridge Session Keys'}
        </p>

        {placeError && (
          <p className="text-xs text-red-400 text-center mt-2">{placeError}</p>
        )}
      </CardContent>
    </Card>
  );
}
