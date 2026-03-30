'use client'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { ExportButton } from '@/components/ExportButton'
import { fmtUsd, fmtTons, fmtNum, cn } from '@/lib/utils'
import type { TraderProfile } from '@/types/data'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, LineChart, Line, Legend, COLORS, CHART_THEME,
} from '@/components/charts'

export default function BuyersPage() {
  const { queryString } = useFilters()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string>('')
  const [activeMineral, setActiveMineral] = useState<string>('')
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set())
  const [smSort, setSmSort] = useState<'date' | 'value' | 'volume'>('date')
  const [smSearch, setSmSearch] = useState('')

  const { data: list } = useQuery<{ name: string; tons: number; usd: number; shipments: number }[]>({
    queryKey: ['buyers-list', queryString],
    queryFn: () => fetch(`/api/data/buyers${queryString}`).then((r) => r.json()),
  })

  const { data: profile, isLoading } = useQuery<TraderProfile | null>({
    queryKey: ['buyer-profile', selected, queryString],
    queryFn: () => fetch(`/api/data/buyers?buyer=${encodeURIComponent(selected)}${queryString.replace('?', '&')}`).then((r) => r.json()),
    enabled: !!selected,
  })

  useEffect(() => {
    if (profile && !activeMineral) setActiveMineral(profile.pricingPower[0]?.mineral ?? '')
  }, [profile])

  const filteredList = (list ?? []).filter((b) =>
    !search || b.name.toLowerCase().includes(search.toLowerCase()),
  )

  const trendColor = (t: string) =>
    t === 'growing' ? 'text-emerald-400' : t === 'declining' ? 'text-red-400' : 'text-zinc-400'
  const trendArrow = (t: string) =>
    t === 'growing' ? '↑' : t === 'declining' ? '↓' : '→'

  const minerals = profile ? [...new Set(profile.priceVsMarket.map((p) => p.mineral))] : []
  const priceData = profile
    ? profile.priceVsMarket
        .filter((p) => !activeMineral || p.mineral === activeMineral)
        .reduce<Record<string, { date: string; traderPrice: number; marketPrice: number }>>((acc, p) => {
          acc[p.date] = { date: p.date, traderPrice: p.traderPrice, marketPrice: p.marketPrice }
          return acc
        }, {})
    : {}
  const priceChartData = Object.values(priceData).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="flex gap-4 h-full">
      {/* Left: buyer list */}
      <div className="w-64 flex-shrink-0 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col">
        <div className="p-3 border-b border-zinc-800">
          <input
            type="text"
            placeholder="Search buyers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-xs placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="text-xs text-zinc-600 mt-1.5">{filteredList.length} buyers</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredList.map((b) => (
            <button
              key={b.name}
              onClick={() => { setSelected(b.name); setActiveMineral('') }}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-800/50 transition-colors',
                selected === b.name && 'bg-blue-900/30 border-l-2 border-l-blue-500',
              )}
            >
              <div className="text-xs font-medium text-zinc-200 truncate">{b.name}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{fmtTons(b.tons)} · {fmtUsd(b.usd)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: profile */}
      <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
        {!selected && (
          <div className="flex items-center justify-center h-64 text-zinc-600 text-sm">
            Select a buyer (trader) to view their full profile
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
                url={`/api/export?type=buyer&buyer=${encodeURIComponent(selected)}${queryString.replace('?', '&')}`}
                label="Export"
                filename={`buyer_${selected}.xlsx`}
              />
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Total Volume', value: fmtTons(profile.totalTons), sub: fmtUsd(profile.totalUsd) },
                { label: 'Unique Suppliers', value: fmtNum(profile.uniqueSuppliers), sub: 'active suppliers' },
                { label: 'Market Share', value: `${profile.marketSharePct.toFixed(2)}%`, sub: profile.marketShareTrend, subClass: trendColor(profile.marketShareTrend) },
                { label: 'Avg Shipment', value: fmtUsd(profile.totalUsd / Math.max(profile.totalShipments, 1)), sub: `${profile.totalShipments} shipments` },
              ].map((k) => (
                <div key={k.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="text-xs text-zinc-500 mb-1">{k.label}</div>
                  <div className="text-xl font-bold text-white">{k.value}</div>
                  <div className={cn('text-xs mt-0.5', k.subClass ?? 'text-zinc-500')}>
                    {k.subClass ? trendArrow(profile.marketShareTrend) + ' ' : ''}{k.sub}
                  </div>
                </div>
              ))}
            </div>

            {/* Quarterly volume chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Quarterly Purchase Volume</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={profile.quarterlyVolume} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="quarter" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => fmtUsd(v)} />
                  <Bar dataKey="usd" fill={COLORS[0]} radius={[3, 3, 0, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Price vs Market + Pricing Power */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Price Paid vs Market Average</h3>
                  <div className="flex gap-1">
                    {minerals.map((m) => (
                      <button key={m} onClick={() => setActiveMineral(m)}
                        className={cn('px-2 py-1 rounded text-xs transition-colors',
                          activeMineral === m ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700')}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={priceChartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                    <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                    <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="traderPrice" stroke={COLORS[0]} name="Trader Price" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="marketPrice" stroke={COLORS[2]} name="Market Avg" dot={false} strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Pricing Power</h3>
                <p className="text-xs text-zinc-500 mb-3">% paid vs market avg per mineral</p>
                <div className="space-y-3">
                  {profile.pricingPower.map((p) => (
                    <div key={p.mineral}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-zinc-300">{p.mineral}</span>
                        <span className={cn('text-xs font-medium tabular-nums', p.premiumPct > 0 ? 'text-red-400' : 'text-emerald-400')}>
                          {p.premiumPct > 0 ? '+' : ''}{p.premiumPct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-zinc-800 relative">
                        <div
                          className={cn('h-1 rounded-full absolute', p.premiumPct > 0 ? 'bg-red-500' : 'bg-emerald-500')}
                          style={{ width: `${Math.min(Math.abs(p.premiumPct), 50)}%`, left: p.premiumPct < 0 ? `${50 - Math.min(Math.abs(p.premiumPct), 50)}%` : '50%' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Supplier roster */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Supplier Roster</h3>
                <span className="text-xs text-zinc-500">{profile.uniqueSuppliers} suppliers</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="text-left px-4 py-3 font-medium">Supplier</th>
                    <th className="text-right px-4 py-3 font-medium">Revenue</th>
                    <th className="text-right px-4 py-3 font-medium">Shipments</th>
                    <th className="text-right px-4 py-3 font-medium">Avg/Ship</th>
                    <th className="text-right px-4 py-3 font-medium">Wallet Share</th>
                    <th className="text-right px-4 py-3 font-medium">Last Ship</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.supplierRoster.map((s) => (
                    <tr key={s.supplier} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="px-4 py-2 text-zinc-200 font-medium">{s.supplier}</td>
                      <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtUsd(s.totalUsd)}</td>
                      <td className="px-4 py-2 text-right text-zinc-500">{s.shipmentCount}</td>
                      <td className="px-4 py-2 text-right text-zinc-500 tabular-nums">{fmtUsd(s.avgUsdPerShipment)}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center gap-1.5 justify-end">
                          <div className="w-12 h-1 rounded-full bg-zinc-800">
                            <div className="h-1 rounded-full bg-blue-500" style={{ width: `${Math.min(s.shareOfWallet, 100)}%` }} />
                          </div>
                          <span className={cn('text-xs tabular-nums', s.shareOfWallet > 50 ? 'text-amber-400' : 'text-zinc-400')}>
                            {s.shareOfWallet.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-500">{s.lastShipment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* New acquisitions */}
            {profile.newAcquisitions.length > 0 && (
              <div className="bg-zinc-900 border border-emerald-800/30 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-emerald-800/30">
                  <h3 className="text-sm font-semibold text-emerald-400">New Supplier Acquisitions</h3>
                  <p className="text-xs text-zinc-500 mt-1">Suppliers first purchased within the filtered period</p>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500">
                      <th className="text-left px-4 py-3 font-medium">Supplier</th>
                      <th className="text-right px-4 py-3 font-medium">First Purchase</th>
                      <th className="text-right px-4 py-3 font-medium">Revenue Since</th>
                      <th className="text-right px-4 py-3 font-medium">Shipments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.newAcquisitions.map((a) => (
                      <tr key={a.supplier} className="border-b border-zinc-800/50">
                        <td className="px-4 py-2 text-emerald-400 font-medium">{a.supplier}</td>
                        <td className="px-4 py-2 text-right text-zinc-400">{a.firstPurchaseDate}</td>
                        <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtUsd(a.totalUsdSince)}</td>
                        <td className="px-4 py-2 text-right text-zinc-500">{a.shipmentsSince}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Supplier Intelligence ─────────────────────────────── */}
            {profile.supplierMineralBreakdown.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Supplier Intelligence</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      All suppliers — minerals delivered, value, weight, last delivery · sorted by most recent
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Sort */}
                    <div className="flex gap-1">
                      {(['date', 'value', 'volume'] as const).map((s) => (
                        <button key={s} onClick={() => setSmSort(s)}
                          className={cn('px-2 py-1 rounded text-xs transition-colors capitalize',
                            smSort === s ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700')}>
                          {s === 'date' ? 'Recent' : s}
                        </button>
                      ))}
                    </div>
                    <ExportButton
                      url={`/api/export?type=supplier-intel&buyer=${encodeURIComponent(selected)}${queryString.replace('?', '&')}`}
                      label="Export"
                      filename={`supplier_intel_${selected}.xlsx`}
                    />
                  </div>
                </div>

                {/* Search */}
                <div className="px-5 py-3 border-b border-zinc-800">
                  <input
                    type="text"
                    placeholder="Filter by supplier name…"
                    value={smSearch}
                    onChange={(e) => setSmSearch(e.target.value)}
                    className="w-full max-w-xs px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-xs placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Supplier rows */}
                {(() => {
                  const rows = profile.supplierMineralBreakdown
                    .filter((s) => !smSearch || s.supplier.toLowerCase().includes(smSearch.toLowerCase()))
                    .slice()
                    .sort((a, b) =>
                      smSort === 'date' ? b.lastDelivery.localeCompare(a.lastDelivery)
                      : smSort === 'value' ? b.totalUsd - a.totalUsd
                      : b.totalTons - a.totalTons,
                    )

                  return (
                    <div>
                      {/* Header */}
                      <div className="grid grid-cols-[1fr_repeat(6,auto)] items-center px-4 py-2 text-xs text-zinc-500 font-medium border-b border-zinc-800 gap-4">
                        <span>Supplier</span>
                        <span className="text-right w-28">Total Revenue</span>
                        <span className="text-right w-24">Total Volume</span>
                        <span className="text-right w-20">Shipments</span>
                        <span className="text-right w-24">Wallet Share</span>
                        <span className="text-right w-28">Last Delivery</span>
                        <span className="text-right w-20">Days Ago</span>
                      </div>

                      {rows.map((s) => {
                        const isExpanded = expandedSuppliers.has(s.supplier)
                        const recencyColor =
                          s.daysSinceLast <= 30 ? 'text-emerald-400'
                          : s.daysSinceLast <= 90 ? 'text-amber-400'
                          : s.daysSinceLast <= 180 ? 'text-orange-400'
                          : 'text-red-400'

                        return (
                          <div key={s.supplier} className="border-b border-zinc-800/60">
                            {/* Supplier summary row */}
                            <button
                              onClick={() => setExpandedSuppliers((prev) => {
                                const next = new Set(prev)
                                next.has(s.supplier) ? next.delete(s.supplier) : next.add(s.supplier)
                                return next
                              })}
                              className="w-full grid grid-cols-[1fr_repeat(6,auto)] items-center px-4 py-3 text-xs gap-4 hover:bg-zinc-800/40 transition-colors text-left"
                            >
                              <span className="flex items-center gap-2">
                                <span className={cn('text-xs transition-transform inline-block', isExpanded ? 'rotate-90' : '')}>▶</span>
                                <span className="text-zinc-100 font-semibold">{s.supplier}</span>
                                <span className="text-zinc-600 text-xs">
                                  {s.minerals.length} mineral{s.minerals.length !== 1 ? 's' : ''}
                                </span>
                              </span>
                              <span className="text-right text-zinc-300 tabular-nums font-medium w-28">{fmtUsd(s.totalUsd)}</span>
                              <span className="text-right text-zinc-400 tabular-nums w-24">{fmtTons(s.totalTons)}</span>
                              <span className="text-right text-zinc-500 w-20">{s.shipmentCount}</span>
                              <span className="text-right w-24">
                                <span className={cn('text-xs font-medium', s.shareOfWallet >= 50 ? 'text-amber-400' : 'text-zinc-400')}>
                                  {s.shareOfWallet.toFixed(1)}%
                                </span>
                                <span className="text-zinc-600 text-xs ml-1">of supplier</span>
                              </span>
                              <span className="text-right text-zinc-400 w-28">{s.lastDelivery}</span>
                              <span className={cn('text-right font-medium tabular-nums w-20', recencyColor)}>
                                {s.daysSinceLast}d ago
                              </span>
                            </button>

                            {/* Mineral breakdown (expanded) */}
                            {isExpanded && (
                              <div className="bg-zinc-950/60 border-t border-zinc-800/40">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-zinc-800/40 text-zinc-600">
                                      <th className="text-left pl-12 pr-4 py-2 font-medium">Mineral</th>
                                      <th className="text-right px-4 py-2 font-medium">Revenue</th>
                                      <th className="text-right px-4 py-2 font-medium">Volume (t)</th>
                                      <th className="text-right px-4 py-2 font-medium">Shipments</th>
                                      <th className="text-right px-4 py-2 font-medium">Avg Lot</th>
                                      <th className="text-right px-4 py-2 font-medium">Avg USD/kg</th>
                                      <th className="text-right px-4 py-2 font-medium">First Delivery</th>
                                      <th className="text-right px-4 py-2 font-medium">Last Delivery</th>
                                      <th className="text-right px-4 py-2 font-medium">Days Ago</th>
                                      <th className="text-right px-4 py-2 font-medium">Trend</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {s.minerals.map((m) => {
                                      const mRecency =
                                        m.daysSinceLast <= 30 ? 'text-emerald-400'
                                        : m.daysSinceLast <= 90 ? 'text-amber-400'
                                        : m.daysSinceLast <= 180 ? 'text-orange-400'
                                        : 'text-red-400'
                                      const trendIcon =
                                        m.trend === 'growing' ? <span className="text-emerald-400">↑</span>
                                        : m.trend === 'falling' ? <span className="text-red-400">↓</span>
                                        : <span className="text-zinc-600">→</span>
                                      return (
                                        <tr key={m.mineral} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                                          <td className="pl-12 pr-4 py-2">
                                            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-medium">{m.mineral}</span>
                                          </td>
                                          <td className="px-4 py-2 text-right text-zinc-300 tabular-nums font-medium">{fmtUsd(m.totalUsd)}</td>
                                          <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtTons(m.totalTons)}</td>
                                          <td className="px-4 py-2 text-right text-zinc-500">{m.shipmentCount}</td>
                                          <td className="px-4 py-2 text-right text-zinc-500 tabular-nums">{m.avgTonsPerShipment.toFixed(2)}t</td>
                                          <td className="px-4 py-2 text-right text-zinc-500 tabular-nums">${m.avgUsdPerKg.toFixed(3)}</td>
                                          <td className="px-4 py-2 text-right text-zinc-600">{m.firstDelivery}</td>
                                          <td className="px-4 py-2 text-right text-zinc-400">{m.lastDelivery}</td>
                                          <td className={cn('px-4 py-2 text-right tabular-nums font-medium', mRecency)}>{m.daysSinceLast}d</td>
                                          <td className="px-4 py-2 text-right text-base">{trendIcon}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                  {/* Supplier subtotal */}
                                  <tfoot>
                                    <tr className="border-t border-zinc-700 bg-zinc-800/30">
                                      <td className="pl-12 pr-4 py-2 text-zinc-400 font-semibold">Total</td>
                                      <td className="px-4 py-2 text-right text-zinc-200 tabular-nums font-bold">{fmtUsd(s.totalUsd)}</td>
                                      <td className="px-4 py-2 text-right text-zinc-300 tabular-nums font-semibold">{fmtTons(s.totalTons)}</td>
                                      <td className="px-4 py-2 text-right text-zinc-400 font-semibold">{s.shipmentCount}</td>
                                      <td colSpan={6} />
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {rows.length === 0 && (
                        <div className="px-5 py-6 text-zinc-600 text-sm">No suppliers match your search.</div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Lot size + Aduana */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Lot Size Distribution</h3>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={profile.lotSizeDistribution} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fill: CHART_THEME.text, fontSize: 9 }} tickLine={false} />
                    <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                    <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} />
                    <Bar dataKey="count" fill={COLORS[4]} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Customs Post Usage</h3>
                <div className="space-y-2">
                  {profile.aduanaUsage.slice(0, 6).map((a) => (
                    <div key={a.aduana} className="flex items-center gap-2">
                      <span className="text-xs text-zinc-300 flex-1 truncate">{a.aduana || '—'}</span>
                      <div className="w-20 h-1.5 rounded-full bg-zinc-800">
                        <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${Math.min(a.share, 100)}%` }} />
                      </div>
                      <span className="text-xs text-zinc-500 w-10 text-right">{a.share.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
