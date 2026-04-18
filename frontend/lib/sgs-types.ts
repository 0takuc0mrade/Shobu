/**
 * Stellar Game Studio (SGS) Types
 *
 * Data shapes for games discovered via the Stellar Game Hub contract's
 * GameStarted / GameEnded events.
 */

export type SgsActiveGame = {
  sessionId: number;
  gameContractAddress: string;
  player1: string;
  player2: string;
  player1Points: string; // stringified i128
  player2Points: string;
  startedAt: number; // ledger close timestamp (unix seconds)
  startLedger: number; // ledger sequence
  gameName?: string; // resolved from known games lookup
  gameHubAddress: string;
};

export type SgsGameEnded = {
  sessionId: number;
  player1Won: boolean;
  endedAt: number;
  endLedger: number;
};

export type SgsIndexerState = {
  /** Cursor: last processed ledger sequence */
  lastLedger: number;
  /** Active games (started but not ended) */
  activeGames: SgsActiveGame[];
  /** Ended session IDs (for dedup) */
  endedSessionIds: number[];
  /** Last updated ISO timestamp */
  updatedAt: string;
};

/**
 * Known game contracts in the SGS ecosystem.
 * Maps contract address → human-readable game name.
 * This will grow as more games are built on SGS.
 */
export const SGS_KNOWN_GAMES: Record<string, string> = {
  // These are placeholder addresses — real ones are assigned on deploy
  // They should be updated with actual deployed contract addresses
};

/**
 * Try to resolve a human-readable name for an SGS game contract.
 * Falls back to an abbreviated address.
 */
export function resolveSgsGameName(contractAddress: string): string {
  if (SGS_KNOWN_GAMES[contractAddress]) {
    return SGS_KNOWN_GAMES[contractAddress];
  }
  // Abbreviated address as fallback
  if (contractAddress.length > 12) {
    return `SGS ${contractAddress.slice(0, 4)}…${contractAddress.slice(-4)}`;
  }
  return `SGS Game`;
}
