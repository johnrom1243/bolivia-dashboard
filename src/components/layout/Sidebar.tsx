'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { signOut } from 'next-auth/react'

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: '📊', exact: true },
  { href: '/dashboard/predator', label: 'Predator Engine', icon: '🦅' },
  { href: '/dashboard/poach', label: 'Poach Index', icon: '🎯' },
  { href: '/dashboard/loyalty', label: 'Loyalty Analysis', icon: '🤝' },
  { href: '/dashboard/suppliers', label: 'Supplier Deep Dive', icon: '🏭' },
  { href: '/dashboard/buyers', label: 'Trader Analysis', icon: '🏢' },
  { href: '/dashboard/compare', label: 'Trader Comparison', icon: '⚔️' },
  { href: '/dashboard/market', label: 'Market Evolution', icon: '📈' },
  { href: '/dashboard/logistics', label: 'Logistics', icon: '🚚' },
  { href: '/dashboard/matrix', label: 'S×B Matrix', icon: '📋' },
  { href: '/dashboard/new-suppliers', label: 'New Suppliers', icon: '🆕' },
  { href: '/dashboard/minerals', label: 'Mineral Hit List', icon: '⛏️' },
  { href: '/dashboard/forensic', label: 'Forensic Detective', icon: '🕵️' },
  { href: '/dashboard/raw', label: 'Raw Data', icon: '🗄️' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex flex-col w-56 bg-zinc-900 border-r border-zinc-800">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🇧🇴</span>
          <div>
            <div className="text-sm font-bold text-white leading-tight">
              {process.env.NEXT_PUBLIC_COMPANY_NAME ?? 'Penfold'}
            </div>
            <div className="text-xs text-zinc-500">Bolivia Intel</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all mb-0.5',
                isActive
                  ? 'bg-blue-600/20 text-blue-400 font-medium border border-blue-600/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800',
              )}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-zinc-800">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                     text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  )
}
