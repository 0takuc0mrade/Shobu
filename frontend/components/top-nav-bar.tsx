'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { ConnectWalletGroup } from './connect-wallet-group'

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const isActive = pathname === href
  return (
    <Link 
      href={href} 
      className={`pb-1 transition-colors duration-100 ${
        isActive 
          ? 'text-primary border-b-2 border-neon-purple' 
          : 'text-muted-foreground hover:text-neon-purple'
      }`}
    >
      {children}
    </Link>
  )
}

export function TopNavBar() {
  return (
    <header className="bg-surface text-neon-purple font-headline tracking-tighter uppercase font-bold text-sm top-0 z-50 flex justify-between items-center px-4 md:px-8 h-16 w-full border-b border-surface-container-low shrink-0">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-xl md:text-2xl font-bold tracking-tighter text-neon-purple border-t-2 border-neon-purple pt-1 relative flex items-center gap-2">
          <img src="/icon.svg" alt="Shōbu Logo" className="w-6 h-6 md:w-8 md:h-8" />
          SHŌBU
          {/* subtle glow effect on logo text */}
          <span className="absolute inset-x-0 bottom-0 h-4 bg-neon-purple/20 blur-md -z-10 block pointer-events-none" />
        </Link>
        <nav className="hidden md:flex gap-6 items-center text-[11px] tracking-widest mt-1">
          <NavLink href="/">Live Oracles</NavLink>
          <NavLink href="/resolved">Resolved Markets</NavLink>
          <NavLink href="/portfolio">My Portfolio</NavLink>
        </nav>
      </div>
      
      <div className="flex items-center gap-4">
        <ConnectWalletGroup />
      </div>
    </header>
  )
}
