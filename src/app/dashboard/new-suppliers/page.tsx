'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { ExportButton } from '@/components/ExportButton'
import { fmtUsd, fmtTons, fmtNum, cn } from '@/lib/utils'
import type { NewSupplierRow } from '@/types/data'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ScatterChart, Scatter, Cell, COLORS, CHART_THEME,
} from '@/components/charts'

export default function NewSuppliersPage() {
  const { queryString } = useFilters()
  const [cutoffDate, setCutoffDate] = useState(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 2)
    return d.toISOString().slice(0, 10)
  })
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [sortKey, setSortKey] = useState<keyof NewSupplierRow>('firstShipmentDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const qs = `?cutoffDate=${cutoffDate}${queryString.replace('?', '&')}`

  const { data, isLoading } = useQuery<NewSupplierRow[]>({
    queryKey: ['new-suppliers', qs],
    queryFn: () => fetch(`/api/data/new-suppliers${qs}`).then((r) => r.json()),
  })

  const filtered = useMemo(() => {
    if (!data) return []
    let rows = data
    if (statusFilter === 'active') rows = rows.filter((r) => r.stillActive)
    if (statusFilter === 'inactive') rows = rows.filter((r) => !r.stillActive)
    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
  }, [data, statusFilter, sortKey, sortDir])

  function toggleSort(k: keyof NewSupplierRow) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('desc') }
  }
  const SortIcon = ({ k }: { k: keyof NewSupplierRow }) =>
    sortKey === k ? <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span> : null

  // Cohort bar: count by first shipment month
  const cohortData = useMemo(() => {
    if (!data) return []
    const map: Record<string, { active: number; inactive: number }> = {}
    for (const r of data) {
      const m = r.firstShipmentDate.slice(0, 7)
      if (!map[m]) map[m] = { active: 0, inactive: 0 }
      if (r.stillActive) map[m].active++
      else map[m].inactive++
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }))
  }, [data])

  // Scatter: growth velocity vs survival months
  const scatterData = useMemo(
    () => (data ?? []).map((r) => ({ x: r.survivalMonths, y: r.growthVelocity, name: r.supplier, active: r.stillActive })),
    [data],
  )

  const activeCount = (data ?? []).filter((r) => r.stillActive).length
  const totalTons = (data ?? []).reduce((a, r) => a + r.totalTons, 0)
  const avgVelocity = data?.length
    ? (data.reduce((a, r) => a + r.growthVelocity, 0) / data.length).toFixed(2)
    : '—'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">New Supplier Tracker</h1>
          <p className="text-zinc-400 text-sm mt-1">Suppliers with first shipment on or after cutoff — velocity, survival, activity</p>
        </div>
        <ExportButton url={`/api/export?type=new-suppliers${qs.replace('?', '&')}`} label="Export" filename="new_suppliers.xlsx" />
      </div>

      {/* Cutoff filter */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-6">
        <div>
          <label className="text-xs text-zinc-500 block mb-1.5">Show suppliers first seen on or after</label>
          <input type="date" value={cutoffDate} onChange={(e) => setCutoffDate(e.target.value)}
            className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1.5">Activity Status</label>
          <div className="flex gap-1">
            {(['all', 'active', 'inactive'] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('px-3 py-2 rounded-lg text-xs font-medium transition-colors capitalize',
                  statusFilter === s ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700')}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && <div className="flex items-center justify-center h-40 text-zinc-500">Loading…</div>}

      {!isLoading && data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'New Suppliers', value: fmtNum(data.length), sub: `since ${cutoffDate}` },
              { label: 'Still Active', value: fmtNum(activeCount), sub: `${data.length > 0 ? ((activeCount / data.length) * 100).toFixed(0) : 0}% survival rate` },
              { label: 'Total Volume', value: fmtTons(totalTons), sub: 'collective contribution' },
              { label: 'Avg Growth Velocity', value: avgVelocity, sub: 'tons/month slope' },
            ].map((k) => (
              <div key={k.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-xs text-zinc-500 mb-1">{k.label}</div>
                <div className="text-xl font-bold text-white">{k.value}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Cohort chart + Scatter */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">New Supplier Cohorts by Month</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={cohortData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: CHART_THEME.text, fontSize: 9 }} tickLine={false} />
                  <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                  <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} />
                  <Bar dataKey="active" fill={COLORS[1]} stackId="a" name="Active" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="inactive" fill="#6B7280" stackId="a" name="Inactive" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-1">Velocity vs Survival</h3>
              <p className="text-xs text-zinc-500 mb-3">X = months active, Y = monthly growth slope (tons/month)</p>
              <ResponsiveContainer width="100%" height={200}>
                <ScatterChart margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="x" name="Survival Months" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                  <YAxis type="number" dataKey="y" name="Velocity" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                    content={({ payload }) => {
                      if (!payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-xs">
                          <div className="font-medium text-white">{d.name}</div>
                          <div className="text-zinc-400">{d.x}mo survival · {d.y.toFixed(2)} velocity</div>
                        </div>
                      )
                    }}
                  />
                  <Scatter data={scatterData} name="Suppliers">
                    {scatterData.map((d, i) => (
                      <Cell key={i} fill={d.active ? COLORS[1] : '#6B7280'} opacity={0.8} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">New Supplier List</h3>
              <span className="text-xs text-zinc-500">{filtered.length} suppliers</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    {[
                      { key: 'supplier', label: 'Supplier' },
                      { key: 'firstShipmentDate', label: 'First Ship' },
                      { key: 'totalTons', label: 'Volume', align: 'right' as const },
                      { key: 'totalUsd', label: 'Revenue', align: 'right' as const },
                      { key: 'shipmentCount', label: 'Shipments', align: 'right' as const },
                      { key: 'uniqueBuyers', label: 'Buyers', align: 'right' as const },
                      { key: 'primaryBuyer', label: 'Primary Buyer' },
                      { key: 'primaryMineral', label: 'Mineral' },
                      { key: 'growthVelocity', label: 'Velocity', align: 'right' as const },
                      { key: 'survivalMonths', label: 'Survival', align: 'right' as const },
                      { key: 'stillActive', label: 'Status' },
                    ].map((c) => (
                      <th key={c.key} onClick={() => toggleSort(c.key as keyof NewSupplierRow)}
                        className={cn('px-4 py-3 font-medium cursor-pointer hover:text-white select-none',
                          c.align === 'right' ? 'text-right' : 'text-left')}>
                        {c.label}<SortIcon k={c.key as keyof NewSupplierRow} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.supplier} className={cn('border-b border-zinc-800/50 hover:bg-zinc-800/30', i % 2 ? 'bg-zinc-900/30' : '')}>
                      <td className="px-4 py-2 text-zinc-200 font-medium">{r.supplier}</td>
                      <td className="px-4 py-2 text-zinc-400">{r.firstShipmentDate}</td>
                      <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtTons(r.totalTons)}</td>
                      <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtUsd(r.totalUsd)}</td>
                      <td className="px-4 py-2 text-right text-zinc-500">{r.shipmentCount}</td>
                      <td className="px-4 py-2 text-right text-zinc-500">{r.uniqueBuyers}</td>
                      <td className="px-4 py-2 text-zinc-400 max-w-[120px] truncate">{r.primaryBuyer}</td>
                      <td className="px-4 py-2 text-zinc-500">{r.primaryMineral}</td>
                      <td className={cn('px-4 py-2 text-right tabular-nums font-medium', r.growthVelocity > 0 ? 'text-emerald-400' : r.growthVelocity < 0 ? 'text-red-400' : 'text-zinc-500')}>
                        {r.growthVelocity > 0 ? '+' : ''}{r.growthVelocity.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-500">{r.survivalMonths}mo</td>
                      <td className="px-4 py-2">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                          r.stillActive ? 'bg-emerald-900/40 text-emerald-400' : 'bg-zinc-800 text-zinc-500')}>
                          {r.stillActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
