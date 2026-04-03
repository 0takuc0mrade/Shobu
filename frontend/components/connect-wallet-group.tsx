'use client'

import * as React from 'react'
import { Mail, Wallet, Loader2, ChevronDown } from 'lucide-react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useStarkSdk } from '@/providers/stark-sdk-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ConnectWalletGroup() {
  const { login, logout, authenticated, ready } = usePrivy()
  const { wallets } = useWallets()
  
  const { status, connect: connectCartridge, disconnect: disconnectCartridge, address } = useStarkSdk()
  
  const isCartridgeConnected = status === 'connected' && Boolean(address)
  const isCartridgeConnecting = status === 'connecting'

  const evmWallet = wallets?.[0]
  const evmAddress = evmWallet?.address

  // If Cartridge is connected
  if (isCartridgeConnected) {
    return (
      <button
        onClick={() => disconnectCartridge()}
        className="px-3 sm:px-5 py-2 rounded-full font-semibold text-xs sm:text-sm transition-all duration-300 shadow-lg hover:shadow-xl active:scale-95 flex items-center gap-2 bg-gradient-to-r from-green-500/80 to-emerald-500/80 text-white hover:from-green-500 hover:to-emerald-500"
      >
        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-300 animate-pulse" />
        {`${address?.slice(0, 6)}…${address?.slice(-4)}`}
      </button>
    )
  }

  // If Privy / EVM is authenticated
  if (ready && authenticated) {
    return (
      <button
        onClick={() => logout()}
        className="px-3 sm:px-5 py-2 rounded-full font-semibold text-xs sm:text-sm transition-all duration-300 shadow-lg hover:shadow-xl active:scale-95 flex items-center gap-2 bg-slate-800 text-white border border-slate-700 hover:bg-slate-700"
      >
        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-400"></span>
        {evmAddress ? `${evmAddress.slice(0, 6)}…${evmAddress.slice(-4)}` : 'EVM Connected'}
      </button>
    )
  }

  // Otherwise, render the general Connect button as a dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="px-5 sm:px-8 py-2 rounded-full font-bold text-sm sm:text-base transition-all duration-300 shadow-[0_0_15px_rgba(168,85,247,0.4)] hover:shadow-[0_0_25px_rgba(168,85,247,0.6)] active:scale-95 flex items-center gap-2 bg-gradient-to-r from-neon-purple to-neon-blue text-white hover:from-neon-purple/90 hover:to-neon-blue/90 border border-white/10">
          Connect <ChevronDown className="w-4 h-4 ml-1 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[250px] bg-slate-900 border-slate-700/50 p-2 rounded-xl mt-2 overflow-hidden shadow-2xl">
        
        <DropdownMenuItem 
          onClick={() => connectCartridge()}
          disabled={isCartridgeConnecting}
          className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-800/80 focus:bg-slate-800/80 rounded-lg transition-colors border border-transparent hover:border-slate-700/50"
        >
          <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 shrink-0 border border-slate-700/50">
            {isCartridgeConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm text-slate-200">Cartridge</span>
            <span className="text-[11px] text-slate-400">Play natively on Starknet</span>
          </div>
        </DropdownMenuItem>

        <div className="h-px bg-slate-800 my-2 mx-2 relative">
          <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 px-2 text-[10px] text-slate-500 font-medium tracking-widest uppercase">Or Web2</span>
        </div>

        <DropdownMenuItem 
          onClick={() => login()}
          disabled={!ready}
          className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-800/80 focus:bg-slate-800/80 rounded-lg transition-colors border border-transparent hover:border-slate-700/50"
        >
          <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 shrink-0 border border-slate-700/50">
            {ready ? <Mail className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm text-slate-200">Privy (Email)</span>
            <span className="text-[11px] text-slate-400">Email & Beam EVM network</span>
          </div>
        </DropdownMenuItem>

      </DropdownMenuContent>
    </DropdownMenu>
  )
}
