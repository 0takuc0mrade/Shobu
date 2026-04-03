'use client'

import { Menu } from 'lucide-react'
import dynamic from 'next/dynamic'

// Lazy load the unified connect wallet group to ensure @privy-io/react-auth 
// dependency tree is completely code-split from the initial bundle.
const ConnectWalletGroup = dynamic(
  () => import('./connect-wallet-group').then(mod => mod.ConnectWalletGroup),
  { ssr: false }
)

interface TopNavBarProps {
  onMenuClick?: () => void
}

export function TopNavBar({ onMenuClick }: TopNavBarProps) {
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
        <div className="flex items-center gap-2 sm:gap-4">
          <ConnectWalletGroup />
        </div>
      </div>
    </nav>
  )
}
