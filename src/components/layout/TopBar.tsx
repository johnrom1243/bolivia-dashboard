'use client'
import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import type { SearchResult } from '@/types/data'
import { fmtUsd, fmtTons } from '@/lib/utils'

export function TopBar() {
  const { data: session } = useSession()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timeout = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return }
    clearTimeout(timeout.current)
    timeout.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/data/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data)
        setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timeout.current)
  }, [query])

  const BADGE_COLORS: Record<string, string> = {
    Supplier: 'bg-blue-900/60 text-blue-300 border border-blue-800',
    Buyer: 'bg-green-900/60 text-green-300 border border-green-800',
    Mineral: 'bg-amber-900/60 text-amber-300 border border-amber-800',
  }

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-40">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            placeholder="Search suppliers, buyers, minerals…"
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700
                       text-sm text-white placeholder-zinc-500
                       focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
          />
          {loading && (
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-zinc-500"
              fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>

        {/* Dropdown */}
        {open && results.length > 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-zinc-900 border border-zinc-700
                          rounded-xl shadow-2xl overflow-hidden">
            {results.map((r) => (
              <div key={`${r.type}:${r.name}`}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800 cursor-pointer transition-colors">
                <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${BADGE_COLORS[r.type] ?? ''}`}>
                  {r.type}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate font-medium">{r.name}</div>
                  <div className="text-xs text-zinc-500">
                    {fmtUsd(r.totalUsd, true)} · {fmtTons(r.totalTons)} · {r.shipmentCount} shipments
                  </div>
                </div>
                <div className="text-xs text-zinc-600">{r.lastActivity}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User */}
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-sm text-white font-medium">{session?.user?.name ?? 'User'}</div>
          <div className="text-xs text-zinc-500">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        </div>
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white">
          {(session?.user?.name ?? 'U')[0].toUpperCase()}
        </div>
      </div>
    </header>
  )
}
