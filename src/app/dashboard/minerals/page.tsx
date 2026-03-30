'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { ExportButton } from '@/components/ExportButton'
import { fmtTons, fmtUsd, cn } from '@/lib/utils'
import type { MineralHitListRow } from '@/types/data'

const STATUS_COLORS: Record<string, string> = {
  'NEW ENTRY': 'bg-green-900/50 text-green-300 border-green-700',
  'HOT LEAD':  'bg-red-900/50 text-red-300 border-red-700',
  'WARM':      'bg-orange-900/50 text-orange-300 border-orange-700',
  'LUKEWARM':  'bg-yellow-900/30 text-yellow-400 border-yellow-800',
  'DORMANT':   'bg-zinc-800 text-zinc-500 border-zinc-700',
}

export default function MineralsPage() {
  const { queryString } = useFilters()
  const [selectedMineral, setSelectedMineral] = useState('ZINC')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data: meta } = useQuery<{ minerals: string[] }>({
    queryKey: ['meta'],
    queryFn: () => fetch('/api/data/meta').then((r) => r.json()),
    staleTime: Infinity,
  })

  const qs = queryString ? `${queryString}&mineral=${selectedMineral}` : `?mineral=${selectedMineral}`

  const { data, isLoading } = useQuery<MineralHitListRow[]>({
    queryKey: ['minerals', queryString, selectedMineral],
    queryFn: () => fetch(`/api/data/mineral${qs}`).then((r) => r.json()),
  })

  const filtered = data?.filter((r) => statusFilter === 'all' || r.status === statusFilter) ?? []

  const newEntries = data?.filter((r) => r.status === 'NEW ENTRY').length ?? 0
  const hotLeads = data?.filter((r) => r.status === 'HOT LEAD').length ?? 0
  const warm = data?.filter((r) => r.status === 'WARM').length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Mineral Hit List</h1>
          <p className="text-zinc-400 text-sm mt-1">Commercial prospecting — leads ranked by urgency and lead score</p>
        </div>
        <ExportButton
          url={`/api/export?type=mineral&mineral=${selectedMineral}${queryString.replace('?', '&')}`}
          label="Export Hit List"
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedMineral}
          onChange={(e) => setSelectedMineral(e.target.value)}
          className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {meta?.minerals?.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <div className="flex gap-1">
          {['all', 'NEW ENTRY', 'HOT LEAD', 'WARM', 'LUKEWARM', 'DORMANT'].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                statusFilter === s ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700',
              )}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'New Entries', value: newEntries, color: 'green' },
          { label: 'Hot Leads', value: hotLeads, color: 'red' },
          { label: 'Warm Leads', value: warm, color: 'orange' },
          { label: 'Total Active', value: (data?.filter((r) => r.status !== 'DORMANT').length ?? 0), color: 'blue' },
        ].map(({ label, value, color }) => (
          <div key={label} className={cn('rounded-xl p-4 border', {
            'bg-green-900/30 border-green-800 text-green-300': color === 'green',
            'bg-red-900/20 border-red-900 text-red-400': color === 'red',
            'bg-orange-900/20 border-orange-900 text-orange-400': color === 'orange',
            'bg-zinc-900 border-zinc-800 text-blue-400': color === 'blue',
          })}>
            <div className="text-2xl font-bold mb-1">{value}</div>
            <div className="text-sm">{label}</div>
          </div>
        ))}
      </div>

      {/* Hit list table */}
      {isLoading ? (
        <div className="h-64 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="text-left px-4 py-3 font-medium">#</th>
                  <th className="text-left px-4 py-3 font-medium">Supplier</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Lead Score</th>
                  <th className="text-left px-4 py-3 font-medium">Latest Buyer</th>
                  <th className="text-right px-4 py-3 font-medium">Days Inactive</th>
                  <th className="text-right px-4 py-3 font-medium">Total Tons</th>
                  <th className="text-right px-4 py-3 font-medium">Total USD</th>
                  <th className="text-right px-4 py-3 font-medium">Price vs Mkt</th>
                  <th className="text-left px-4 py-3 font-medium">Recommended Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.supplier}
                    className={cn(
                      'border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors',
                      i % 2 ? 'bg-zinc-900/30' : '',
                    )}>
                    <td className="px-4 py-2.5 text-zinc-600">{i + 1}</td>
                    <td className="px-4 py-2.5 text-white font-medium">{r.supplier}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={cn('px-2 py-0.5 rounded-full border text-xs font-medium', STATUS_COLORS[r.status])}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <div className="w-12 h-1.5 rounded-full bg-zinc-800">
                          <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${r.leadScore}%` }} />
                        </div>
                        <span className="text-zinc-300 tabular-nums">{r.leadScore}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 max-w-[160px] truncate">{r.latestBuyer}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums font-medium',
                      r.daysInactive <= 45 ? 'text-green-400' : r.daysInactive <= 90 ? 'text-amber-400' : 'text-zinc-400')}>
                      {r.daysInactive}d
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-400 tabular-nums">{fmtTons(r.totalTons)}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-400 tabular-nums">{fmtUsd(r.totalUsd, true)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.priceVsMarket !== null ? (
                        <span className={r.priceVsMarket > 0 ? 'text-green-400' : r.priceVsMarket < 0 ? 'text-red-400' : 'text-zinc-400'}>
                          {r.priceVsMarket > 0 ? '+' : ''}{r.priceVsMarket?.toFixed(1)}%
                        </span>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 max-w-[200px]">{r.recommendedAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
