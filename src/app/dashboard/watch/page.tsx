'use client'
import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { useSessionState } from '@/hooks/useSessionState'
import { Segmented } from '@/components/Segmented'
import { InfoTooltip } from '@/components/InfoTooltip'
import { G } from '@/lib/glossary'
import { fmtUsd, fmtTons, cn } from '@/lib/utils'
import { monthLabel } from '@/lib/period'
import { downloadCsv } from '@/lib/csv'
import type { WatchResult, WatchRow, WatchStatus } from '@/lib/analytics/watch'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, COLORS, CHART_THEME,
} from '@/components/charts'

const STATUS_STYLE: Record<WatchStatus, string> = {
  Lost: 'bg-red-500/15 text-red-400 border-red-500/40',
  Leaking: 'bg-orange-500/15 text-orange-400 border-orange-500/40',
  Split: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  Former: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  Dormant: 'bg-zinc-700/30 text-zinc-400 border-zinc-600',
  Exclusive: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
}
const STATUS_ORDER: WatchStatus[] = ['Lost', 'Leaking', 'Split', 'Former', 'Exclusive', 'Dormant']
const ATTENTION: WatchStatus[] = ['Lost', 'Leaking', 'Split']

type StatusFilter = 'attention' | 'all' | WatchStatus
type SortKey = 'severity' | 'compUsd' | 'penUsd' | 'shareDelta' | 'monthsSincePenfold'

const tooltipStyle = { background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8, fontSize: 12 }
const supplierHref = (s: string) => `/dashboard/suppliers?select=${encodeURIComponent(s)}`
const buyerHref = (b: string) => `/dashboard/buyers?select=${encodeURIComponent(b)}`

export default function WatchPage() {
  const { queryString } = useFilters()
  const [windowM, setWindowM] = useSessionState<number>('watch:window', 3)
  const [basis, setBasis] = useSessionState<'usd' | 'tons'>('watch:basis', 'usd')
  const [mineral, setMineral] = useSessionState<string>('watch:mineral', '')
  const [statusFilter, setStatusFilter] = useSessionState<StatusFilter>('watch:status', 'attention')
  const [search, setSearch] = useSessionState<string>('watch:search', '')
  const [sort, setSort] = useSessionState<SortKey>('watch:sort', 'severity')
  const [expanded, setExpanded] = useState<string | null>(null)

  const qs = new URLSearchParams(queryString.replace('?', ''))
  qs.set('window', String(windowM))
  qs.set('basis', basis)
  if (mineral) qs.set('mineral', mineral)

  const { data, isLoading, isError } = useQuery<WatchResult>({
    queryKey: ['watch', qs.toString()],
    queryFn: () => fetch(`/api/data/watch?${qs}`).then((r) => { if (!r.ok) throw new Error('failed'); return r.json() }),
  })

  const rows = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const filtered = data.rows.filter((r) => {
      if (statusFilter === 'attention' && !ATTENTION.includes(r.status)) return false
      if (statusFilter !== 'attention' && statusFilter !== 'all' && r.status !== statusFilter) return false
      if (q && !r.supplier.toLowerCase().includes(q) && !r.competitors.some((c) => c.buyer.toLowerCase().includes(q))) return false
      return true
    })
    const key: Record<SortKey, (r: WatchRow) => number> = {
      severity: (r) => r.severity,
      compUsd: (r) => r.compUsd,
      penUsd: (r) => r.penUsd,
      shareDelta: (r) => -(r.shareDelta ?? 0),
      monthsSincePenfold: (r) => r.monthsSincePenfold,
    }
    return [...filtered].sort((a, b) => key[sort](b) - key[sort](a))
  }, [data, statusFilter, search, sort])

  const trendLines = useMemo(() => {
    if (!data) return []
    if (mineral) return [mineral]
    return ['All minerals', ...data.byMineral.slice(0, 3).map((m) => m.mineral)]
  }, [data, mineral])

  const val = (usd: number, tons: number) => (basis === 'usd' ? fmtUsd(usd, true) : fmtTons(tons))
  const winLabel = data ? (data.window.months === 1 ? monthLabel(data.window.end) : `${monthLabel(data.window.start)} – ${monthLabel(data.window.end)}`) : ''
  const baseLabel = data ? `${monthLabel(data.baseline.start)} – ${monthLabel(data.baseline.end)}` : ''

  function exportCsv() {
    downloadCsv(`penfold_watch_${data?.refMonth ?? ''}.csv`, rows.map((r) => ({
      status: r.status, supplier: r.supplier, mineral: r.mineral,
      penfold_usd: r.penUsd, penfold_tons: r.penTons,
      competitors_usd: r.compUsd, competitors_tons: r.compTons,
      penfold_share_now_pct: r.shareNow, penfold_share_baseline_pct: r.shareBase, share_change_pts: r.shareDelta,
      last_to_penfold: r.lastPenfoldMonth, months_since_penfold: r.monthsSincePenfold,
      penfold_usd_per_kg: r.penPriceKg, competitors_usd_per_kg: r.compPriceKg, price_gap_pct: r.priceGapPct,
      competitors: r.competitors.map((c) => `${c.buyer}${c.isNew ? ' (NEW)' : ''}`).join('; '),
    })))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            Penfold Watch <InfoTooltip {...G.watchOverview} />
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Every supplier that has ever sold to Penfold, by mineral. Who is selling to competitors, and who has stopped selling to us?
          </p>
          {data && (
            <p className="text-zinc-500 text-xs mt-1">
              Window <span className="text-zinc-300">{winLabel}</span> vs baseline <span className="text-zinc-300">{baseLabel}</span> · data through {monthLabel(data.refMonth)}
            </p>
          )}
        </div>
        <button
          onClick={exportCsv}
          disabled={!rows.length}
          className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white disabled:opacity-40"
        >
          Download CSV
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Segmented
          value={windowM}
          onChange={setWindowM}
          options={[
            { value: 1, label: 'Latest month' },
            { value: 3, label: '3 months' },
            { value: 6, label: '6 months' },
            { value: 12, label: '12 months' },
          ]}
        />
        <Segmented
          value={basis}
          onChange={setBasis}
          options={[
            { value: 'usd', label: 'By USD', title: 'Shares computed on declared USD value (robust for silver/gold)' },
            { value: 'tons', label: 'By tons', title: 'Shares computed on physical tonnage' },
          ]}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search supplier or competitor…"
          className="px-3 py-1.5 w-56 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      {data && (
        <Segmented
          size="xs"
          value={mineral}
          onChange={setMineral}
          options={[{ value: '', label: 'All minerals' }, ...data.minerals.map((m) => ({ value: m, label: m }))]}
        />
      )}

      {isLoading && <div className="animate-pulse h-64 bg-zinc-900 rounded-xl" />}
      {isError && <div className="text-red-400 text-sm">Could not load Penfold Watch data.</div>}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi label="Active Penfold suppliers" value={String(data.totals.activeSuppliers)} sub="shipped anything in window" info={G.watchActive} />
            <Kpi
              label="Penfold intake"
              value={val(data.totals.penUsd, data.totals.penTons)}
              sub={deltaText(basis === 'usd' ? data.totals.penUsd : data.totals.penTons, basis === 'usd' ? data.totals.penUsdPrev : data.totals.penTonsPrev)}
              info={G.watchIntake}
            />
            <Kpi label="Went to competitors" value={val(data.totals.compUsd, data.totals.compTons)} sub="from suppliers who have sold to us" valueClass="text-amber-300" info={G.watchLeakage} />
            <StatusKpi status="Lost" count={data.statusCounts.Lost} active={statusFilter === 'Lost'} onClick={() => setStatusFilter(statusFilter === 'Lost' ? 'attention' : 'Lost')} />
            <StatusKpi status="Leaking" count={data.statusCounts.Leaking} active={statusFilter === 'Leaking'} onClick={() => setStatusFilter(statusFilter === 'Leaking' ? 'attention' : 'Leaking')} />
            <StatusKpi status="Split" count={data.statusCounts.Split} active={statusFilter === 'Split'} onClick={() => setStatusFilter(statusFilter === 'Split' ? 'attention' : 'Split')} />
          </div>

          {/* Context panels */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Panel title="Who is taking our suppliers' volume" info={G.watchCompetitors}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800">
                    <th className="text-left py-1.5 font-medium">Competitor</th>
                    <th className="text-right py-1.5 font-medium" title="Penfold suppliers they bought from in the window">Our suppliers</th>
                    <th className="text-right py-1.5 font-medium">{basis === 'usd' ? 'USD' : 'Tons'}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topCompetitors.slice(0, 10).map((c) => (
                    <tr key={c.buyer} className="border-b border-zinc-800/50">
                      <td className="py-1.5 pr-2">
                        <Link href={buyerHref(c.buyer)} className="text-zinc-200 hover:text-blue-400">{c.buyer}</Link>
                        {c.newRelationships > 0 && <span className="ml-1.5 px-1 rounded bg-blue-500/20 text-blue-300 text-[10px]">+{c.newRelationships} new</span>}
                      </td>
                      <td className="py-1.5 text-right text-zinc-300 tabular-nums">{c.suppliers}</td>
                      <td className="py-1.5 text-right text-zinc-300 tabular-nums">{val(c.usd, c.tons)}</td>
                    </tr>
                  ))}
                  {!data.topCompetitors.length && <tr><td colSpan={3} className="py-4 text-center text-zinc-600">No competitor volume in this window</td></tr>}
                </tbody>
              </table>
            </Panel>

            <Panel title="By mineral" info={G.watchByMineral}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800">
                    <th className="text-left py-1.5 font-medium">Mineral</th>
                    <th className="text-right py-1.5 font-medium">To us</th>
                    <th className="text-right py-1.5 font-medium">To others</th>
                    <th className="text-right py-1.5 font-medium" title="Penfold share of our suppliers' volume: now (baseline)">Our share</th>
                    <th className="text-right py-1.5 font-medium" title="Penfold share of the entire Bolivian market for this mineral in the window">Mkt</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byMineral.map((m) => {
                    const d = m.shareNow !== null && m.shareBase !== null ? m.shareNow - m.shareBase : null
                    return (
                      <tr key={m.mineral} className={cn('border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800/40', mineral === m.mineral && 'bg-blue-900/20')}
                        onClick={() => setMineral(mineral === m.mineral ? '' : m.mineral)}>
                        <td className="py-1.5 text-zinc-200">{m.mineral}<span className="text-zinc-600 ml-1">({m.suppliers})</span></td>
                        <td className="py-1.5 text-right tabular-nums text-zinc-300">{val(m.penUsd, m.penTons)}</td>
                        <td className="py-1.5 text-right tabular-nums text-zinc-400">{val(m.compUsd, m.compTons)}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          <span className="text-zinc-200">{m.shareNow === null ? '—' : `${m.shareNow.toFixed(0)}%`}</span>
                          {d !== null && <span className={cn('ml-1', d >= 0 ? 'text-emerald-400' : 'text-red-400')}>{d >= 0 ? '▲' : '▼'}{Math.abs(d).toFixed(0)}</span>}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-zinc-400">{m.marketShare === null ? '—' : `${m.marketShare.toFixed(1)}%`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Panel>

            <Panel title="Penfold share of Bolivian exports" info={G.watchMarketTrend}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.marketShareTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} />
                  <XAxis dataKey="month" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickFormatter={(m: string) => monthLabel(m).replace(' 20', " '")} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} unit="%" />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(m: string) => monthLabel(m)} formatter={(v: number) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {trendLines.map((k, i) => (
                    <Line key={k} type="monotone" dataKey={k} stroke={k === 'All minerals' ? '#e4e4e7' : COLORS[i % COLORS.length]} strokeWidth={k === 'All minerals' ? 2 : 1.5} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* Main table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-1.5 flex-wrap">
                <FilterChip active={statusFilter === 'attention'} onClick={() => setStatusFilter('attention')}>
                  Needs attention ({data.statusCounts.Lost + data.statusCounts.Leaking + data.statusCounts.Split})
                </FilterChip>
                {STATUS_ORDER.map((s) => (
                  <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} className={statusFilter === s ? STATUS_STYLE[s] : ''}>
                    {s} ({data.statusCounts[s]})
                  </FilterChip>
                ))}
                <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All ({data.rows.length})</FilterChip>
                <InfoTooltip {...G.watchStatus} />
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                Sort
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                  className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-zinc-300 text-xs">
                  <option value="severity">Priority</option>
                  <option value="compUsd">Most to competitors</option>
                  <option value="penUsd">Most to Penfold</option>
                  <option value="shareDelta">Biggest share drop</option>
                  <option value="monthsSincePenfold">Longest since Penfold</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800 text-left">
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Supplier</th>
                    <th className="px-3 py-2 font-medium">Mineral</th>
                    <th className="px-3 py-2 font-medium text-right">To Penfold</th>
                    <th className="px-3 py-2 font-medium text-right">To competitors</th>
                    <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Our share <InfoTooltip {...G.watchShare} /></th>
                    <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Last to us</th>
                    <th className="px-3 py-2 font-medium">Competitors in window</th>
                    <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Price gap <InfoTooltip {...G.watchPriceGap} /></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const k = `${r.supplier}|${r.mineral}`
                    const open = expanded === k
                    return (
                      <Fragment key={k}>
                        <tr onClick={() => setExpanded(open ? null : k)}
                          className={cn('border-b border-zinc-800/60 cursor-pointer hover:bg-zinc-800/40', open && 'bg-zinc-800/30')}>
                          <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                          <td className="px-3 py-2 max-w-[220px]">
                            <Link href={supplierHref(r.supplier)} onClick={(e) => e.stopPropagation()} className="text-zinc-100 font-medium hover:text-blue-400 truncate block" title={r.supplier}>
                              {r.supplier}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{r.mineral}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-zinc-200">{r.penUsd || r.penTons ? val(r.penUsd, r.penTons) : <span className="text-zinc-600">—</span>}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-amber-300/90">{r.compUsd || r.compTons ? val(r.compUsd, r.compTons) : <span className="text-zinc-600">—</span>}</td>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                            <span className="text-zinc-200">{r.shareNow === null ? '—' : `${r.shareNow.toFixed(0)}%`}</span>
                            <span className="text-zinc-600"> / {r.shareBase === null ? '—' : `${r.shareBase.toFixed(0)}%`}</span>
                            {r.shareDelta !== null && r.shareDelta !== 0 && (
                              <span className={cn('ml-1', r.shareDelta > 0 ? 'text-emerald-400' : 'text-red-400')}>
                                {r.shareDelta > 0 ? '▲' : '▼'}{Math.abs(r.shareDelta).toFixed(0)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <span className="text-zinc-300">{monthLabel(r.lastPenfoldMonth)}</span>
                            {r.monthsSincePenfold > 0 && <span className={cn('ml-1', r.monthsSincePenfold >= 6 ? 'text-red-400' : r.monthsSincePenfold >= 3 ? 'text-amber-400' : 'text-zinc-500')}>{r.monthsSincePenfold}mo</span>}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1 max-w-[210px]">
                              {r.competitors.slice(0, 2).map((c) => (
                                <span key={c.buyer} className={cn('px-1.5 py-0.5 rounded border text-[11px] truncate max-w-[200px]', c.isNew ? 'border-blue-500/50 text-blue-300 bg-blue-500/10' : 'border-zinc-700 text-zinc-400')} title={c.buyer}>
                                  {c.isNew && 'NEW · '}{c.buyer}
                                </span>
                              ))}
                              {r.competitors.length > 2 && <span className="text-zinc-500 text-[11px] self-center">+{r.competitors.length - 2}</span>}
                              {!r.competitors.length && <span className="text-zinc-600">—</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {r.priceGapPct === null ? <span className="text-zinc-600">—</span> : (
                              <span className={cn(r.priceGapPct > 5 ? 'text-red-400' : r.priceGapPct < -5 ? 'text-emerald-400' : 'text-zinc-400')}>
                                {r.priceGapPct > 0 ? '+' : ''}{r.priceGapPct.toFixed(0)}%
                              </span>
                            )}
                          </td>
                        </tr>
                        {open && (
                          <tr className="bg-zinc-950/60 border-b border-zinc-800">
                            <td colSpan={9} className="px-4 py-4">
                              {/* Pinned to the visible width so it stays readable when the table scrolls sideways */}
                              <div className="sticky left-4 max-w-[calc(100vw-540px)]">
                                <ExpandedRow row={r} basis={basis} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                  {!rows.length && (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-zinc-600">No suppliers match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Expanded detail ────────────────────────────────────────────────────────
function ExpandedRow({ row, basis }: { row: WatchRow; basis: 'usd' | 'tons' }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div>
        <div className="text-xs font-semibold text-zinc-400 mb-2">
          Last 12 months: Penfold vs competitors ({basis === 'usd' ? 'USD' : 'tons'})
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={row.monthly} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} />
            <XAxis dataKey="month" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickFormatter={(m: string) => monthLabel(m).slice(0, 3)} />
            <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickFormatter={(v: number) => (basis === 'usd' ? fmtUsd(v, true) : fmtTons(v))} width={55} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(m: string) => monthLabel(m)} formatter={(v: number) => (basis === 'usd' ? fmtUsd(v, true) : fmtTons(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="penfold" name="Penfold" stackId="a" fill="#3B82F6" />
            <Bar dataKey="competitors" name="Competitors" stackId="a" fill="#F59E0B" />
          </BarChart>
        </ResponsiveContainer>
        <div className="text-[11px] text-zinc-500 mt-2 space-x-3">
          <span>First sold to Penfold: <span className="text-zinc-300">{monthLabel(row.firstPenfoldMonth)}</span></span>
          <span>Last shipment (any buyer): <span className="text-zinc-300">{monthLabel(row.lastAnyMonth)}</span></span>
          <span>Penfold $/kg: <span className="text-zinc-300">{row.penPriceKg ? `$${row.penPriceKg}` : '—'}</span></span>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-zinc-400 mb-2">Competitors buying this supplier's {row.mineral} in the window</div>
        {row.competitors.length ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-1.5 font-medium">Buyer</th>
                <th className="text-right py-1.5 font-medium">USD</th>
                <th className="text-right py-1.5 font-medium">Tons</th>
                <th className="text-right py-1.5 font-medium">$/kg</th>
                <th className="text-right py-1.5 font-medium">Buying since</th>
              </tr>
            </thead>
            <tbody>
              {row.competitors.map((c) => (
                <tr key={c.buyer} className="border-b border-zinc-800/50">
                  <td className="py-1.5 pr-2">
                    <Link href={buyerHref(c.buyer)} className="text-zinc-200 hover:text-blue-400">{c.buyer}</Link>
                    {c.isNew && <span className="ml-1.5 px-1 rounded bg-blue-500/20 text-blue-300 text-[10px]">NEW</span>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-300">{fmtUsd(c.usd, true)}</td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-400">{fmtTons(c.tons)}</td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-400">${c.avgPriceKg}</td>
                  <td className="py-1.5 text-right text-zinc-400">{monthLabel(c.firstMonth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-zinc-600 text-xs py-4">No competitor shipments in this window.</div>
        )}
        <Link href={supplierHref(row.supplier)} className="inline-block mt-3 text-xs text-blue-400 hover:text-blue-300">
          Open full supplier deep dive ↗
        </Link>
      </div>
    </div>
  )
}

// ─── Small pieces ───────────────────────────────────────────────────────────
function deltaText(cur: number, prev: number) {
  if (!prev) return 'no prior-period volume'
  const pct = ((cur - prev) / prev) * 100
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% vs previous period`
}

function StatusBadge({ status }: { status: WatchStatus }) {
  return <span className={cn('px-2 py-0.5 rounded border text-[11px] font-medium whitespace-nowrap', STATUS_STYLE[status])}>{status}</span>
}

function Kpi({ label, value, sub, valueClass, info }: { label: string; value: string; sub?: string; valueClass?: string; info?: { term: string; what: string; calc?: string } }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center text-xs text-zinc-500 mb-1">{label}{info && <InfoTooltip {...info} />}</div>
      <div className={cn('text-xl font-bold', valueClass ?? 'text-white')}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function StatusKpi({ status, count, active, onClick }: { status: WatchStatus; count: number; active: boolean; onClick: () => void }) {
  const sub: Record<string, string> = { Lost: 'stopped selling to us', Leaking: 'our share fell 15+ pts', Split: 'selling to us and others' }
  return (
    <button onClick={onClick} className={cn('text-left bg-zinc-900 border rounded-xl p-4 transition-colors hover:border-zinc-600', active ? 'border-blue-500' : 'border-zinc-800')}>
      <div className="text-xs text-zinc-500 mb-1 flex items-center gap-1.5"><StatusBadge status={status} /></div>
      <div className={cn('text-xl font-bold', count ? STATUS_STYLE[status].split(' ').find((c) => c.startsWith('text-')) : 'text-zinc-500')}>{count}</div>
      <div className="text-[11px] text-zinc-500 mt-0.5">{sub[status]}</div>
    </button>
  )
}

function Panel({ title, info, children }: { title: string; info?: { term: string; what: string; calc?: string }; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center text-sm font-semibold text-zinc-200 mb-3">{title}{info && <InfoTooltip {...info} />}</div>
      {children}
    </div>
  )
}

function FilterChip({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button onClick={onClick}
      className={cn('px-2.5 py-1 rounded-md border text-xs transition-colors',
        active ? 'bg-blue-600 border-blue-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600',
        className)}>
      {children}
    </button>
  )
}
