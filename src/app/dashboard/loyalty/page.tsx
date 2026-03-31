'use client'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { ExportButton } from '@/components/ExportButton'
import { KpiCard } from '@/components/KpiCard'
import { InfoTooltip } from '@/components/InfoTooltip'
import { fmtTons, fmtUsd, cn } from '@/lib/utils'
import { G } from '@/lib/glossary'
import type { LoyaltyRow } from '@/types/data'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ScatterChart, Scatter, ZAxis, Cell, COLORS, CHART_THEME,
} from '@/components/charts'

export default function LoyaltyPage() {
  const { queryString } = useFilters()
  const { data, isLoading } = useQuery<LoyaltyRow[]>({
    queryKey: ['loyalty', queryString],
    queryFn: () => fetch(`/api/data/analytics?type=loyalty${queryString.replace('?', '&')}`).then((r) => r.json()),
  })

  if (isLoading) return <div className="animate-pulse h-64 bg-zinc-900 rounded-xl" />
  if (!data?.length) return <Empty />

  const avg = data.reduce((a, r) => a + r.loyaltyIndex, 0) / data.length
  const highlyLoyal = data.filter((r) => r.loyaltyIndex > 70)
  const moderate = data.filter((r) => r.loyaltyIndex >= 40 && r.loyaltyIndex <= 70)
  const lowLoyal = data.filter((r) => r.loyaltyIndex < 40)
  const atRisk = data.filter((r) => r.atRisk)
  const rising = data.filter((r) => r.trend === 'rising')
  const falling = data.filter((r) => r.trend === 'falling')

  // Histogram data
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * 10}–${(i + 1) * 10}`,
    count: data.filter((r) => r.loyaltyIndex >= i * 10 && r.loyaltyIndex < (i + 1) * 10).length,
  }))

  // Cohort analysis
  const cohortMap: Record<number, { count: number; avgLoyalty: number }> = {}
  for (const r of data) {
    if (!cohortMap[r.cohortYear]) cohortMap[r.cohortYear] = { count: 0, avgLoyalty: 0 }
    cohortMap[r.cohortYear].count++
    cohortMap[r.cohortYear].avgLoyalty += r.loyaltyIndex
  }
  const cohortData = Object.entries(cohortMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, v]) => ({ year, avgLoyalty: Math.round(v.avgLoyalty / v.count), count: v.count }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Loyalty Analysis</h1>
          <p className="text-zinc-400 text-sm mt-1">How committed suppliers are to their primary buyers</p>
        </div>
        <ExportButton url={`/api/export?type=loyalty${queryString.replace('?', '&')}`} label="Export Analysis" />
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
        <KpiCard label="Avg Loyalty" value={avg.toFixed(1)} icon="🤝" accent="blue" info={G.loyaltyIndex} />
        <KpiCard label="Highly Loyal" value={String(highlyLoyal.length)} subValue="> 70" accent="green" info={G.loyaltyIndex} />
        <KpiCard label="Moderate" value={String(moderate.length)} subValue="40 – 70" accent="amber" info={G.loyaltyIndex} />
        <KpiCard label="Low Loyalty" value={String(lowLoyal.length)} subValue="< 40" accent="red" info={G.loyaltyIndex} />
        <KpiCard label="At Risk" value={String(atRisk.length)} subValue="loyal but declining" accent="red" info={G.atRisk} />
        <KpiCard label="Rising Trend" value={String(rising.length)} subValue="growing loyalty" accent="green" info={G.loyaltyTrend} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Distribution histogram */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Loyalty Score Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={buckets} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="range" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
              <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} />
              <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]}>
                {buckets.map((b, i) => (
                  <Cell key={i} fill={
                    i >= 7 ? '#EF4444' : i >= 4 ? '#F59E0B' : '#3B82F6'
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cohort analysis — NEW */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Cohort Loyalty by First Shipment Year</h3>
          <p className="text-xs text-zinc-500 mb-4">Are newer suppliers more or less loyal?</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cohortData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false} />
              <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                formatter={(v: number, name: string) => [name === 'avgLoyalty' ? v.toFixed(1) : v, name === 'avgLoyalty' ? 'Avg Loyalty' : 'Suppliers']}
              />
              <Bar dataKey="avgLoyalty" name="Avg Loyalty" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Scatter: loyalty vs volume */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Loyalty vs Volume — Opportunity Map</h3>
        <p className="text-xs text-zinc-500 mb-4">Low loyalty + high volume = best poach candidates (bottom right)</p>
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
            <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" />
            <XAxis dataKey="loyaltyIndex" name="Loyalty Index" domain={[0, 100]}
              tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false}
              label={{ value: 'Loyalty Index', position: 'insideBottom', offset: -15, fill: CHART_THEME.text, fontSize: 11 }} />
            <YAxis dataKey="totalVolumeTons" name="Volume (tons)"
              tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false}
              tickFormatter={(v) => fmtTons(v)} />
            <ZAxis dataKey="uniqueBuyers" range={[30, 200]} />
            <Tooltip content={({ payload }) => {
              if (!payload?.length) return null
              const r = payload[0]?.payload as LoyaltyRow
              return (
                <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-white mb-1">{r.supplier}</div>
                  <div className="text-zinc-400">Loyalty: <span className="text-white">{r.loyaltyIndex.toFixed(1)}</span></div>
                  <div className="text-zinc-400">Volume: <span className="text-white">{fmtTons(r.totalVolumeTons)}</span></div>
                  <div className="text-zinc-400">Primary Buyer: <span className="text-white">{r.primaryBuyer}</span></div>
                  <div className="text-zinc-400">Trend: <span className={r.trend === 'rising' ? 'text-green-400' : r.trend === 'falling' ? 'text-red-400' : 'text-zinc-300'}>{r.trend}</span></div>
                </div>
              )
            }} />
            <Scatter data={data.slice(0, 80)}
              shape={(props: unknown) => {
                const p = props as Record<string, unknown>
                const r = p.payload as LoyaltyRow
                const color = r.trend === 'rising' ? '#10B981' : r.trend === 'falling' ? '#EF4444' : '#3B82F6'
                return <circle cx={p.cx as number} cy={p.cy as number} r={6} fill={color} fillOpacity={0.7} />
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
        <div className="flex gap-4 text-xs text-zinc-500 mt-2 justify-center">
          <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Rising loyalty</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Falling loyalty</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />Stable</span>
        </div>
      </div>

      {/* Segmented tables */}
      <div className="grid grid-cols-3 gap-4">
        <SegmentTable title="🔒 Highly Loyal (> 70)" items={highlyLoyal.slice(0, 10)} />
        <SegmentTable title="⚖️ Moderate (40 – 70)" items={moderate.slice(0, 10)} />
        <SegmentTable title="🎯 Low Loyalty (< 40) — Best Targets" items={lowLoyal.slice(0, 10)} />
      </div>

      {/* At-risk table — NEW */}
      {atRisk.length > 0 && (
        <div className="bg-zinc-900 border border-amber-800/30 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-800/30 bg-amber-900/10">
            <h3 className="text-sm font-semibold text-amber-400">⚠️ At-Risk Loyalists — Currently Loyal but Trending Down</h3>
            <p className="text-xs text-zinc-500 mt-1">These suppliers have loyalty &gt; 60 but are actively reducing share to primary buyer — approach now before they leave</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="text-left px-4 py-3 font-medium">Supplier</th>
                  <th className="text-left px-4 py-3 font-medium">Primary Buyer</th>
                  <th className="text-right px-4 py-3 font-medium">
                    <span className="flex items-center justify-end gap-0.5">Loyalty Score <InfoTooltip {...G.loyaltyIndex} /></span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    <span className="flex items-center justify-end gap-0.5">Buyer Share <InfoTooltip term="Primary Buyer Share" what="The share of this supplier's total volume that goes to their primary (largest) buyer. High % = highly dependent on one buyer." calc="Primary buyer tons ÷ Total supplier tons × 100" /></span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium">Volume</th>
                </tr>
              </thead>
              <tbody>
                {atRisk.map((r) => (
                  <tr key={r.supplier} className="border-b border-zinc-800/50 hover:bg-zinc-800/40">
                    <td className="px-4 py-2.5 text-white font-medium">{r.supplier}</td>
                    <td className="px-4 py-2.5 text-zinc-400">{r.primaryBuyer}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-amber-400 font-semibold">{r.loyaltyIndex.toFixed(1)}</span>
                      <span className="text-red-400 ml-2">↓ falling</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-400">{r.primaryBuyerShare.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right text-zinc-400">{fmtTons(r.totalVolumeTons)}</td>
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

function SegmentTable({ title, items }: { title: string; items: LoyaltyRow[] }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 text-sm font-medium text-zinc-300">{title}</div>
      <div className="divide-y divide-zinc-800/50">
        {items.map((r) => (
          <div key={r.supplier} className="px-4 py-2.5 hover:bg-zinc-800/30 transition-colors">
            <div className="text-xs text-zinc-300 font-medium truncate">{r.supplier}</div>
            <div className="text-xs text-zinc-500 truncate">{r.primaryBuyer}</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1 rounded-full bg-zinc-800">
                <div className="h-1 rounded-full bg-blue-500" style={{ width: `${r.loyaltyIndex}%` }} />
              </div>
              <span className="text-xs text-zinc-400 tabular-nums">{r.loyaltyIndex.toFixed(0)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Empty() {
  return <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">No data available</div>
}
