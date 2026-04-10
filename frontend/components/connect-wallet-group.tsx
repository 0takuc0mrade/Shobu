'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { usePrivyStatus } from '@/providers/privy-status-context'
import { useStarkSdk } from '@/providers/stark-sdk-provider'

export function ConnectWalletGroup() {
  const { login, logout, authenticated, ready, evmAddress } = usePrivyStatus()
  
  const { status, connect: connectCartridge, disconnect: disconnectCartridge, address } = useStarkSdk()
  
  const isCartridgeConnected = status === 'connected' && Boolean(address)
  const isCartridgeConnecting = status === 'connecting'

  return (
    <div className="flex bg-surface-container-low p-1">
      {/* BEAM (Privy) Button */}
      {(ready && authenticated) ? (
        <button
          onClick={() => logout()}
          className="px-4 py-1.5 bg-primary-container text-on-primary-container text-[10px] font-bold tracking-widest hover:brightness-110 transition-all uppercase flex items-center gap-2"
        >
          <span className="w-1.5 h-1.5 bg-neon-blue rounded-full animate-pulse" />
          {evmAddress ? `${evmAddress.slice(0, 6)}…${evmAddress.slice(-4)}` : 'EVM Connected'}
        </button>
      ) : (
        <button
          onClick={() => login()}
          disabled={!ready}
          className="px-4 py-1.5 bg-primary-container text-on-primary-container text-[10px] font-bold tracking-widest hover:brightness-110 transition-all uppercase flex items-center gap-2 border-r border-surface-container-low"
        >
          {!ready ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Connect Beam
        </button>
      )}

      {/* STARKNET (Cartridge) Button */}
      {isCartridgeConnected ? (
        <button
          onClick={() => disconnectCartridge()}
          className="px-4 py-1.5 text-primary text-[10px] font-bold tracking-widest hover:bg-surface-container-highest transition-all uppercase flex items-center gap-2"
        >
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          {`${address?.slice(0, 6)}…${address?.slice(-4)}`}
        </button>
      ) : (
        <button
          onClick={() => connectCartridge()}
          disabled={isCartridgeConnecting}
          className="px-4 py-1.5 text-primary text-[10px] font-bold tracking-widest hover:bg-surface-container-highest transition-all uppercase flex items-center gap-2"
        >
          {isCartridgeConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Connect Starknet
        </button>
      )}
    </div>
  )
}
