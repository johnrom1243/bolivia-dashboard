'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { ExportButton } from '@/components/ExportButton'
import { fmtUsd, fmtTons, fmtNum, cn } from '@/lib/utils'
import type { MarketEvolutionData } from '@/types/data'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, Legend, AreaChart, Area, Cell, COLORS, CHART_THEME, ReferenceLine,
} from '@/components/charts'

const TABS = ['Overview', 'Volume', 'Prices', 'Trade Flows', 'Competition', 'Seasonal'] as const
type Tab = typeof TABS[number]

export default function MarketPage() {
  const { queryString } = useFilters()
  const [tab, setTab] = useState<Tab>('Overview')

  const { data, isLoading } = useQuery<MarketEvolutionData | null>({
    queryKey: ['market', queryString],
    queryFn: () => fetch(`/api/data/market${queryString}`).then((r) => r.json()),
  })

  if (isLoading) return <div className="flex items-center justify-center h-64 text-zinc-500">Loading market data…</div>
  if (!data) return <div className="flex items-center justify-center h-64 text-zinc-600">No data available for selected filters.</div>

  const minerals = [...new Set(data.mineralEvolution.map((m) => m.mineral))]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Market Evolution</h1>
          <p className="text-zinc-400 text-sm mt-1">Price trends, volume patterns, trade flows, and seasonal decomposition</p>
        </div>
        <ExportButton url={`/api/export?type=market${queryString.replace('?', '&')}`} label="Export" filename="market_evolution.xlsx" />
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 border-b border-zinc-800">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t ? 'border-blue-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Overview ──────────────────────────────────────────────────────── */}
      {tab === 'Overview' && (
        <div className="space-y-4">
          {/* Year comparison table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">Year-over-Year Performance</h3>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="text-left px-4 py-3 font-medium">Year</th>
                  <th className="text-right px-4 py-3 font-medium">Volume (tons)</th>
                  <th className="text-right px-4 py-3 font-medium">YoY Δ Tons</th>
                  <th className="text-right px-4 py-3 font-medium">Revenue (USD)</th>
                  <th className="text-right px-4 py-3 font-medium">YoY Δ Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.yearlyComparison.map((y) => (
                  <tr key={y.year} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-2 text-zinc-300 font-medium">{y.year}</td>
                    <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtTons(y.tons)}</td>
                    <td className={cn('px-4 py-2 text-right tabular-nums font-medium',
                      y.yoyTons === null ? 'text-zinc-600' : y.yoyTons >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {y.yoyTons === null ? '—' : `${y.yoyTons >= 0 ? '+' : ''}${y.yoyTons.toFixed(1)}%`}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtUsd(y.usd)}</td>
                    <td className={cn('px-4 py-2 text-right tabular-nums font-medium',
                      y.yoyUsd === null ? 'text-zinc-600' : y.yoyUsd >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {y.yoyUsd === null ? '—' : `${y.yoyUsd >= 0 ? '+' : ''}${y.yoyUsd.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top suppliers/buyers */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Top Suppliers by Volume</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.topSuppliersByTons.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} tickFormatter={(v) => fmtTons(v)} />
                  <YAxis type="category" dataKey="supplier" tick={{ fill: CHART_THEME.text, fontSize: 9 }} tickLine={false} width={90} />
                  <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => fmtTons(v)} />
                  <Bar dataKey="tons" fill={COLORS[0]} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Top Buyers by Volume</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.topBuyersByTons.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} tickFormatter={(v) => fmtTons(v)} />
                  <YAxis type="category" dataKey="buyer" tick={{ fill: CHART_THEME.text, fontSize: 9 }} tickLine={false} width={90} />
                  <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => fmtTons(v)} />
                  <Bar dataKey="tons" fill={COLORS[2]} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quarterly overview */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Quarterly Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.quarterlyOverview} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="quarter" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => fmtUsd(v)} />
                <Bar dataKey="usd" fill={COLORS[0]} radius={[3, 3, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Volume ────────────────────────────────────────────────────────── */}
      {tab === 'Volume' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Monthly Tonnage with Moving Averages</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.monthlyTonnage} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tonsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="tons" stroke={COLORS[0]} fill="url(#tonsGrad)" name="Monthly Tons" strokeWidth={1.5} />
                <Line type="monotone" dataKey="ma3" stroke={COLORS[1]} name="MA3" dot={false} strokeWidth={2} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="ma6" stroke={COLORS[2]} name="MA6" dot={false} strokeWidth={2} strokeDasharray="8 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Mineral evolution stacked */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Mineral Mix by Quarter</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={(() => {
                  const grouped: Record<string, Record<string, number>> = {}
                  for (const e of data.mineralEvolution) {
                    if (!grouped[e.quarter]) grouped[e.quarter] = {}
                    grouped[e.quarter][e.mineral] = e.tons
                  }
                  return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([quarter, mins]) => ({ quarter, ...mins }))
                })()}
                margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="quarter" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {minerals.map((m, i) => (
                  <Bar key={m} dataKey={m} stackId="a" fill={COLORS[i % COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Prices ────────────────────────────────────────────────────────── */}
      {tab === 'Prices' && (
        <div className="space-y-4">
          {/* Price evolution by mineral */}
          {minerals.map((mineral) => {
            const hist = data.priceEvolution.filter((p) => p.mineral === mineral)
            const forecast = data.priceForecast.filter((p) => p.mineral === mineral)
            const combined = [
              ...hist.map((p) => ({ date: p.date, actual: p.avgPrice, forecast: undefined as number | undefined, lower: undefined as number | undefined, upper: undefined as number | undefined })),
              ...forecast.map((p) => ({ date: p.date, actual: undefined as number | undefined, forecast: p.forecast, lower: p.lower, upper: p.upper })),
            ]
            return (
              <div key={mineral} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-1">{mineral} — Price (USD/kg)</h3>
                <p className="text-xs text-zinc-500 mb-3">Historical avg + 3-month linear forecast with confidence interval</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={combined} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                    <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                    <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="actual" stroke={COLORS[0]} name="Actual" dot={false} strokeWidth={2} connectNulls={false} />
                    <Line type="monotone" dataKey="forecast" stroke="#F59E0B" name="Forecast" dot={{ fill: '#F59E0B', r: 4 }} strokeDasharray="4 3" strokeWidth={2} connectNulls={false} />
                    <Line type="monotone" dataKey="upper" stroke="#6B7280" name="Upper CI" dot={false} strokeDasharray="2 4" strokeWidth={1} connectNulls={false} />
                    <Line type="monotone" dataKey="lower" stroke="#6B7280" name="Lower CI" dot={false} strokeDasharray="2 4" strokeWidth={1} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Trade Flows ───────────────────────────────────────────────────── */}
      {tab === 'Trade Flows' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">Top Supplier → Buyer Trade Flows</h3>
              <p className="text-xs text-zinc-500 mt-1">Top 80 pairs by revenue within filters</p>
            </div>
            <div className="overflow-y-auto max-h-[520px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-900 z-10">
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="text-left px-4 py-3 font-medium">#</th>
                    <th className="text-left px-4 py-3 font-medium">Supplier</th>
                    <th className="text-left px-4 py-3 font-medium">Buyer</th>
                    <th className="text-left px-4 py-3 font-medium">Mineral</th>
                    <th className="text-right px-4 py-3 font-medium">Revenue</th>
                    <th className="text-right px-4 py-3 font-medium">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tradeFlows.map((f, i) => {
                    const grandTotal = data.tradeFlows.reduce((a, b) => a + b.value, 0)
                    return (
                      <tr key={i} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${i % 2 ? 'bg-zinc-900/30' : ''}`}>
                        <td className="px-4 py-2 text-zinc-600">{i + 1}</td>
                        <td className="px-4 py-2 text-zinc-300 max-w-[140px] truncate">{f.source}</td>
                        <td className="px-4 py-2 text-zinc-400 max-w-[140px] truncate">{f.target}</td>
                        <td className="px-4 py-2 text-zinc-500">{f.mineral}</td>
                        <td className="px-4 py-2 text-right text-zinc-300 tabular-nums font-medium">{fmtUsd(f.value)}</td>
                        <td className="px-4 py-2 text-right text-zinc-500 tabular-nums">{grandTotal > 0 ? ((f.value / grandTotal) * 100).toFixed(1) : 0}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Competition ───────────────────────────────────────────────────── */}
      {tab === 'Competition' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-1">Market Concentration (HHI)</h3>
              <p className="text-xs text-zinc-500 mb-3">Herfindahl–Hirschman Index — lower = more competitive</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.competitionMetrics} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="quarter" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                  <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} />
                  <ReferenceLine y={1500} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: 'Moderate', fill: '#F59E0B', fontSize: 10 }} />
                  <ReferenceLine y={2500} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Concentrated', fill: '#EF4444', fontSize: 10 }} />
                  <Bar dataKey="hhi" fill={COLORS[0]} radius={[3, 3, 0, 0]} name="HHI" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-1">CR4 — Top-4 Supplier Share</h3>
              <p className="text-xs text-zinc-500 mb-3">% of market controlled by top 4 suppliers</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.competitionMetrics} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="quarter" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => `${v.toFixed(1)}%`} />
                  <Line type="monotone" dataKey="cr4" stroke={COLORS[2]} name="CR4 %" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Market dynamics */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Market Entry/Exit Dynamics</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.marketDynamics} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="quarter" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="newSuppliers" fill={COLORS[1]} radius={[3, 3, 0, 0]} name="New Suppliers" />
                <Bar dataKey="exitedSuppliers" fill="#EF4444" radius={[3, 3, 0, 0]} name="Exited Suppliers" />
                <Bar dataKey="newBuyers" fill={COLORS[3]} radius={[3, 3, 0, 0]} name="New Buyers" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Seasonal ─────────────────────────────────────────────────────── */}
      {tab === 'Seasonal' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-1">Seasonal Decomposition</h3>
            <p className="text-xs text-zinc-500 mb-3">Monthly seasonal index (1.0 = average month) — identifies boom and quiet periods</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.seasonalDecomposition} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="monthName" tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} tickFormatter={(v) => v.toFixed(1)} />
                <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                  formatter={(v: number) => v.toFixed(3)} />
                <ReferenceLine y={1} stroke="#6B7280" strokeDasharray="4 4" label={{ value: 'Average', fill: '#6B7280', fontSize: 10 }} />
                <Bar dataKey="seasonalIndex" radius={[3, 3, 0, 0]} name="Seasonal Index">
                  {data.seasonalDecomposition.map((s, i) => (
                    <Cell key={i} fill={s.seasonalIndex >= 1 ? COLORS[1] : '#EF4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Average Monthly Tonnage</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.seasonalDecomposition} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="monthName" tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                  formatter={(v: number) => fmtTons(v)} />
                <Bar dataKey="avgTons" fill={COLORS[0]} radius={[3, 3, 0, 0]} name="Avg Tons" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
