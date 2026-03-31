'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { ExportButton } from '@/components/ExportButton'
import { InfoTooltip } from '@/components/InfoTooltip'
import { G } from '@/lib/glossary'
import { fmtUsd, fmtTons, fmtNum, cn, mineralColor } from '@/lib/utils'
import type { TraderProfile } from '@/types/data'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, LineChart, Line, Legend, Cell, AreaChart, Area,
  COLORS, CHART_THEME,
} from '@/components/charts'
import { ComposedChart } from 'recharts'

// ─── Tab types ──────────────────────────────────────────────────────────────
type Tab = 'overview' | 'suppliers' | 'minerals' | 'prices' | 'market' | 'timeline' | 'transactions'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'minerals', label: 'Minerals' },
  { id: 'prices', label: 'Prices' },
  { id: 'market', label: 'vs Market' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'transactions', label: 'Transactions' },
]

// ─── Status helpers ──────────────────────────────────────────────────────────
function statusBadge(status: 'Active' | 'New' | 'At-risk' | 'Dormant') {
  const cls: Record<string, string> = {
    Active: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    New: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    'At-risk': 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    Dormant: 'bg-red-500/20 text-red-400 border border-red-500/30',
  }
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', cls[status])}>
      {status}
    </span>
  )
}

function KpiCard({ label, value, sub, valueClass, info }: {
  label: string; value: string; sub?: string; valueClass?: string
  info?: { term: string; what: string; calc?: string }
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center text-xs text-zinc-500 mb-1">
        {label}
        {info && <InfoTooltip {...info} />}
      </div>
      <div className={cn('text-xl font-bold', valueClass ?? 'text-white')}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  )
}

const PENFOLD_NAMES = ['PENFOLD', 'PENFOLD COMMODITIES', 'PENFOLDS']

// ─── Main page ──────────────────────────────────────────────────────────────
export default function BuyersPage() {
  const { queryString } = useFilters()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string>('')
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [activeMineral, setActiveMineral] = useState<string>('')
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set())
  const [smSort, setSmSort] = useState<'date' | 'value' | 'volume'>('date')
  const [smSearch, setSmSearch] = useState('')
  const [timelineMetric, setTimelineMetric] = useState<'usd' | 'tons'>('usd')
  const [txSort, setTxSort] = useState<{ col: string; dir: 1 | -1 }>({ col: 'date', dir: -1 })

  const { data: list } = useQuery<{ name: string; tons: number; usd: number; shipments: number }[]>({
    queryKey: ['buyers-list', queryString],
    queryFn: () => fetch(`/api/data/buyers${queryString}`).then((r) => r.json()),
  })

  const { data: profile, isLoading } = useQuery<TraderProfile | null>({
    queryKey: ['buyer-profile', selected, queryString],
    queryFn: () =>
      fetch(`/api/data/buyers?buyer=${encodeURIComponent(selected)}${queryString.replace('?', '&')}`).then((r) => r.json()),
    enabled: !!selected,
  })

  const filteredList = (list ?? []).filter((b) =>
    !search || b.name.toLowerCase().includes(search.toLowerCase()),
  )

  const isPenfold = selected ? PENFOLD_NAMES.some((n) => selected.toUpperCase().includes(n)) : false

  const daysColor = (days: number) =>
    days < 30 ? 'text-emerald-400' : days < 90 ? 'text-amber-400' : 'text-red-400'

  const minerals = profile ? [...new Set(profile.priceVsMarket.map((p) => p.mineral))] : []
  const selectedMineral = activeMineral || minerals[0] || ''
  const priceData = profile
    ? profile.priceVsMarket
        .filter((p) => !selectedMineral || p.mineral === selectedMineral)
        .reduce<Record<string, { date: string; traderPrice: number; marketPrice: number }>>((acc, p) => {
          acc[p.date] = { date: p.date, traderPrice: p.traderPrice, marketPrice: p.marketPrice }
          return acc
        }, {})
    : {}
  const priceChartData = Object.values(priceData).sort((a, b) => a.date.localeCompare(b.date))

  function toggleTxSort(col: string) {
    setTxSort((s) => ({ col, dir: s.col === col ? (-s.dir as 1 | -1) : -1 }))
  }

  const sortedTx = profile
    ? [...profile.recentTransactions].sort((a, b) => {
        const av = (a as Record<string, unknown>)[txSort.col]
        const bv = (b as Record<string, unknown>)[txSort.col]
        if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * txSort.dir
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * txSort.dir
        return 0
      })
    : []

  function thBtn(col: string, label: string) {
    return (
      <th
        className="text-right px-4 py-3 font-medium cursor-pointer hover:text-zinc-200 select-none"
        onClick={() => toggleTxSort(col)}
      >
        {label}{txSort.col === col ? (txSort.dir === -1 ? ' ↓' : ' ↑') : ''}
      </th>
    )
  }

  const concentrationColor = (pct: number) =>
    pct > 70 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="flex gap-4 h-full">
      {/* ── Left: buyer list ── */}
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
              onClick={() => { setSelected(b.name); setActiveTab('overview'); setActiveMineral('') }}
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

      {/* ── Right: profile ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!selected && (
          <div className="flex items-center justify-center h-64 text-zinc-600 text-sm">
            Select a buyer (trader) to view their full profile
          </div>
        )}

        {selected && isLoading && (
          <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">Loading…</div>
        )}

        {profile && (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between mb-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-white">{profile.name}</h1>
                    {isPenfold && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs font-medium">
                        ★ Your Company
                      </span>
                    )}
                  </div>
                  <p className="text-zinc-400 text-sm mt-1">
                    {profile.firstShipment} → {profile.lastShipment} · {profile.totalShipments} shipments
                  </p>
                </div>
              </div>
              <ExportButton
                url={`/api/export?type=buyer&buyer=${encodeURIComponent(selected)}${queryString.replace('?', '&')}`}
                label="Export"
                filename={`buyer_${selected}.xlsx`}
              />
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 mb-4 flex-shrink-0 border-b border-zinc-800 pb-0">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'px-4 py-2 text-xs font-medium rounded-t-lg transition-all border-b-2 -mb-px',
                    activeTab === tab.id
                      ? 'text-white border-blue-500 bg-zinc-900'
                      : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:border-zinc-600',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto space-y-4 pb-4">

              {/* ══ OVERVIEW TAB ══ */}
              {activeTab === 'overview' && (
                <>
                  {/* 8 KPI cards */}
                  <div className="grid grid-cols-4 gap-3">
                    <KpiCard label="Total USD" value={fmtUsd(profile.totalUsd)} info={G.totalUsd} />
                    <KpiCard label="Total Tons" value={fmtTons(profile.totalTons)} info={G.totalTons} />
                    <KpiCard label="Total Shipments" value={fmtNum(profile.totalShipments)} info={G.totalShipments} />
                    <KpiCard
                      label="Avg Shipment USD"
                      value={fmtUsd(profile.totalUsd / Math.max(profile.totalShipments, 1))}
                      info={G.avgShipment}
                    />
                    <KpiCard
                      label="Market Share"
                      value={`${profile.marketSharePct.toFixed(2)}%`}
                      sub={`#${profile.marketShareRank} of ${profile.totalBuyersInMarket} buyers`}
                      info={G.marketSharePct}
                    />
                    <KpiCard
                      label="Unique Suppliers"
                      value={fmtNum(profile.uniqueSuppliers)}
                      info={G.uniqueSuppliers}
                    />
                    <KpiCard
                      label="Avg Price / kg"
                      value={`$${profile.avgPriceKg.toFixed(3)}`}
                      info={G.avgPriceKg}
                    />
                    <KpiCard
                      label="Days Since Last"
                      value={fmtNum(profile.daysSinceLast)}
                      sub="days"
                      valueClass={daysColor(profile.daysSinceLast)}
                      info={G.daysSinceLast}
                    />
                  </div>

                  {/* Quarterly dual-axis chart */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Quarterly Purchase Volume</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <ComposedChart data={profile.quarterlyVolume} margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="quarter" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                        <YAxis yAxisId="left" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} tickFormatter={(v: number) => fmtTons(v)} />
                        <Tooltip
                          contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                          formatter={(v: number, name: string) => name === 'USD' ? fmtUsd(v) : fmtTons(v)}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar yAxisId="left" dataKey="usd" fill={COLORS[0]} radius={[3, 3, 0, 0]} name="USD" />
                        <Line yAxisId="right" type="monotone" dataKey="tons" stroke={COLORS[2]} name="Tons" dot={false} strokeWidth={2} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Concentration Risk */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-white mb-3 flex items-center">
                        Concentration Risk <InfoTooltip {...G.concentrationRisk} />
                      </h3>
                      <p className="text-xs text-zinc-500 mb-3">Share of purchase USD by top suppliers</p>
                      {[
                        { label: 'Top-1 Supplier', value: profile.concentrationRisk.top1Share },
                        { label: 'Top-3 Suppliers', value: profile.concentrationRisk.top3Share },
                        { label: 'Top-5 Suppliers', value: profile.concentrationRisk.top5Share },
                      ].map(({ label, value }) => (
                        <div key={label} className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-zinc-400">{label}</span>
                            <span className={cn('text-xs font-medium tabular-nums',
                              value > 70 ? 'text-red-400' : value > 50 ? 'text-amber-400' : 'text-emerald-400'
                            )}>
                              {value.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-zinc-800">
                            <div
                              className={cn('h-2 rounded-full', concentrationColor(value))}
                              style={{ width: `${Math.min(value, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Supplier Status */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-white mb-3 flex items-center">
                        Supplier Status <InfoTooltip {...G.buyerStatus} />
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Active', count: profile.supplierStatusCounts.active, cls: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' },
                          { label: 'New', count: profile.supplierStatusCounts.new, cls: 'bg-blue-500/20 border-blue-500/30 text-blue-400' },
                          { label: 'At-risk', count: profile.supplierStatusCounts.atRisk, cls: 'bg-amber-500/20 border-amber-500/30 text-amber-400' },
                          { label: 'Dormant', count: profile.supplierStatusCounts.dormant, cls: 'bg-red-500/20 border-red-500/30 text-red-400' },
                        ].map(({ label, count, cls }) => (
                          <div key={label} className={cn('rounded-lg border p-3', cls)}>
                            <div className="text-2xl font-bold">{count}</div>
                            <div className="text-xs mt-0.5">{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ══ SUPPLIERS TAB ══ */}
              {activeTab === 'suppliers' && profile.supplierMineralBreakdown.length > 0 && (
                <>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Supplier Intelligence</h3>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          All suppliers — minerals delivered, value, weight, last delivery
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="flex gap-1">
                          {(['date', 'value', 'volume'] as const).map((s) => (
                            <button key={s} onClick={() => setSmSort(s)}
                              className={cn('px-2 py-1 rounded text-xs transition-colors capitalize',
                                smSort === s ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700')}>
                              {s === 'date' ? 'Recent' : s}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder="Filter suppliers…"
                          value={smSearch}
                          onChange={(e) => setSmSearch(e.target.value)}
                          className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-white text-xs placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-36"
                        />
                      </div>
                    </div>

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
                          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto] items-center px-4 py-2 text-xs text-zinc-500 font-medium border-b border-zinc-800 gap-3">
                            <span>Supplier</span>
                            <span className="text-right w-20 flex items-center justify-end gap-0.5">Status <InfoTooltip {...G.buyerStatus} /></span>
                            <span className="text-right w-28">Revenue</span>
                            <span className="text-right w-24">Volume</span>
                            <span className="text-right w-16">Ships</span>
                            <span className="text-right w-24 flex items-center justify-end gap-0.5">Wallet% <InfoTooltip {...G.shareOfWallet} /></span>
                            <span className="text-right w-24">Last Delivery</span>
                            <span className="text-right w-16 flex items-center justify-end gap-0.5">Days <InfoTooltip {...G.daysSinceLast} /></span>
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
                                <button
                                  onClick={() => setExpandedSuppliers((prev) => {
                                    const next = new Set(prev)
                                    next.has(s.supplier) ? next.delete(s.supplier) : next.add(s.supplier)
                                    return next
                                  })}
                                  className="w-full grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto] items-center px-4 py-3 text-xs gap-3 hover:bg-zinc-800/40 transition-colors text-left"
                                >
                                  <span className="flex items-center gap-2">
                                    <span className={cn('text-xs transition-transform inline-block', isExpanded ? 'rotate-90' : '')}>▶</span>
                                    <span className="text-zinc-100 font-semibold">{s.supplier}</span>
                                    <span className="text-zinc-600 text-xs">{s.minerals.length} min</span>
                                  </span>
                                  <span className="text-right w-20">{statusBadge(s.status)}</span>
                                  <span className="text-right text-zinc-300 tabular-nums font-medium w-28">{fmtUsd(s.totalUsd)}</span>
                                  <span className="text-right text-zinc-400 tabular-nums w-24">{fmtTons(s.totalTons)}</span>
                                  <span className="text-right text-zinc-500 w-16">{s.shipmentCount}</span>
                                  <span className="text-right w-24">
                                    <span className={cn('text-xs font-medium', s.shareOfWallet >= 50 ? 'text-amber-400' : 'text-zinc-400')}>
                                      {s.shareOfWallet.toFixed(1)}%
                                    </span>
                                  </span>
                                  <span className="text-right text-zinc-400 w-24">{s.lastDelivery}</span>
                                  <span className={cn('text-right font-medium tabular-nums w-16', recencyColor)}>
                                    {s.daysSinceLast}d
                                  </span>
                                </button>

                                {isExpanded && (
                                  <div className="bg-zinc-950/60 border-t border-zinc-800/40">
                                    <div className="px-10 py-2 text-xs text-zinc-500">
                                      Avg price/kg: <span className="text-zinc-300">${s.avgPriceKg.toFixed(3)}</span>
                                    </div>
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b border-zinc-800/40 text-zinc-600">
                                          <th className="text-left pl-12 pr-4 py-2 font-medium">Mineral</th>
                                          <th className="text-right px-4 py-2 font-medium">Revenue</th>
                                          <th className="text-right px-4 py-2 font-medium">Volume (t)</th>
                                          <th className="text-right px-4 py-2 font-medium">Ships</th>
                                          <th className="text-right px-4 py-2 font-medium">Avg Lot</th>
                                          <th className="text-right px-4 py-2 font-medium">USD/kg</th>
                                          <th className="text-right px-4 py-2 font-medium">Last</th>
                                          <th className="text-right px-4 py-2 font-medium">Days</th>
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
                                              <td className="px-4 py-2 text-right text-zinc-400">{m.lastDelivery}</td>
                                              <td className={cn('px-4 py-2 text-right tabular-nums font-medium', mRecency)}>{m.daysSinceLast}d</td>
                                              <td className="px-4 py-2 text-right text-base">{trendIcon}</td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                      <tfoot>
                                        <tr className="border-t border-zinc-700 bg-zinc-800/30">
                                          <td className="pl-12 pr-4 py-2 text-zinc-400 font-semibold">Total</td>
                                          <td className="px-4 py-2 text-right text-zinc-200 tabular-nums font-bold">{fmtUsd(s.totalUsd)}</td>
                                          <td className="px-4 py-2 text-right text-zinc-300 tabular-nums font-semibold">{fmtTons(s.totalTons)}</td>
                                          <td className="px-4 py-2 text-right text-zinc-400 font-semibold">{s.shipmentCount}</td>
                                          <td colSpan={5} />
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

                  {/* Supplier Acquisition Timeline */}
                  {profile.supplierAcquisitionTimeline.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-zinc-800">
                        <h3 className="text-sm font-semibold text-white">Supplier Acquisition Timeline</h3>
                        <p className="text-xs text-zinc-500 mt-0.5">When each supplier relationship started</p>
                      </div>
                      <div className="divide-y divide-zinc-800/50 max-h-64 overflow-y-auto">
                        {profile.supplierAcquisitionTimeline.map((item, i) => (
                          <div key={i} className="flex items-center justify-between px-5 py-2.5 text-xs">
                            <div className="flex items-center gap-3">
                              <span className="text-zinc-600 w-20 flex-shrink-0">{item.date}</span>
                              <span className="text-zinc-200 font-medium">{item.supplier}</span>
                            </div>
                            <div className="flex items-center gap-4 text-zinc-500">
                              <span
                                className="px-1.5 py-0.5 rounded text-xs"
                                style={{ background: mineralColor(item.mineral) + '30', color: mineralColor(item.mineral) }}
                              >
                                {item.mineral}
                              </span>
                              <span className="tabular-nums">{fmtUsd(item.firstUsd)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ══ MINERALS TAB ══ */}
              {activeTab === 'minerals' && (
                <>
                  {/* Summary bar chart */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Mineral Mix by USD</h3>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart
                        data={profile.mineralBreakdown}
                        layout="vertical"
                        margin={{ top: 0, right: 10, left: 60, bottom: 0 }}
                      >
                        <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="mineral" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} width={60} />
                        <Tooltip
                          contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                          formatter={(v: number) => fmtUsd(v)}
                        />
                        <Bar dataKey="usd" radius={[0, 3, 3, 0]}>
                          {profile.mineralBreakdown.map((m, i) => (
                            <Cell key={i} fill={mineralColor(m.mineral)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Mineral cards grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {profile.mineralBreakdown.map((m) => (
                      <div key={m.mineral} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ background: mineralColor(m.mineral) }}
                          />
                          <h4 className="text-sm font-semibold text-white">{m.mineral}</h4>
                          <span className="ml-auto text-xs text-zinc-500">{m.share.toFixed(1)}% of USD</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <div className="text-zinc-500">USD</div>
                            <div className="text-zinc-200 font-medium tabular-nums">{fmtUsd(m.usd)}</div>
                          </div>
                          <div>
                            <div className="text-zinc-500">Tons</div>
                            <div className="text-zinc-200 font-medium tabular-nums">{fmtTons(m.tons)}</div>
                          </div>
                          <div>
                            <div className="text-zinc-500">Avg Price/kg</div>
                            <div className="text-zinc-200 font-medium tabular-nums">${m.avgPriceKg.toFixed(3)}</div>
                          </div>
                          <div>
                            <div className="text-zinc-500">Market Avg/kg</div>
                            <div className="text-zinc-200 font-medium tabular-nums">${m.marketAvgPriceKg.toFixed(3)}</div>
                          </div>
                          <div>
                            <div className="text-zinc-500">Premium vs Mkt</div>
                            <div className={cn('font-medium tabular-nums', m.premiumPct > 0 ? 'text-red-400' : 'text-emerald-400')}>
                              {m.premiumPct > 0 ? '+' : ''}{m.premiumPct.toFixed(1)}%
                            </div>
                          </div>
                          <div>
                            <div className="text-zinc-500">Suppliers</div>
                            <div className="text-zinc-200 font-medium">{m.supplierCount}</div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-zinc-500">Shipments</div>
                            <div className="text-zinc-200 font-medium">{m.shipmentCount}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ══ PRICES TAB ══ */}
              {activeTab === 'prices' && (
                <>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white">Price Paid vs Market Average</h3>
                      <div className="flex gap-1">
                        {minerals.map((m) => (
                          <button key={m} onClick={() => setActiveMineral(m)}
                            className={cn('px-2 py-1 rounded text-xs transition-colors',
                              selectedMineral === m ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700')}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={priceChartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                        <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="traderPrice" stroke={COLORS[0]} name="Trader Price" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="marketPrice" stroke={COLORS[2]} name="Market Avg" dot={false} strokeDasharray="4 4" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Pricing Power by Mineral</h3>
                    <p className="text-xs text-zinc-500 mb-4">% paid vs market average (negative = pays below market = good for buyer)</p>
                    <div className="space-y-3">
                      {profile.pricingPower.map((p) => (
                        <div key={p.mineral}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-zinc-300">{p.mineral}</span>
                            <span className={cn('text-xs font-medium tabular-nums', p.premiumPct > 0 ? 'text-red-400' : 'text-emerald-400')}>
                              {p.premiumPct > 0 ? '+' : ''}{p.premiumPct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-zinc-800 relative">
                            <div
                              className={cn('h-2 rounded-full absolute', p.premiumPct > 0 ? 'bg-red-500' : 'bg-emerald-500')}
                              style={{ width: `${Math.min(Math.abs(p.premiumPct), 50)}%`, left: p.premiumPct < 0 ? `${50 - Math.min(Math.abs(p.premiumPct), 50)}%` : '50%' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ══ MARKET TAB ══ */}
              {activeTab === 'market' && (
                <>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                    <h2 className="text-base font-semibold text-white mb-4">
                      How <span className="text-blue-400">{profile.name}</span> compares to the market
                    </h2>

                    {/* Market share gauge */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-zinc-400">Market Share</span>
                        <span className="text-xs text-zinc-300 font-medium">
                          #{profile.marketShareRank} of {profile.totalBuyersInMarket} buyers — {profile.marketSharePct.toFixed(2)}%
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-zinc-800">
                        <div
                          className="h-3 rounded-full bg-blue-500"
                          style={{ width: `${Math.min(profile.marketSharePct * 5, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Supplier retention */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-zinc-400">Supplier Retention Rate (YoY)</span>
                        <span className={cn('text-xs font-medium',
                          profile.supplierRetentionRate >= 70 ? 'text-emerald-400' : profile.supplierRetentionRate >= 40 ? 'text-amber-400' : 'text-red-400'
                        )}>
                          {profile.supplierRetentionRate.toFixed(1)}% of prior-year suppliers still active
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-zinc-800">
                        <div
                          className={cn('h-3 rounded-full', profile.supplierRetentionRate >= 70 ? 'bg-emerald-500' : profile.supplierRetentionRate >= 40 ? 'bg-amber-500' : 'bg-red-500')}
                          style={{ width: `${Math.min(profile.supplierRetentionRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* YoY comparison */}
                  {profile.yoyComparison.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-zinc-800">
                        <h3 className="text-sm font-semibold text-white">Year-over-Year Comparison</h3>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-500">
                            <th className="text-left px-5 py-3 font-medium">Year</th>
                            <th className="text-right px-4 py-3 font-medium">USD</th>
                            <th className="text-right px-4 py-3 font-medium">Tons</th>
                            <th className="text-right px-4 py-3 font-medium">Shipments</th>
                            <th className="text-right px-4 py-3 font-medium">Suppliers</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profile.yoyComparison.map((y) => (
                            <tr key={y.year} className="border-b border-zinc-800/50">
                              <td className="px-5 py-2 text-zinc-300 font-medium">{y.year}</td>
                              <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtUsd(y.usd)}</td>
                              <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtTons(y.tons)}</td>
                              <td className="px-4 py-2 text-right text-zinc-400">{y.shipments}</td>
                              <td className="px-4 py-2 text-right text-zinc-400">{y.suppliers}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Seasonal buying pattern */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Seasonal Buying Pattern (avg tons/month)</h3>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={profile.seasonalPattern} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                        <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                          formatter={(v: number) => v.toFixed(1) + ' t'}
                        />
                        <Bar dataKey="avgTons" fill={COLORS[1]} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}

              {/* ══ TIMELINE TAB ══ */}
              {activeTab === 'timeline' && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    {(['usd', 'tons'] as const).map((m) => (
                      <button key={m} onClick={() => setTimelineMetric(m)}
                        className={cn('px-3 py-1 rounded text-xs transition-colors',
                          timelineMetric === m ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700')}>
                        {m === 'usd' ? 'USD' : 'Tons'}
                      </button>
                    ))}
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Monthly {timelineMetric === 'usd' ? 'USD' : 'Volume'} History</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={profile.monthlyTimeline} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: CHART_THEME.text, fontSize: 9 }} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false}
                          tickFormatter={(v: number) => timelineMetric === 'usd' ? `$${(v / 1000).toFixed(0)}k` : fmtTons(v)} />
                        <Tooltip
                          contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                          formatter={(v: number) => timelineMetric === 'usd' ? fmtUsd(v) : fmtTons(v)}
                        />
                        <Area
                          type="monotone"
                          dataKey={timelineMetric}
                          stroke={COLORS[0]}
                          fill={COLORS[0] + '33'}
                          strokeWidth={2}
                          dot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Customs post breakdown */}
                  {profile.aduanaUsage.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-white mb-3">Customs Post Usage</h3>
                      <div className="space-y-2">
                        {profile.aduanaUsage.map((a) => (
                          <div key={a.aduana} className="flex items-center gap-3">
                            <span className="text-xs text-zinc-300 w-36 truncate">{a.aduana || '—'}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-zinc-800">
                              <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${Math.min(a.share, 100)}%` }} />
                            </div>
                            <span className="text-xs text-zinc-500 w-10 text-right tabular-nums">{a.share.toFixed(0)}%</span>
                            <span className="text-xs text-zinc-600 w-16 text-right tabular-nums">{fmtTons(a.tons)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ══ TRANSACTIONS TAB ══ */}
              {activeTab === 'transactions' && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-800">
                    <h3 className="text-sm font-semibold text-white">Recent Transactions</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">Last 50 shipments — click column header to sort</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-500">
                          <th className="text-left px-4 py-3 font-medium cursor-pointer hover:text-zinc-200" onClick={() => toggleTxSort('date')}>
                            Date{txSort.col === 'date' ? (txSort.dir === -1 ? ' ↓' : ' ↑') : ''}
                          </th>
                          <th className="text-left px-4 py-3 font-medium cursor-pointer hover:text-zinc-200" onClick={() => toggleTxSort('supplier')}>
                            Supplier{txSort.col === 'supplier' ? (txSort.dir === -1 ? ' ↓' : ' ↑') : ''}
                          </th>
                          <th className="text-left px-4 py-3 font-medium">Mineral</th>
                          {thBtn('tons', 'Tons')}
                          {thBtn('usd', 'USD')}
                          {thBtn('usdPerKg', 'USD/kg')}
                          <th className="text-right px-4 py-3 font-medium">Customs Post</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTx.map((tx, i) => (
                          <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                            <td className="px-4 py-2 text-zinc-400">{tx.date}</td>
                            <td className="px-4 py-2 text-zinc-200 font-medium">{tx.supplier}</td>
                            <td className="px-4 py-2">
                              <span
                                className="px-1.5 py-0.5 rounded text-xs font-medium"
                                style={{ background: mineralColor(tx.mineral) + '30', color: mineralColor(tx.mineral) }}
                              >
                                {tx.mineral}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{tx.tons.toFixed(2)}t</td>
                            <td className="px-4 py-2 text-right text-zinc-300 tabular-nums font-medium">{fmtUsd(tx.usd)}</td>
                            <td className="px-4 py-2 text-right text-zinc-500 tabular-nums">${tx.usdPerKg.toFixed(3)}</td>
                            <td className="px-4 py-2 text-right text-zinc-500">{tx.aduana || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {sortedTx.length === 0 && (
                      <div className="px-5 py-6 text-zinc-600 text-sm">No transactions found.</div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  )
}
