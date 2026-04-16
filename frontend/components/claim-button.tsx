import { useState } from "react";
import { ClaimWinningsModal } from "./claim-winnings-modal";

export function ClaimButton({ pool, userBetAmount, chainType, className }: { pool: any; userBetAmount: string; chainType: 'starknet' | 'evm' | 'stellar'; className?: string; }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className={`px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-white text-[10px] font-bold uppercase tracking-widest rounded shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all ${className || ""}`}
      >
        Claim Winnings
      </button>
      
      {isOpen && (
        <ClaimWinningsModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          pool={pool}
          userBetAmount={userBetAmount}
          chainType={chainType}
        />
      )}
    </>
  );
}
