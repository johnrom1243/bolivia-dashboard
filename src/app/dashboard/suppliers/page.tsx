'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { ExportButton } from '@/components/ExportButton'
import { InfoTooltip } from '@/components/InfoTooltip'
import { G } from '@/lib/glossary'
import { fmtUsd, fmtTons, fmtNum, cn, mineralColor } from '@/lib/utils'
import type { SupplierProfile, BuyerRelationship } from '@/types/data'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, LineChart, Line, Legend, PieChart, Pie, Cell, Area, AreaChart,
  COLORS, CHART_THEME,
} from '@/components/charts'

function fmtK(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

// ─── Tab types ──────────────────────────────────────────────────────────────
type Tab = 'overview' | 'buyers' | 'minerals' | 'price' | 'timeline' | 'transactions'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'buyers', label: 'Buyers' },
  { id: 'minerals', label: 'Minerals' },
  { id: 'price', label: 'Price Analysis' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'transactions', label: 'Transactions' },
]

// ─── Status badge helpers ────────────────────────────────────────────────────
function statusColor(status: BuyerRelationship['status']) {
  switch (status) {
    case 'Active': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    case 'New': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'Declining': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    case 'Dormant': return 'bg-red-500/20 text-red-400 border-red-500/30'
  }
}

function trendIcon(trend: BuyerRelationship['trend']) {
  if (trend === 'growing') return <span className="text-emerald-400 font-bold">▲</span>
  if (trend === 'declining') return <span className="text-red-400 font-bold">▼</span>
  return <span className="text-zinc-500">—</span>
}

// ─── KPI card ────────────────────────────────────────────────────────────────
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

// ─── Main page ──────────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const { queryString } = useFilters()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string>('')
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [expandedBuyer, setExpandedBuyer] = useState<string | null>(null)
  const [priceMineral, setPriceMineral] = useState<string>('')
  const [timelineMetric, setTimelineMetric] = useState<'usd' | 'tons'>('usd')
  const [txSort, setTxSort] = useState<{ col: string; dir: 1 | -1 }>({ col: 'date', dir: -1 })

  const { data: list } = useQuery<{ name: string; tons: number; usd: number; shipments: number }[]>({
    queryKey: ['suppliers-list', queryString],
    queryFn: () => fetch(`/api/data/suppliers${queryString}`).then((r) => r.json()),
  })

  const { data: profile, isLoading } = useQuery<SupplierProfile | null>({
    queryKey: ['supplier-profile', selected, queryString],
    queryFn: () =>
      fetch(`/api/data/suppliers?supplier=${encodeURIComponent(selected)}${queryString.replace('?', '&')}`).then((r) => r.json()),
    enabled: !!selected,
  })

  const filteredList = (list ?? []).filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()),
  )

  const healthColor = (score: number) =>
    score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400'

  const daysColor = (days: number) =>
    days < 30 ? 'text-emerald-400' : days < 90 ? 'text-amber-400' : 'text-red-400'

  // Derived from profile
  const statusCounts = profile
    ? {
        Active: profile.buyerRelationships.filter((b) => b.status === 'Active').length,
        New: profile.buyerRelationships.filter((b) => b.status === 'New').length,
        Declining: profile.buyerRelationships.filter((b) => b.status === 'Declining').length,
        Dormant: profile.buyerRelationships.filter((b) => b.status === 'Dormant').length,
      }
    : null

  const selectedPriceData =
    profile?.priceVsMarketByMineral.find((p) => p.mineral === priceMineral)?.data ??
    profile?.priceVsMarketByMineral[0]?.data ??
    []
  const selectedPriceMineral =
    priceMineral || profile?.priceVsMarketByMineral[0]?.mineral || ''

  // Tx sort
  const sortedTx = profile
    ? [...profile.recentTransactions].sort((a, b) => {
        const av = (a as Record<string, unknown>)[txSort.col]
        const bv = (b as Record<string, unknown>)[txSort.col]
        if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * txSort.dir
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * txSort.dir
        return 0
      })
    : []

  function toggleTxSort(col: string) {
    setTxSort((s) => ({ col, dir: s.col === col ? (-s.dir as 1 | -1) : -1 }))
  }

  return (
    <div className="flex gap-4 h-full">
      {/* ── Left: supplier list ── */}
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
              onClick={() => { setSelected(s.name); setActiveTab('overview') }}
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

      {/* ── Right: profile ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!selected && (
          <div className="flex items-center justify-center h-64 text-zinc-600 text-sm">
            Select a supplier to view their 360° profile
          </div>
        )}

        {selected && isLoading && (
          <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">Loading…</div>
        )}

        {profile && (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header row */}
            <div className="flex items-start justify-between mb-3 flex-shrink-0">
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
                  {/* 6 KPI cards */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <KpiCard label="Total USD" value={fmtUsd(profile.totalUsd)} info={G.totalUsd} />
                    <KpiCard label="Total Tons" value={fmtTons(profile.totalTons)} info={G.totalTons} />
                    <KpiCard label="Total Shipments" value={fmtNum(profile.totalShipments)} info={G.totalShipments} />
                    <KpiCard
                      label="Health Score"
                      value={profile.healthScore.toString()}
                      sub={`${profile.momentumUsd > 0 ? '+' : ''}${profile.momentumUsd.toFixed(1)}% 90d momentum`}
                      valueClass={healthColor(profile.healthScore)}
                      info={G.healthScore}
                    />
                    <KpiCard
                      label="Days Since Last"
                      value={fmtNum(profile.daysSinceLast)}
                      sub="days"
                      valueClass={daysColor(profile.daysSinceLast)}
                      info={G.daysSinceLast}
                    />
                    <KpiCard
                      label="Avg Days Between Shipments"
                      value={fmtNum(profile.avgDaysBetweenShipments)}
                      sub="days cadence"
                      info={G.avgDaysBetweenShipments}
                    />
                  </div>

                  {/* ── Company Intelligence ── */}
                  <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
                    <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Company Intelligence</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <div className="text-zinc-500 mb-0.5">First Export</div>
                        <div className="text-zinc-200 font-medium">{profile.firstShipment}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 mb-0.5">Last Export</div>
                        <div className={cn('font-medium', daysColor(profile.daysSinceLast))}>{profile.lastShipment}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 mb-0.5">Active Since</div>
                        <div className="text-zinc-200 font-medium">{Math.round((new Date(profile.lastShipment).getTime() - new Date(profile.firstShipment).getTime()) / (86400000 * 30))} months</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 mb-0.5">Peak Quarter</div>
                        <div className="text-zinc-200 font-medium">{profile.peakQuarter}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 mb-0.5">Top Buyer</div>
                        <div className="text-zinc-200 font-medium truncate">{profile.buyerShares[0]?.buyer ?? '—'}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 mb-0.5">Top Mineral</div>
                        <div className="text-zinc-200 font-medium">{profile.mineralMix[0]?.mineral ?? '—'}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 mb-0.5">Avg Cadence</div>
                        <div className="text-zinc-200 font-medium">{profile.avgDaysBetweenShipments}d between shipments</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 mb-0.5">Status</div>
                        <div className={cn('font-semibold', profile.daysSinceLast < 90 ? 'text-emerald-400' : profile.daysSinceLast < 180 ? 'text-amber-400' : 'text-red-400')}>
                          {profile.daysSinceLast < 90 ? 'Active' : profile.daysSinceLast < 180 ? 'At Risk' : 'Dormant'}
                          {' '}· {profile.daysSinceLast}d since last export
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Buyer share + mineral mix */}
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
                          <Tooltip
                            contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                            formatter={(v: number) => fmtUsd(v)}
                          />
                          <Bar dataKey="usd" fill={COLORS[0]} radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-white mb-3">Mineral Mix</h3>
                      <ResponsiveContainer width="100%" height={140}>
                        <PieChart>
                          <Pie
                            data={profile.mineralMix}
                            dataKey="tons"
                            nameKey="mineral"
                            cx="50%"
                            cy="50%"
                            outerRadius={60}
                          >
                            {profile.mineralMix.map((m, i) => (
                              <Cell key={i} fill={mineralColor(m.mineral)} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                            formatter={(v: number) => fmtTons(v)}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1 mt-2">
                        {profile.mineralMix.map((m) => (
                          <div key={m.mineral} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full inline-block" style={{ background: mineralColor(m.mineral) }} />
                              <span className="text-zinc-300">{m.mineral}</span>
                            </span>
                            <div className="flex gap-3 tabular-nums text-zinc-400">
                              <span>{m.share.toFixed(1)}%</span>
                              <span>{fmtTons(m.tons)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Seasonal pattern */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Seasonal Pattern (avg tons/month)</h3>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={profile.seasonalPattern} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                        <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                          formatter={(v: number) => v.toFixed(1) + ' t'}
                        />
                        <Bar dataKey="avgTons" fill={COLORS[3]} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}

              {/* ══ BUYERS TAB ══ */}
              {activeTab === 'buyers' && (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-white">
                      Buyer Relationships — {profile.buyerRelationships.length} buyers
                    </h2>
                  </div>

                  {/* Summary status row */}
                  {statusCounts && (
                    <div className="flex gap-3">
                      {(['Active', 'New', 'Declining', 'Dormant'] as const).map((s) => (
                        <div key={s} className={cn('px-3 py-1.5 rounded-lg border text-xs font-medium', statusColor(s))}>
                          {statusCounts[s]} {s}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Buyer cards */}
                  <div className="space-y-2">
                    {profile.buyerRelationships.map((b) => (

                      <div key={b.buyer} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                        {/* Header row */}
                        <button
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/40 transition-colors text-left"
                          onClick={() => setExpandedBuyer(expandedBuyer === b.buyer ? null : b.buyer)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-white truncate">{b.buyer}</span>
                              <span className={cn('px-2 py-0.5 rounded border text-xs', statusColor(b.status))}>{b.status}</span>
                              <span>{trendIcon(b.trend)}</span>
                            </div>
                            <div className="flex gap-4 mt-1 text-xs text-zinc-500 flex-wrap items-center">
                              <span>{fmtUsd(b.usd)}</span>
                              <span>{fmtTons(b.tons)}</span>
                              <span className="flex items-center gap-0.5">
                                Share: {b.share.toFixed(1)}%
                                <InfoTooltip term="Supplier Share" what="This buyer's share of this supplier's total revenue. How important is this buyer to the supplier?" calc="Buyer USD ÷ Supplier total USD × 100" />
                              </span>
                              <span className="flex items-center gap-0.5">
                                Wallet: {b.shareOfWallet.toFixed(1)}%
                                <InfoTooltip {...G.shareOfWallet} />
                              </span>
                              <span className="flex items-center gap-0.5">
                                {b.daysSinceLast}d ago
                                <InfoTooltip {...G.daysSinceLast} />
                              </span>
                              <span>Since {b.firstDate}</span>
                              <span>{b.shipmentCount} shipments</span>
                            </div>
                          </div>
                          <span className="text-zinc-600 text-xs ml-2">{expandedBuyer === b.buyer ? '▲' : '▼'}</span>
                        </button>

                        {/* Expanded mineral breakdown */}
                        {expandedBuyer === b.buyer && b.minerals.length > 0 && (
                          <div className="border-t border-zinc-800 px-4 py-3">
                            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Mineral Breakdown</div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-zinc-500 border-b border-zinc-800">
                                  <th className="text-left py-1.5 font-medium">Mineral</th>
                                  <th className="text-right py-1.5 font-medium">Tons</th>
                                  <th className="text-right py-1.5 font-medium">USD</th>
                                  <th className="text-right py-1.5 font-medium">Avg $/kg</th>
                                  <th className="text-right py-1.5 font-medium">Shipments</th>
                                  <th className="text-right py-1.5 font-medium">First</th>
                                  <th className="text-right py-1.5 font-medium">Last</th>
                                </tr>
                              </thead>
                              <tbody>
                                {b.minerals.map((m) => (
                                  <tr key={m.mineral} className="border-b border-zinc-800/50">
                                    <td className="py-1.5 flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: mineralColor(m.mineral) }} />
                                      <span className="text-zinc-300">{m.mineral}</span>
                                    </td>
                                    <td className="text-right text-zinc-400 tabular-nums">{fmtTons(m.tons)}</td>
                                    <td className="text-right text-zinc-400 tabular-nums">{fmtUsd(m.usd)}</td>
                                    <td className="text-right text-zinc-400 tabular-nums">${m.avgUsdPerKg.toFixed(2)}</td>
                                    <td className="text-right text-zinc-400 tabular-nums">{m.shipmentCount}</td>
                                    <td className="text-right text-zinc-500">{m.firstDate}</td>
                                    <td className="text-right text-zinc-500">{m.lastDate}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* ── Monthly Buyer Breakdown ── */}
                  {profile.monthlyBuyerTimeline && profile.monthlyBuyerTimeline.months.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-zinc-800">
                        <h3 className="text-sm font-semibold text-white">Monthly Buyer Breakdown</h3>
                        <p className="text-xs text-zinc-500 mt-0.5">USD shipped to each buyer per month — scroll right for full history</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="text-xs min-w-full">
                          <thead>
                            <tr className="border-b border-zinc-800 text-zinc-500">
                              <th className="sticky left-0 bg-zinc-900 text-left px-4 py-2.5 font-medium w-24 z-10">Month</th>
                              {profile.monthlyBuyerTimeline.buyers.map((b) => (
                                <th key={b} className="text-right px-3 py-2.5 font-medium whitespace-nowrap max-w-[120px] truncate" title={b}>
                                  {b.length > 18 ? b.slice(0, 16) + '…' : b}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[...profile.monthlyBuyerTimeline.rows].reverse().map((row) => {
                              const total = profile.monthlyBuyerTimeline.buyers.reduce((s, b) => s + (Number(row[b]) || 0), 0)
                              return (
                                <tr key={row.month} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                                  <td className="sticky left-0 bg-zinc-900 px-4 py-2 font-medium text-zinc-300 w-24 z-10">{String(row.month)}</td>
                                  {profile.monthlyBuyerTimeline.buyers.map((b) => {
                                    const v = Number(row[b]) || 0
                                    const pct = total > 0 ? v / total : 0
                                    return (
                                      <td key={b} className="px-3 py-2 text-right tabular-nums">
                                        {v > 0 ? (
                                          <div>
                                            <div className="text-zinc-200">{fmtK(v)}</div>
                                            <div className="text-zinc-600 text-[10px]">{(pct * 100).toFixed(0)}%</div>
                                          </div>
                                        ) : (
                                          <span className="text-zinc-800">—</span>
                                        )}
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ── Competitor Intelligence ── */}
                  {profile.competitorPresence && profile.competitorPresence.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-white mb-1">Competitor Intelligence</h3>
                      <p className="text-xs text-zinc-500 mb-3">Other suppliers who also ship to this supplier's key buyers</p>
                      <div className="space-y-3">
                        {profile.competitorPresence.map((cp) => (
                          <div key={cp.buyer}>
                            <div className="text-xs font-semibold text-zinc-300 mb-1.5">{cp.buyer}</div>
                            <div className="flex flex-wrap gap-1.5">
                              {cp.otherSuppliers.map((s) => (
                                <span key={s} className="px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs">{s}</span>
                              ))}
                              {cp.otherSuppliers.length === 0 && (
                                <span className="text-zinc-600 text-xs italic">No other known suppliers</span>
                              )}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {profile.mineralMix.map((m) => (
                    <div key={m.mineral} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-3 h-3 rounded-full" style={{ background: mineralColor(m.mineral) }} />
                        <span className="text-sm font-semibold text-white">{m.mineral}</span>
                        <span className="ml-auto text-xs text-zinc-500">{m.share.toFixed(1)}% of volume</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-zinc-500">Total Tons</div>
                          <div className="text-zinc-200 font-medium">{fmtTons(m.tons)}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Total USD</div>
                          <div className="text-zinc-200 font-medium">{fmtUsd(m.usd)}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Avg Price/kg</div>
                          <div className="text-zinc-200 font-medium">${m.avgPriceKg.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Market Avg/kg</div>
                          <div className="text-zinc-200 font-medium">${m.marketAvgPriceKg.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="flex items-center text-zinc-500">vs Market <InfoTooltip {...G.premiumPct} /></div>
                          <div className={cn('font-medium', m.premiumPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {m.premiumPct >= 0 ? '+' : ''}{m.premiumPct.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Shipments</div>
                          <div className="text-zinc-200 font-medium">{m.shipmentCount}</div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="text-xs text-zinc-500 mb-1">Buyers</div>
                        <div className="flex flex-wrap gap-1">
                          {m.buyers.map((b) => (
                            <span key={b} className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded text-xs">{b}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ══ PRICE ANALYSIS TAB ══ */}
              {activeTab === 'price' && (
                <>
                  {/* Mineral sub-tabs */}
                  {profile.priceVsMarketByMineral.length > 1 && (
                    <div className="flex gap-1 flex-wrap">
                      {profile.priceVsMarketByMineral.map((p) => (
                        <button
                          key={p.mineral}
                          onClick={() => setPriceMineral(p.mineral)}
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                            (priceMineral || profile.priceVsMarketByMineral[0]?.mineral) === p.mineral
                              ? 'border-blue-500 bg-blue-900/30 text-blue-300'
                              : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600',
                          )}
                        >
                          {p.mineral}
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedPriceData.length > 0 ? (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-white mb-1">
                        Price vs Market — {selectedPriceMineral} (USD/kg)
                      </h3>
                      <p className="text-xs text-zinc-500 mb-3">Monthly average price comparison</p>
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={selectedPriceData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                          <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                          <Tooltip
                            contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                            formatter={(v: number) => `$${v.toFixed(3)}/kg`}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="supplierPrice" stroke={COLORS[0]} name="Supplier" dot={false} strokeWidth={2} />
                          <Line type="monotone" dataKey="marketPrice" stroke={COLORS[2]} name="Market Avg" dot={false} strokeDasharray="4 4" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-zinc-600 text-sm py-8 text-center">No price data available</div>
                  )}
                </>
              )}

              {/* ══ TIMELINE TAB ══ */}
              {activeTab === 'timeline' && (
                <>
                  {/* Monthly area chart */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white">Monthly Volume</h3>
                      <div className="flex gap-1">
                        {(['usd', 'tons'] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setTimelineMetric(m)}
                            className={cn(
                              'px-3 py-1 rounded text-xs font-medium transition-all',
                              timelineMetric === m ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700',
                            )}
                          >
                            {m.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={profile.monthlyTimeline} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                        <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false}
                          tickFormatter={(v) => timelineMetric === 'usd' ? `$${(v / 1000).toFixed(0)}k` : `${v}t`}
                        />
                        <Tooltip
                          contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                          formatter={(v: number) => timelineMetric === 'usd' ? fmtUsd(v) : fmtTons(v)}
                        />
                        <Area
                          type="monotone"
                          dataKey={timelineMetric}
                          stroke={COLORS[0]}
                          fill="url(#areaGrad)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Activity heatmap */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Activity Heatmap</h3>
                    <ActivityHeatmap data={profile.activityHeatmap} />
                  </div>
                </>
              )}

              {/* ══ TRANSACTIONS TAB ══ */}
              {activeTab === 'transactions' && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-800">
                    <h3 className="text-sm font-semibold text-white">Recent Transactions (last {sortedTx.length})</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-500">
                          {[
                            { col: 'date', label: 'Date' },
                            { col: 'buyer', label: 'Buyer' },
                            { col: 'mineral', label: 'Mineral' },
                            { col: 'tons', label: 'Tons' },
                            { col: 'usd', label: 'USD' },
                            { col: 'usdPerKg', label: 'USD/kg' },
                            { col: 'aduana', label: 'Customs Post' },
                          ].map(({ col, label }) => (
                            <th
                              key={col}
                              className="text-left px-4 py-3 font-medium cursor-pointer hover:text-zinc-300 select-none"
                              onClick={() => toggleTxSort(col)}
                            >
                              {label}
                              {txSort.col === col && (
                                <span className="ml-1">{txSort.dir === -1 ? '↓' : '↑'}</span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTx.map((tx, i) => (
                          <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                            <td className="px-4 py-2 text-zinc-400 tabular-nums">{tx.date}</td>
                            <td className="px-4 py-2 text-zinc-300 font-medium">{tx.buyer}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: mineralColor(tx.mineral) }} />
                                <span className="text-zinc-400">{tx.mineral}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtTons(tx.tons)}</td>
                            <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtUsd(tx.usd)}</td>
                            <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">${tx.usdPerKg.toFixed(2)}</td>
                            <td className="px-4 py-2 text-zinc-500">{tx.aduana || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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

// ─── Activity heatmap component ──────────────────────────────────────────────
function ActivityHeatmap({ data }: { data: { year: number; month: number; count: number; tons: number }[] }) {
  if (!data.length) return <div className="text-zinc-600 text-sm py-4 text-center">No data</div>

  const years = [...new Set(data.map((d) => d.year))].sort()
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  // Build lookup
  const lookup: Record<string, number> = {}
  let maxCount = 0
  for (const d of data) {
    lookup[`${d.year}-${d.month}`] = d.count
    if (d.count > maxCount) maxCount = d.count
  }

  function cellColor(count: number): string {
    if (!count) return '#18181b'
    const intensity = Math.min(count / maxCount, 1)
    const alpha = Math.round(intensity * 255).toString(16).padStart(2, '0')
    return `#3B82F6${alpha}`
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="w-10 text-zinc-600 font-normal" />
            {MONTHS_SHORT.map((m) => (
              <th key={m} className="px-1 py-1 text-zinc-600 font-normal text-center w-10">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year}>
              <td className="text-zinc-500 pr-2 text-right">{year}</td>
              {MONTHS_SHORT.map((_, mi) => {
                const count = lookup[`${year}-${mi + 1}`] ?? 0
                return (
                  <td key={mi} className="p-0.5">
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center text-xs font-medium"
                      style={{ background: cellColor(count), color: count > maxCount * 0.5 ? '#fff' : '#71717a' }}
                      title={`${year}-${MONTHS_SHORT[mi]}: ${count} shipments`}
                    >
                      {count || ''}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-zinc-600">Less</span>
        {[0.1, 0.3, 0.5, 0.7, 1].map((v) => (
          <div key={v} className="w-4 h-4 rounded" style={{ background: `#3B82F6${Math.round(v * 255).toString(16).padStart(2, '0')}` }} />
        ))}
        <span className="text-xs text-zinc-600">More</span>
      </div>
    </div>
  )
}
