"use client";

import { createContext, useContext } from "react";

/**
 * Lightweight context that exposes Privy auth status WITHOUT importing
 * the heavy @privy-io/react-auth package. Pages read this instead of
 * doing `require('@privy-io/react-auth')`.
 *
 * Populated by PrivyAuthProvider once the dynamic chunk loads.
 * Until then, defaults are safe (not authenticated, no-op functions).
 */
export type PrivyStatus = {
  ready: boolean;
  authenticated: boolean;
  evmAddress?: string;
  /** Raw Privy wallet objects — used by betting actions for EVM tx execution */
  wallets: any[];
  login: () => void;
  logout: () => Promise<void>;
};

const defaultStatus: PrivyStatus = {
  ready: false,
  authenticated: false,
  wallets: [],
  login: () => {},
  logout: async () => {},
};

export const PrivyStatusContext = createContext<PrivyStatus>(defaultStatus);

export function usePrivyStatus() {
  return useContext(PrivyStatusContext);
}
