'use client'

import { Gamepad2, TrendingUp, Trophy, BookOpen, X } from 'lucide-react'
import Link from 'next/link'

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
  return (
    <>
      {/* Mobile Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 lg:hidden z-40"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static w-64 h-screen bg-slate-mid border-r border-slate-700/50 p-6 flex flex-col z-40 transform transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Close Button (Mobile) */}
        <button
          onClick={onToggle}
          className="lg:hidden mb-4 p-2 hover:bg-slate-700/50 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Navigation */}
        <nav className="space-y-2 flex-1">
          {navItems.map((item, index) => {
            const Icon = item.icon
            return (
              <Link
                key={index}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-700/50 transition-colors group"
              >
                <Icon className="w-5 h-5 text-neon-purple group-hover:text-neon-blue transition-colors" />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Footer Section */}
        <div className="border-t border-slate-700/50 pt-4">
          <div className="text-xs text-muted-foreground space-y-2">
            <p>🎮 Starknet Betting</p>
            <p className="text-neon-purple">v1.0.0</p>
          </div>
        </div>
      </aside>
    </>
  )
}
