'use client'

import { Menu } from 'lucide-react'
import { useStarkSdk } from '@/providers/stark-sdk-provider'

interface TopNavBarProps {
  onMenuClick?: () => void
}

export function TopNavBar({ onMenuClick }: TopNavBarProps) {
  const { status, connect, disconnect, address } = useStarkSdk()
  const isConnected = status === 'connected' && Boolean(address)
  const isConnecting = status === 'connecting'
  const buttonLabel = isConnecting
    ? 'Connecting...'
    : isConnected
      ? `Connected ${address?.slice(0, 6)}…${address?.slice(-4)}`
      : 'Connect Cartridge'

  return (
    <nav className="border-b border-slate-700/50 bg-slate-mid/80 backdrop-blur-md sticky top-0 z-50">
      <div className="px-6 py-4 flex items-center justify-between">
        {/* Left: Logo and Menu */}
        <div className="flex items-center gap-4">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-3">
            {/* Shōbu Logo */}
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-neon-purple to-neon-blue flex items-center justify-center shadow-lg shadow-neon-purple/50">
              <span className="text-white font-bold text-lg">⚔</span>
            </div>
            <h1 className="text-xl font-bold neon-glow hidden sm:inline">Shōbu</h1>
          </div>
        </div>

        {/* Right: Connect Button */}
        <button
          onClick={() => (isConnected ? disconnect() : connect())}
          disabled={isConnecting}
          className="px-6 py-2 rounded-full bg-gradient-to-r from-neon-purple to-neon-blue text-slate-dark font-semibold hover:from-neon-purple/80 hover:to-neon-blue/80 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-neon-purple/50 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {buttonLabel}
        </button>
      </div>
    </nav>
  )
}
