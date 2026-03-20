'use client'

import { Menu, Loader2 } from 'lucide-react'
import { useStarkSdk } from '@/providers/stark-sdk-provider'

interface TopNavBarProps {
  onMenuClick?: () => void
}

export function TopNavBar({ onMenuClick }: TopNavBarProps) {
  const { status, connect, disconnect, address, error } = useStarkSdk()
  const isConnected = status === 'connected' && Boolean(address)
  const isConnecting = status === 'connecting'
  const isError = status === 'error'

  const buttonLabel = isConnecting
    ? 'Connecting…'
    : isConnected
      ? `${address?.slice(0, 6)}…${address?.slice(-4)}`
      : isError
        ? 'Retry'
        : 'Connect'

  return (
    <nav className="border-b border-slate-700/50 bg-slate-mid/80 backdrop-blur-md sticky top-0 z-50">
      <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        {/* Left: Logo and Menu */}
        <div className="flex items-center gap-3 sm:gap-4">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 hover:bg-slate-700/50 rounded-lg transition-colors active:scale-95"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Shōbu Logo */}
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-neon-purple to-neon-blue flex items-center justify-center shadow-lg shadow-neon-purple/50 hover:shadow-neon-purple/70 transition-shadow">
              <span className="text-white font-bold text-sm sm:text-lg">⚔</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold neon-glow hidden sm:inline">Shōbu</h1>
          </div>
        </div>

        {/* Right: Connect Button */}
        <div className="flex items-center gap-2">
          {isError && error && (
            <span className="text-xs text-destructive hidden sm:inline max-w-[180px] truncate">{error}</span>
          )}
          <button
            onClick={() => (isConnected ? disconnect() : connect())}
            disabled={isConnecting}
            className={`px-4 sm:px-6 py-2 rounded-full font-semibold text-sm sm:text-base transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed active:scale-95 flex items-center gap-2 ${
              isConnected
                ? 'bg-gradient-to-r from-green-500/80 to-emerald-500/80 text-white hover:from-green-500 hover:to-emerald-500'
                : isError
                  ? 'bg-gradient-to-r from-red-500/80 to-orange-500/80 text-white hover:from-red-500 hover:to-orange-500'
                  : 'bg-gradient-to-r from-neon-purple to-neon-blue text-slate-dark hover:from-neon-purple/80 hover:to-neon-blue/80 hover:shadow-neon-purple/50'
            }`}
          >
            {isConnecting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isConnected && <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />}
            {buttonLabel}
          </button>
        </div>
      </div>
    </nav>
  )
}
