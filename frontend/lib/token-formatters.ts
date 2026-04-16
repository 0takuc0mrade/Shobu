import { web3Config, getTokenByAddress } from "@/lib/web3-config";

export function resolveTokenSymbol(
  pool?: any | null,
  chainType?: 'starknet' | 'evm' | 'stellar' | null
): string {
  if (chainType === 'stellar') return 'XLM';
  if (chainType === 'evm') return 'BEAM';
  if (pool?.token) {
    const resolved = getTokenByAddress(pool.token);
    if (resolved) return resolved.symbol;
  }
  if (chainType === 'starknet') return 'STRK';
  return 'TOKEN';
}

export function resolveTokenDecimals(
  pool?: any | null,
  chainType?: 'starknet' | 'evm' | 'stellar' | null
): number {
  if (chainType === 'stellar') return 7;
  if (chainType === 'evm') return 18;
  if (pool?.token) {
    const resolved = getTokenByAddress(pool.token);
    if (resolved) return resolved.decimals;
  }
  return 18;
}
