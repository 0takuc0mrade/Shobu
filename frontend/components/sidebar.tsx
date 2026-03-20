'use client'

import { Gamepad2, TrendingUp, Trophy, BookOpen, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface SidebarProps {
  open: boolean
  onToggle: () => void
}

const navItems = [
  { icon: Gamepad2, label: 'Live Games', href: '/match' },
  { icon: TrendingUp, label: 'My Portfolio', href: '/portfolio' },
  { icon: Trophy, label: 'Leaderboard', href: '#' },
  { icon: BookOpen, label: 'Docs', href: '#' },
]

export function Sidebar({ open, onToggle }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm lg:hidden z-40 transition-opacity duration-300"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static w-64 h-screen glass-card lg:bg-slate-mid lg:backdrop-blur-none border-r border-slate-700/50 p-4 sm:p-6 flex flex-col z-40 transform transition-all duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Close Button (Mobile) */}
        <button
          onClick={onToggle}
          className="lg:hidden mb-4 p-2 hover:bg-slate-700/50 rounded-lg transition-colors self-end active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Navigation */}
        <nav className="space-y-1 flex-1">
          {navItems.map((item, index) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={index}
                href={item.href}
                onClick={onToggle}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                  isActive
                    ? 'bg-neon-purple/10 border border-neon-purple/30 text-neon-purple'
                    : 'hover:bg-slate-700/50 active:scale-[0.98]'
                }`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <Icon className={`w-5 h-5 transition-colors duration-200 ${
                  isActive ? 'text-neon-purple' : 'text-neon-purple/60 group-hover:text-neon-blue'
                }`} />
                <span className="font-medium text-sm sm:text-base">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Footer Section */}
        <div className="border-t border-slate-700/50 pt-4">
          <div className="text-xs text-muted-foreground space-y-2">
            <p>🎮 Starknet Betting</p>
            <p className="text-neon-purple font-medium">v1.0.0</p>
          </div>
        </div>
      </aside>
    </>
  )
}
