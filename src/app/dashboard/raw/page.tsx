'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { ExportButton } from '@/components/ExportButton'
import { fmtUsd, fmtTons, fmtNum } from '@/lib/utils'
import type { DataRow } from '@/types/data'

const PAGE_SIZE = 50

export default function RawDataPage() {
  const { queryString } = useFilters()
  const [page, setPage] = useState(0)
  const [sortKey, setSortKey] = useState<keyof DataRow>('Date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')

  const { data: all, isLoading } = useQuery<DataRow[]>({
    queryKey: ['raw', queryString],
    queryFn: () => fetch(`/api/data/raw${queryString}`).then((r) => r.json()),
  })

  const sorted = useMemo(() => {
    if (!all) return []
    let rows = search
      ? all.filter((r) =>
          r.supplier.toLowerCase().includes(search.toLowerCase()) ||
          r.buyer.toLowerCase().includes(search.toLowerCase()) ||
          r.mineral.toLowerCase().includes(search.toLowerCase()),
        )
      : all
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return rows
  }, [all, sortKey, sortDir, search])

  const pages = Math.ceil(sorted.length / PAGE_SIZE)
  const visible = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function toggleSort(key: keyof DataRow) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: keyof DataRow }) =>
    sortKey === k ? (sortDir === 'asc' ? <span className="ml-0.5">↑</span> : <span className="ml-0.5">↓</span>) : null

  const COLS: { key: keyof DataRow; label: string; align?: 'right' }[] = [
    { key: 'Date', label: 'Date' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'buyer', label: 'Buyer' },
    { key: 'mineral', label: 'Mineral' },
    { key: 'kg', label: 'KG', align: 'right' },
    { key: 'tons', label: 'Tons', align: 'right' },
    { key: 'usd', label: 'USD', align: 'right' },
    { key: 'usd_per_kg', label: 'USD/KG', align: 'right' },
    { key: 'aduana', label: 'Aduana' },
    { key: 'Quarter', label: 'Quarter' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Raw Data</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {sorted.length ? `${fmtNum(sorted.length)} rows` : 'Loading…'}
            {all && ` of ${fmtNum(all.length)} total`}
          </p>
        </div>
        <ExportButton url={`/api/export?type=raw${queryString.replace('?', '&')}`} label="Export All" filename="bolivia_raw_data.xlsx" />
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
        </svg>
        <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          placeholder="Filter by supplier, buyer, or mineral…"
          className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                {COLS.map((c) => (
                  <th key={c.key} onClick={() => toggleSort(c.key)}
                    className={`px-4 py-3 font-medium cursor-pointer hover:text-white transition-colors select-none ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {c.label}<SortIcon k={c.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b border-zinc-800/50">
                    {COLS.map((c) => <td key={c.key} className="px-4 py-3"><div className="h-3 bg-zinc-800 rounded animate-pulse" /></td>)}
                  </tr>
                ))
              ) : visible.map((r, i) => (
                <tr key={i} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${i % 2 ? 'bg-zinc-900/30' : ''}`}>
                  <td className="px-4 py-2 text-zinc-400">{r.Date}</td>
                  <td className="px-4 py-2 text-zinc-300 font-medium max-w-[160px] truncate">{r.supplier}</td>
                  <td className="px-4 py-2 text-zinc-400 max-w-[160px] truncate">{r.buyer}</td>
                  <td className="px-4 py-2 text-zinc-500">{r.mineral}</td>
                  <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtNum(r.kg)}</td>
                  <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{r.tons.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtUsd(r.usd, true)}</td>
                  <td className="px-4 py-2 text-right text-zinc-500 tabular-nums">${r.usd_per_kg.toFixed(3)}</td>
                  <td className="px-4 py-2 text-zinc-500 max-w-[160px] truncate">{r.aduana ?? '—'}</td>
                  <td className="px-4 py-2 text-zinc-600">{r.Quarter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800">
            <div className="text-xs text-zinc-500">
              Showing {page * PAGE_SIZE + 1} – {Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {fmtNum(sorted.length)}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(0)} disabled={page === 0} className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-white disabled:opacity-30">«</button>
              <button onClick={() => setPage((p) => p - 1)} disabled={page === 0} className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-white disabled:opacity-30">‹</button>
              <span className="px-3 text-xs text-zinc-400">Page {page + 1} of {pages}</span>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= pages - 1} className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-white disabled:opacity-30">›</button>
              <button onClick={() => setPage(pages - 1)} disabled={page >= pages - 1} className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-white disabled:opacity-30">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
