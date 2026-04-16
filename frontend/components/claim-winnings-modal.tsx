import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useClaimWinnings } from "@/hooks/use-betting-actions";
import { web3Config, getTokenByAddress } from "@/lib/web3-config";
import { resolveTokenSymbol, resolveTokenDecimals } from "@/lib/token-formatters";
import { formatUnits } from "@/lib/token-utils";
import { Loader2 } from "lucide-react";

export function ClaimWinningsModal({ 
  isOpen, 
  onClose, 
  pool, 
  userBetAmount,
  chainType
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  pool: any; 
  userBetAmount: string;
  chainType: 'starknet' | 'evm' | 'stellar';
}) {
  const { claim, status, error } = useClaimWinnings();
  const [payoutToken, setPayoutToken] = useState<string>("default");

  const poolTokenSymbol = resolveTokenSymbol(pool, chainType);
  const poolTokenDecimals = resolveTokenDecimals(pool, chainType);
  
  // Estimate payout
  const totalPot = BigInt(pool?.total_pot || "0");
  const winningTotal = BigInt(pool?.winning_total || pool?.total_on_p1 || "1");
  const betAmount = BigInt(userBetAmount || "0");
  const estimatedPayoutRaw = winningTotal > 0n ? (betAmount * totalPot) / winningTotal : 0n;
  const estimatedPayout = Number(formatUnits(estimatedPayoutRaw, poolTokenDecimals)).toFixed(2);

  const handleClaim = async () => {
    if (!pool?.pool_id) return;
    
    // Default token address is the pool's token, or the default STRK address if missing on Starknet
    const poolTokenAddress = pool.token || web3Config.tokens.strk.address;
    
    // If payoutToken is not 'default', use the selected token address for AVNU swap (Starknet only)
    const payoutTokenAddress = payoutToken === "default" ? poolTokenAddress : payoutToken;

    await claim({
      poolId: Number(pool.pool_id),
      amount: estimatedPayoutRaw.toString(), // amount of pool token expected
      poolTokenAddress,
      payoutTokenAddress,
      chainType
    });

    if (status !== 'error') {
      setTimeout(onClose, 2000); // Close after showing success for a bit
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-surface-container border-surface-container-low text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline tracking-widest uppercase text-primary">Claim Winnings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="bg-surface-container-lowest p-4 rounded-md border border-surface-container-highest">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-on-surface-variant">Pool #{pool?.pool_id}</span>
              <span className="text-emerald-400 font-bold">WON</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-on-surface-variant text-sm font-mono tracking-widest uppercase">Est. Payout</span>
              <span className="text-2xl font-bold font-headline">{estimatedPayout} <span className="text-sm font-normal text-primary">{poolTokenSymbol}</span></span>
            </div>
          </div>

          {chainType === 'starknet' && (
            <div className="space-y-3">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Receive as (via StarkZap)</label>
              <Select value={payoutToken} onValueChange={setPayoutToken}>
                <SelectTrigger className="w-full bg-surface-container-lowest border-surface-container-low text-white">
                  <SelectValue placeholder="Select payout token" />
                </SelectTrigger>
                <SelectContent className="bg-surface-container border-surface-container-highest text-white">
                  <SelectItem value="default" className="hover:bg-surface-container-highest focus:bg-surface-container-highest">
                    {poolTokenSymbol} (Native pool token)
                  </SelectItem>
                  {Object.values(web3Config.tokens).map(token => {
                    // Don't show options if they match the native token
                    const defaultAddress = pool?.token || web3Config.tokens.strk.address;
                    if (token.address.toLowerCase() === defaultAddress.toLowerCase()) return null;
                    
                    return (
                      <SelectItem key={token.id} value={token.address} className="hover:bg-surface-container-highest focus:bg-surface-container-highest">
                        {token.symbol} (Auto-swap via AVNU)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {chainType !== 'starknet' && (
             <div className="text-xs text-on-surface-variant bg-surface-container-lowest p-3 rounded border border-surface-container-highest">
               Cross-chain zap currently unsupported. You will receive native <strong className="text-white">{poolTokenSymbol}</strong>.
             </div>
          )}

          <Button 
            onClick={handleClaim} 
            disabled={status === 'submitting'}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold uppercase tracking-widest"
          >
            {status === 'submitting' ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
            ) : status === 'success' ? (
              "Claimed Successfully!"
            ) : (
              "Confirm Claim"
            )}
          </Button>

          {error && (
            <p className="text-red-400 text-xs text-center font-mono">{error}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
