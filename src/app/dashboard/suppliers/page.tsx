'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { ExportButton } from '@/components/ExportButton'
import { fmtUsd, fmtTons, fmtNum, cn } from '@/lib/utils'
import type { SupplierProfile } from '@/types/data'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, LineChart, Line, Legend, PieChart, Pie, Cell, COLORS, CHART_THEME,
} from '@/components/charts'

export default function SuppliersPage() {
  const { queryString } = useFilters()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string>('')

  const { data: list } = useQuery<{ name: string; tons: number; usd: number; shipments: number }[]>({
    queryKey: ['suppliers-list', queryString],
    queryFn: () => fetch(`/api/data/suppliers${queryString}`).then((r) => r.json()),
  })

  const { data: profile, isLoading } = useQuery<SupplierProfile | null>({
    queryKey: ['supplier-profile', selected, queryString],
    queryFn: () => fetch(`/api/data/suppliers?supplier=${encodeURIComponent(selected)}${queryString.replace('?', '&')}`).then((r) => r.json()),
    enabled: !!selected,
  })

  const filteredList = (list ?? []).filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()),
  )

  const healthColor = (score: number) =>
    score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="flex gap-4 h-full">
      {/* Left: supplier list */}
      <div className="w-64 flex-shrink-0 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col">
        <div className="p-3 border-b border-zinc-800">
          <input
            type="text"
            placeholder="Search suppliers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-xs placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="text-xs text-zinc-600 mt-1.5">{filteredList.length} suppliers</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredList.map((s) => (
            <button
              key={s.name}
              onClick={() => setSelected(s.name)}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-800/50 transition-colors',
                selected === s.name && 'bg-blue-900/30 border-l-2 border-l-blue-500',
              )}
            >
              <div className="text-xs font-medium text-zinc-200 truncate">{s.name}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{fmtTons(s.tons)} · {fmtUsd(s.usd)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: profile */}
      <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
        {!selected && (
          <div className="flex items-center justify-center h-64 text-zinc-600 text-sm">
            Select a supplier to view their 360° profile
          </div>
        )}

        {selected && isLoading && (
          <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">Loading…</div>
        )}

        {profile && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white">{profile.name}</h1>
                <p className="text-zinc-400 text-sm mt-1">
                  {profile.firstShipment} → {profile.lastShipment} · {profile.totalShipments} shipments
                </p>
              </div>
              <ExportButton
                url={`/api/export?type=supplier&supplier=${encodeURIComponent(selected)}${queryString.replace('?', '&')}`}
                label="Export"
                filename={`supplier_${selected}.xlsx`}
              />
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Total Volume', value: fmtTons(profile.totalTons), sub: fmtUsd(profile.totalUsd) },
                { label: 'Unique Buyers', value: fmtNum(profile.uniqueBuyers), sub: `${profile.uniqueBuyers} buyer${profile.uniqueBuyers !== 1 ? 's' : ''}` },
                { label: 'Peak Quarter', value: profile.peakQuarter, sub: 'highest revenue' },
                { label: 'Health Score', value: profile.healthScore.toString(), sub: `${profile.momentumUsd > 0 ? '+' : ''}${profile.momentumUsd.toFixed(1)}% 90d momentum`, valueClass: healthColor(profile.healthScore) },
              ].map((k) => (
                <div key={k.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="text-xs text-zinc-500 mb-1">{k.label}</div>
                  <div className={cn('text-xl font-bold', k.valueClass ?? 'text-white')}>{k.value}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Buyer shares + Mineral mix */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Revenue by Buyer</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={profile.buyerShares.slice(0, 10)}
                    layout="vertical"
                    margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="buyer" tick={{ fill: CHART_THEME.text, fontSize: 9 }} tickLine={false} width={80} />
                    <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => fmtUsd(v)} />
                    <Bar dataKey="usd" fill={COLORS[0]} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Mineral Mix</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={profile.mineralMix}
                      dataKey="tons"
                      nameKey="mineral"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      label={({ mineral, share }) => `${mineral} ${share.toFixed(0)}%`}
                      labelLine={false}
                    >
                      {profile.mineralMix.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => fmtTons(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Price vs Market */}
            {profile.priceVsMarket.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Price vs Market (USD/kg)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={profile.priceVsMarket} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                    <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                    <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="supplierPrice" stroke={COLORS[0]} name="Supplier" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="marketPrice" stroke={COLORS[2]} name="Market Avg" dot={false} strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Seasonal pattern */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Seasonal Pattern (avg tons/month)</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={profile.seasonalPattern} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                    <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                    <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => v.toFixed(1) + ' t'} />
                    <Bar dataKey="avgTons" fill={COLORS[3]} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Shipment distribution */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Shipment Size Distribution</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={profile.shipmentDistribution} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fill: CHART_THEME.text, fontSize: 9 }} tickLine={false} />
                    <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                    <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} />
                    <Bar dataKey="count" fill={COLORS[1]} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Buyer table with competitor presence */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-white">Buyer Relationships</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="text-left px-4 py-3 font-medium">Buyer</th>
                    <th className="text-right px-4 py-3 font-medium">Revenue</th>
                    <th className="text-right px-4 py-3 font-medium">Volume</th>
                    <th className="text-right px-4 py-3 font-medium">Share</th>
                    <th className="text-left px-4 py-3 font-medium">Since</th>
                    <th className="text-left px-4 py-3 font-medium">Competing Suppliers</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.buyerShares.map((b) => {
                    const competitors = profile.competitorPresence.find((cp) => cp.buyer === b.buyer)
                    return (
                      <tr key={b.buyer} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="px-4 py-2 text-zinc-200 font-medium">{b.buyer}</td>
                        <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtUsd(b.usd)}</td>
                        <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtTons(b.tons)}</td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            <div className="w-12 h-1 rounded-full bg-zinc-800">
                              <div className="h-1 rounded-full bg-blue-500" style={{ width: `${Math.min(b.share, 100)}%` }} />
                            </div>
                            <span className="text-zinc-400 tabular-nums">{b.share.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-zinc-500">{b.firstDate}</td>
                        <td className="px-4 py-2 text-zinc-500">
                          {competitors?.otherSuppliers.slice(0, 3).join(', ') ?? '—'}
                          {(competitors?.otherSuppliers.length ?? 0) > 3 && <span className="text-zinc-600"> +{(competitors?.otherSuppliers.length ?? 0) - 3}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Aduana */}
            {profile.aduanaUsage.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800">
                  <h3 className="text-sm font-semibold text-white">Customs Post Usage</h3>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500">
                      <th className="text-left px-4 py-3 font-medium">Aduana</th>
                      <th className="text-right px-4 py-3 font-medium">Shipments</th>
                      <th className="text-right px-4 py-3 font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.aduanaUsage.map((a) => (
                      <tr key={a.aduana} className="border-b border-zinc-800/50">
                        <td className="px-4 py-2 text-zinc-300">{a.aduana || '—'}</td>
                        <td className="px-4 py-2 text-right text-zinc-400">{fmtNum(a.count)}</td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            <div className="w-16 h-1 rounded-full bg-zinc-800">
                              <div className="h-1 rounded-full bg-amber-500" style={{ width: `${Math.min(a.share, 100)}%` }} />
                            </div>
                            <span className="text-zinc-400">{a.share.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
