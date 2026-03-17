import type { BettingPoolModel } from "@/hooks/use-dojo-betting";

export type EgsGame = {
  id?: string;
  gameId: number;
  name: string;
  worldAddress: string;
  gameAddress?: string;
  tokenAddress?: string;
  toriiUrl?: string;
  network?: string;
  image?: string;
  color?: string;
  raw?: unknown;
};

export type EgsGameWithPool = EgsGame & {
  pool?: BettingPoolModel | null;
  bettable: boolean;
};

export type EgsLiveEvent = {
  id: string;
  worldAddress: string;
  gameId?: number | null;
  blockNumber?: number;
  eventIndex?: number;
  txHash?: string;
  keys?: string[];
  data?: string[];
  seenAt: number;
};

export type EgsSessionToken = {
  worldAddress: string;
  tokenAddress: string;
  tokenId: string;
  balance: string;
  gameId?: number | null;
  accountAddress?: string;
};
