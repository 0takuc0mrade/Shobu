'use client'

import * as React from 'react'
import { Loader2, ChevronDown } from 'lucide-react'
import { usePrivyStatus } from '@/providers/privy-status-context'
import { useStarkSdk } from '@/providers/stark-sdk-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ConnectWalletGroup() {
  const { login, logout, authenticated, ready, evmAddress } = usePrivyStatus()
  
  const { status, connect: connectCartridge, disconnect: disconnectCartridge, address } = useStarkSdk()
  
  const isCartridgeConnected = status === 'connected' && Boolean(address)
  const isCartridgeConnecting = status === 'connecting'
  
  const totalConnected = (authenticated ? 1 : 0) + (isCartridgeConnected ? 1 : 0)

  return (
    <div className="flex bg-surface-container-low p-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="px-4 py-1.5 bg-primary-container text-on-primary-container text-[10px] font-bold tracking-widest hover:brightness-110 transition-all uppercase flex items-center gap-2 outline-none">
            {totalConnected > 0 ? `${totalConnected} Connected` : 'Connect'}
            <ChevronDown className="w-3 h-3 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-surface-container-low border-surface-container-highest">
          {/* BEAM (Privy) */}
          {(ready && authenticated) ? (
            <DropdownMenuItem onClick={() => logout()} className="flex justify-between cursor-pointer focus:bg-surface-container-highest">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-neon-blue rounded-full animate-pulse" />
                <span className="text-[10px] font-bold tracking-widest uppercase">Beam</span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">{evmAddress ? `${evmAddress.slice(0, 6)}…${evmAddress.slice(-4)}` : ''}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => login()} disabled={!ready} className="flex justify-between cursor-pointer focus:bg-surface-container-highest">
              <span className="text-[10px] font-bold tracking-widest uppercase flex items-center gap-2">
                {!ready ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Connect Beam
              </span>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator className="bg-surface-container-highest" />

          {/* STARKNET (Cartridge) */}
          {isCartridgeConnected ? (
            <DropdownMenuItem onClick={() => disconnectCartridge()} className="flex justify-between cursor-pointer focus:bg-surface-container-highest">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                <span className="text-[10px] font-bold tracking-widest uppercase">Starknet</span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => connectCartridge()} disabled={isCartridgeConnecting} className="flex justify-between cursor-pointer focus:bg-surface-container-highest">
              <span className="text-[10px] font-bold tracking-widest uppercase flex items-center gap-2">
                {isCartridgeConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Connect Starknet
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
