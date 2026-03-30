'use client'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { ExportButton } from '@/components/ExportButton'
import { fmtUsd, fmtTons, fmtNum, cn } from '@/lib/utils'
import type { PoachRow } from '@/types/data'
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, BarChart, Bar, Cell, COLORS, CHART_THEME,
} from '@/components/charts'

const TIER_STYLES = {
  A: 'bg-green-900/40 text-green-300 border-green-700',
  B: 'bg-blue-900/40 text-blue-300 border-blue-700',
  C: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  Unpoachable: 'bg-red-900/20 text-red-400 border-red-900',
}

export default function PoachPage() {
  const { queryString } = useFilters()

  const { data, isLoading } = useQuery<PoachRow[]>({
    queryKey: ['poach', queryString],
    queryFn: () => fetch(`/api/data/analytics?type=poach${queryString.replace('?', '&')}`).then((r) => r.json()),
  })

  if (isLoading) return <div className="animate-pulse h-64 bg-zinc-900 rounded-xl" />
  if (!data?.length) return <Empty />

  const poachable = data.filter((r) => r.poachStatus === 'Potentially Poachable')
  const tierA = data.filter((r) => r.tier === 'A')
  const tierB = data.filter((r) => r.tier === 'B')
  const tierC = data.filter((r) => r.tier === 'C')

  // Scatter: PoachIndex vs TotalTons
  const scatterData = data.slice(0, 60).map((r) => ({
    x: r.poachIndex,
    y: r.totalTons,
    z: r.totalUsd,
    name: r.supplier,
    tier: r.tier,
    status: r.poachStatus,
  }))

  // Component breakdown for top-A suppliers
  const componentData = tierA.slice(0, 10).map((r) => ({
    name: r.supplier.slice(0, 20),
    Gap: Math.round(r.gap * 100) / 100,
    Recency: Math.round((1 - r.recencyDays / 365) * 100) / 100,
    Frequency: Math.round(r.frequencyScore * 100) / 100,
    Concentration: Math.round(r.concentrationNorm * 100) / 100,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Poach Index</h1>
          <p className="text-zinc-400 text-sm mt-1">Supplier poachability ranked by opportunity score</p>
        </div>
        <ExportButton url={`/api/export?type=poach${queryString.replace('?', '&')}`} label="Export Rankings" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Tier A Prospects" value={tierA.length} sub="High priority" color="green" />
        <SummaryCard label="Tier B Prospects" value={tierB.length} sub="Medium priority" color="blue" />
        <SummaryCard label="Tier C Prospects" value={tierC.length} sub="Low priority" color="zinc" />
        <SummaryCard label="Unpoachable" value={data.length - poachable.length} sub="Linked entities" color="red" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Scatter */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Poachability vs Volume</h3>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" />
              <XAxis dataKey="x" name="Poach Index" domain={[0, 1]}
                tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false}
                label={{ value: 'Poach Index', position: 'insideBottom', offset: -5, fill: CHART_THEME.text, fontSize: 11 }} />
              <YAxis dataKey="y" name="Tons"
                tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false}
                tickFormatter={(v) => fmtTons(v)} />
              <ZAxis dataKey="z" range={[40, 400]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                content={({ payload }) => {
                  if (!payload?.length) return null
                  const d = payload[0]?.payload as typeof scatterData[0]
                  return (
                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs">
                      <div className="font-semibold text-white mb-1">{d.name}</div>
                      <div className="text-zinc-400">Poach Index: <span className="text-white">{d.x.toFixed(3)}</span></div>
                      <div className="text-zinc-400">Volume: <span className="text-white">{fmtTons(d.y)}</span></div>
                      <div className="text-zinc-400">USD: <span className="text-white">{fmtUsd(d.z, true)}</span></div>
                    </div>
                  )
                }}
              />
              <Scatter data={scatterData}
                fill="#3B82F6"
                fillOpacity={0.7}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Component breakdown */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">What Makes Tier-A Suppliers Poachable</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={componentData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 1]} tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false} />
              <YAxis dataKey="name" type="category" width={110} tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
              <Tooltip
                contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
              />
              <Bar dataKey="Gap" stackId="a" fill="#3B82F6" />
              <Bar dataKey="Recency" stackId="a" fill="#10B981" />
              <Bar dataKey="Frequency" stackId="a" fill="#F59E0B" />
              <Bar dataKey="Concentration" stackId="a" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tier tabs */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Supplier Rankings</h3>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Tier A
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block ml-1" />Tier B
            <span className="w-2 h-2 rounded-full bg-zinc-500 inline-block ml-1" />Tier C
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="text-left px-4 py-3 font-medium">#</th>
                <th className="text-left px-4 py-3 font-medium">Supplier</th>
                <th className="text-center px-4 py-3 font-medium">Tier</th>
                <th className="text-right px-4 py-3 font-medium">Score</th>
                <th className="text-right px-4 py-3 font-medium">Volume</th>
                <th className="text-right px-4 py-3 font-medium">USD</th>
                <th className="text-right px-4 py-3 font-medium">Gap</th>
                <th className="text-right px-4 py-3 font-medium">Days Since</th>
                <th className="text-left px-4 py-3 font-medium">Mineral</th>
                <th className="text-left px-4 py-3 font-medium">Recommended Action</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={r.supplier}
                  className={cn(
                    'border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors',
                    i % 2 === 0 ? '' : 'bg-zinc-900/50',
                  )}>
                  <td className="px-4 py-2.5 text-zinc-600 text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5 text-white font-medium text-xs">{r.supplier}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', TIER_STYLES[r.tier])}>
                      {r.tier}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="w-20 h-1.5 rounded-full bg-zinc-800">
                        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${r.poachIndex * 100}%` }} />
                      </div>
                      <span className="text-xs text-zinc-300 w-12 text-right tabular-nums">{r.poachIndex.toFixed(3)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-zinc-400 tabular-nums">{fmtTons(r.totalTons)}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-zinc-400 tabular-nums">{fmtUsd(r.totalUsd, true)}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-zinc-400 tabular-nums">{(r.gap * 100).toFixed(0)}%</td>
                  <td className="px-4 py-2.5 text-right text-xs text-zinc-400 tabular-nums">{r.recencyDays}d</td>
                  <td className="px-4 py-2.5 text-xs text-zinc-500">{r.primaryMineral}</td>
                  <td className="px-4 py-2.5 text-xs text-zinc-500 max-w-xs">{r.recommendedAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    green: 'text-green-400 bg-green-900/30 border-green-800',
    blue: 'text-blue-400 bg-blue-900/30 border-blue-800',
    zinc: 'text-zinc-400 bg-zinc-800 border-zinc-700',
    red: 'text-red-400 bg-red-900/20 border-red-900',
  }
  return (
    <div className={cn('rounded-xl p-4 border', colorMap[color])}>
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs opacity-70 mt-0.5">{sub}</div>
    </div>
  )
}

function Empty() {
  return <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">No data available with current filters</div>
}
