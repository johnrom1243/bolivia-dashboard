'use client'
import { useMemo } from 'react'
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
import type { WinsResult, WinOrigin } from '@/lib/analytics/wins'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, CHART_THEME,
} from '@/components/charts'

const ORIGIN_STYLE: Record<WinOrigin, string> = {
  'From Penfold': 'bg-red-500/15 text-red-400 border-red-500/40',
  'New exporter': 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  'New mineral': 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
  Returning: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  Switched: 'bg-zinc-700/30 text-zinc-300 border-zinc-600',
}
const ORIGINS: WinOrigin[] = ['From Penfold', 'New exporter', 'New mineral', 'Switched', 'Returning']
type Who = 'competitors' | 'penfold' | 'all'

const tooltipStyle = { background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8, fontSize: 12 }
const supplierHref = (s: string) => `/dashboard/suppliers?select=${encodeURIComponent(s)}`
const buyerHref = (b: string) => `/dashboard/buyers?select=${encodeURIComponent(b)}`

export default function WinsPage() {
  const { queryString } = useFilters()
  const [windowM, setWindowM] = useSessionState<number>('wins:window', 6)
  const [mineral, setMineral] = useSessionState<string>('wins:mineral', '')
  const [who, setWho] = useSessionState<Who>('wins:who', 'competitors')
  const [buyer, setBuyer] = useSessionState<string>('wins:buyer', '')
  const [origin, setOrigin] = useSessionState<WinOrigin | ''>('wins:origin', '')
  const [search, setSearch] = useSessionState<string>('wins:search', '')

  const qs = new URLSearchParams(queryString.replace('?', ''))
  qs.set('window', String(windowM))
  if (mineral) qs.set('mineral', mineral)

  const { data, isLoading, isError } = useQuery<WinsResult>({
    queryKey: ['wins', qs.toString()],
    queryFn: () => fetch(`/api/data/wins?${qs}`).then((r) => { if (!r.ok) throw new Error('failed'); return r.json() }),
  })

  const feed = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.wins.filter((w) => {
      if (who === 'competitors' && w.buyerIsPenfold) return false
      if (who === 'penfold' && !w.buyerIsPenfold) return false
      if (buyer && w.buyer !== buyer) return false
      if (origin && w.origin !== origin) return false
      if (q && !w.supplier.toLowerCase().includes(q) && !w.buyer.toLowerCase().includes(q)) return false
      return true
    })
  }, [data, who, buyer, origin, search])

  const originCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const w of data?.wins ?? []) {
      if (who === 'competitors' && w.buyerIsPenfold) continue
      if (who === 'penfold' && !w.buyerIsPenfold) continue
      if (buyer && w.buyer !== buyer) continue
      c[w.origin] = (c[w.origin] ?? 0) + 1
    }
    return c
  }, [data, who, buyer])

  const compWins = data ? data.wins.filter((w) => !w.buyerIsPenfold) : []
  const winLabel = data ? `${monthLabel(data.window.start)} – ${monthLabel(data.window.end)}` : ''

  function exportCsv() {
    downloadCsv(`competitor_wins_${data?.refMonth ?? ''}.csv`, feed.map((w) => ({
      first_month: w.firstMonth, buyer: w.buyer, supplier: w.supplier, mineral: w.mineral,
      origin: w.origin, previous_main_buyer: w.prevBuyer, previous_buyer_share_pct: w.prevBuyerShare,
      penfold_share_before_pct: w.penfoldShareBefore, outcome: w.outcome,
      usd_since: w.usdSince, tons_since: w.tonsSince, months_active: w.monthsActive, last_month: w.lastMonth,
      share_of_supplier_pct: w.shareOfSupplier, usd_per_kg: w.priceKg, prev_usd_per_kg: w.prevPriceKg, price_change_pct: w.priceGapPct,
    })))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            Competitor Wins <InfoTooltip {...G.winsOverview} />
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            New supplier relationships each buyer started, by mineral, and where that volume was going before.
          </p>
          {data && <p className="text-zinc-500 text-xs mt-1">Relationships started <span className="text-zinc-300">{winLabel}</span> · data through {monthLabel(data.refMonth)}</p>}
        </div>
        <button onClick={exportCsv} disabled={!feed.length}
          className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white disabled:opacity-40">
          Download CSV
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Segmented value={windowM} onChange={setWindowM} options={[
          { value: 3, label: 'Last 3 months' }, { value: 6, label: '6 months' }, { value: 12, label: '12 months' },
        ]} />
        <Segmented value={who} onChange={(v) => { setWho(v); setBuyer('') }} options={[
          { value: 'competitors', label: 'Competitors' }, { value: 'penfold', label: 'Penfold' }, { value: 'all', label: 'Everyone' },
        ]} />
        {data && (
          <select value={buyer} onChange={(e) => setBuyer(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 max-w-[220px]">
            <option value="">All buyers</option>
            {data.byBuyer.filter((b) => who === 'all' || (who === 'penfold') === b.isPenfold).map((b) => (
              <option key={b.buyer} value={b.buyer}>{b.buyer} ({b.wins})</option>
            ))}
          </select>
        )}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search supplier or buyer…"
          className="px-3 py-1.5 w-52 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      </div>
      {data && (
        <Segmented size="xs" value={mineral} onChange={setMineral}
          options={[{ value: '', label: 'All minerals' }, ...data.minerals.map((m) => ({ value: m, label: m }))]} />
      )}

      {isLoading && <div className="animate-pulse h-64 bg-zinc-900 rounded-xl" />}
      {isError && <div className="text-red-400 text-sm">Could not load Competitor Wins data.</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="Competitor wins" value={String(compWins.length)} sub={`${new Set(compWins.map((w) => w.supplier)).size} suppliers`} />
            <Kpi label="Taken from Penfold suppliers" value={String(data.penfold.losses)} valueClass={data.penfold.losses ? 'text-red-400' : undefined}
              sub={`${fmtTons(data.penfold.tonsLost)} since`} onClick={() => { setWho('competitors'); setOrigin(origin === 'From Penfold' ? '' : 'From Penfold') }} active={origin === 'From Penfold'} />
            <Kpi label="New exporters signed by competitors" value={String(compWins.filter((w) => w.origin === 'New exporter').length)} valueClass="text-blue-300"
              sub="suppliers with no export history" onClick={() => { setWho('competitors'); setOrigin(origin === 'New exporter' ? '' : 'New exporter') }} active={origin === 'New exporter' && who === 'competitors'} />
            <Kpi label="Penfold wins" value={String(data.penfold.wins)} valueClass="text-emerald-400" sub={`${fmtTons(data.penfold.tonsWon)} since`}
              onClick={() => { setWho('penfold'); setOrigin(''); setBuyer('') }} active={who === 'penfold'} />
            <Kpi label="Penfold net (wins − losses)" value={`${data.penfold.wins - data.penfold.losses >= 0 ? '+' : ''}${data.penfold.wins - data.penfold.losses}`}
              valueClass={data.penfold.wins - data.penfold.losses >= 0 ? 'text-emerald-400' : 'text-red-400'} sub="relationships" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Panel title="Who is signing new suppliers">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800">
                    <th className="text-left py-1.5 font-medium">Buyer</th>
                    <th className="text-right py-1.5 font-medium">Wins</th>
                    <th className="text-right py-1.5 font-medium" title="Wins where Penfold had the volume before">Ex-Penfold</th>
                    <th className="text-right py-1.5 font-medium">USD since</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byBuyer.slice(0, 12).map((b) => (
                    <tr key={b.buyer} className={cn('border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800/40', buyer === b.buyer && 'bg-blue-900/20', b.isPenfold && 'text-emerald-300')}
                      onClick={() => { if (buyer === b.buyer) setBuyer(''); else { setWho(b.isPenfold ? 'penfold' : 'competitors'); setBuyer(b.buyer) } }}>
                      <td className="py-1.5 pr-2 truncate max-w-[170px]" title={b.buyer}>
                        <span className={b.isPenfold ? 'text-emerald-300 font-medium' : 'text-zinc-200'}>{b.buyer}</span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-200">{b.wins}</td>
                      <td className={cn('py-1.5 text-right tabular-nums', b.fromPenfold ? 'text-red-400 font-medium' : 'text-zinc-600')}>{b.fromPenfold || '—'}</td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-400">{fmtUsd(b.usd, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel title="New relationships per month">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={data.byMonth} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} />
                  <XAxis dataKey="month" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickFormatter={(m: string) => monthLabel(m).slice(0, 3)} />
                  <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(m: string) => monthLabel(m)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="competitors" name="Competitor wins" stackId="a" fill="#F59E0B" />
                  <Bar dataKey="penfold" name="Penfold wins" stackId="a" fill="#10B981" />
                  <Bar dataKey="fromPenfold" name="Taken from Penfold" fill="#EF4444" />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="By mineral">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800">
                    <th className="text-left py-1.5 font-medium">Mineral</th>
                    <th className="text-right py-1.5 font-medium">All wins</th>
                    <th className="text-right py-1.5 font-medium">Penfold</th>
                    <th className="text-right py-1.5 font-medium">Ex-Penfold</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byMineral.map((m) => (
                    <tr key={m.mineral} className={cn('border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800/40', mineral === m.mineral && 'bg-blue-900/20')}
                      onClick={() => setMineral(mineral === m.mineral ? '' : m.mineral)}>
                      <td className="py-1.5 text-zinc-200">{m.mineral}</td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-300">{m.wins}</td>
                      <td className="py-1.5 text-right tabular-nums text-emerald-400">{m.penfoldWins || '—'}</td>
                      <td className={cn('py-1.5 text-right tabular-nums', m.fromPenfold ? 'text-red-400' : 'text-zinc-600')}>{m.fromPenfold || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-1.5 flex-wrap px-4 py-3 border-b border-zinc-800">
              <Chip active={origin === ''} onClick={() => setOrigin('')}>All origins ({Object.values(originCounts).reduce((a, b) => a + b, 0)})</Chip>
              {ORIGINS.map((o) => (
                <Chip key={o} active={origin === o} onClick={() => setOrigin(origin === o ? '' : o)} className={origin === o ? ORIGIN_STYLE[o] : ''}>
                  {o} ({originCounts[o] ?? 0})
                </Chip>
              ))}
              <InfoTooltip {...G.winsOrigin} />
              <span className="ml-auto text-xs text-zinc-500">{feed.length} relationships</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800 text-left">
                    <th className="px-3 py-2 font-medium">Started</th>
                    <th className="px-3 py-2 font-medium">Buyer</th>
                    <th className="px-3 py-2 font-medium">Supplier</th>
                    <th className="px-3 py-2 font-medium">Mineral</th>
                    <th className="px-3 py-2 font-medium">Came from</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">Outcome <InfoTooltip {...G.winsOutcome} /></th>
                    <th className="px-3 py-2 font-medium text-right">USD since</th>
                    <th className="px-3 py-2 font-medium text-right">Tons</th>
                    <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Captured <InfoTooltip {...G.winsCapture} /></th>
                    <th className="px-3 py-2 font-medium text-right whitespace-nowrap" title="New buyer's $/kg vs what previous buyers paid">$/kg vs before</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.map((w) => (
                    <tr key={`${w.buyer}|${w.supplier}|${w.mineral}`} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                      <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{monthLabel(w.firstMonth)}</td>
                      <td className="px-3 py-2 max-w-[180px]">
                        <Link href={buyerHref(w.buyer)} className={cn('truncate block hover:text-blue-400', w.buyerIsPenfold ? 'text-emerald-300 font-medium' : 'text-zinc-200')} title={w.buyer}>{w.buyer}</Link>
                      </td>
                      <td className="px-3 py-2 max-w-[200px]">
                        <Link href={supplierHref(w.supplier)} className="truncate block text-zinc-100 font-medium hover:text-blue-400" title={w.supplier}>{w.supplier}</Link>
                      </td>
                      <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{w.mineral}</td>
                      <td className="px-3 py-2">
                        <span className={cn('px-1.5 py-0.5 rounded border text-[11px] whitespace-nowrap', ORIGIN_STYLE[w.origin])}>{w.origin}</span>
                        {w.prevBuyer && (
                          <div className="text-[11px] text-zinc-500 mt-0.5 truncate max-w-[200px]" title={w.prevBuyer}>
                            was {w.prevBuyer} ({w.prevBuyerShare?.toFixed(0)}%)
                            {w.origin === 'From Penfold' && w.prevBuyer && !w.prevBuyer.toLowerCase().includes('penfold') && ` · Penfold ${w.penfoldShareBefore?.toFixed(0)}%`}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('text-[11px]', w.outcome === 'Replaced' ? 'text-red-400' : w.outcome === 'Added' ? 'text-amber-300' : 'text-zinc-400')}>{w.outcome}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-200">{fmtUsd(w.usdSince, true)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{fmtTons(w.tonsSince)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{w.shareOfSupplier.toFixed(0)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {w.priceGapPct === null ? <span className="text-zinc-600">—</span> : (
                          <span className={cn(w.priceGapPct > 5 ? 'text-red-400' : w.priceGapPct < -5 ? 'text-emerald-400' : 'text-zinc-400')}>
                            {w.priceGapPct > 0 ? '+' : ''}{w.priceGapPct.toFixed(0)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!feed.length && <tr><td colSpan={10} className="px-4 py-10 text-center text-zinc-600">No new relationships match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, valueClass, onClick, active }: { label: string; value: string; sub?: string; valueClass?: string; onClick?: () => void; active?: boolean }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={cn('text-left bg-zinc-900 border rounded-xl p-4 transition-colors', active ? 'border-blue-500' : 'border-zinc-800', onClick && 'hover:border-zinc-600')}>
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className={cn('text-xl font-bold', valueClass ?? 'text-white')}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
    </Tag>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="text-sm font-semibold text-zinc-200 mb-3">{title}</div>
      {children}
    </div>
  )
}

function Chip({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button onClick={onClick}
      className={cn('px-2.5 py-1 rounded-md border text-xs transition-colors',
        active ? 'bg-blue-600 border-blue-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600', className)}>
      {children}
    </button>
  )
}
