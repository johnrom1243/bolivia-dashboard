'use client'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { ExportButton } from '@/components/ExportButton'
import { fmtTons, fmtNum, cn } from '@/lib/utils'
import type { LogisticsData } from '@/types/data'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, COLORS, CHART_THEME,
} from '@/components/charts'

export default function LogisticsPage() {
  const { queryString } = useFilters()

  const { data, isLoading } = useQuery<LogisticsData | null>({
    queryKey: ['logistics', queryString],
    queryFn: () => fetch(`/api/data/logistics${queryString}`).then((r) => r.json()),
  })

  if (isLoading) return <div className="flex items-center justify-center h-64 text-zinc-500">Loading logistics data…</div>
  if (!data) return <div className="flex items-center justify-center h-64 text-zinc-600">No data available.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Logistics</h1>
          <p className="text-zinc-400 text-sm mt-1">Customs posts, shipment sizes, lot distributions, route efficiency</p>
        </div>
        <ExportButton url={`/api/export?type=logistics${queryString.replace('?', '&')}`} label="Export" filename="logistics.xlsx" />
      </div>

      {/* Lot size by mineral */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Lot Size by Mineral</h3>
          <p className="text-xs text-zinc-500 mt-1">P25 / Median / P75 / Mean / Max tonnage per shipment</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="text-left px-4 py-3 font-medium">Mineral</th>
              <th className="text-right px-4 py-3 font-medium">P25</th>
              <th className="text-right px-4 py-3 font-medium">Median</th>
              <th className="text-right px-4 py-3 font-medium">Mean</th>
              <th className="text-right px-4 py-3 font-medium">P75</th>
              <th className="text-right px-4 py-3 font-medium">Max</th>
              <th className="px-4 py-3 font-medium">Distribution</th>
            </tr>
          </thead>
          <tbody>
            {data.lotSizeByMineral.map((m) => {
              const maxVal = Math.max(...data.lotSizeByMineral.map((x) => x.max))
              return (
                <tr key={m.mineral} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-2 text-zinc-200 font-medium">{m.mineral}</td>
                  <td className="px-4 py-2 text-right text-zinc-500 tabular-nums">{m.p25.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right text-zinc-300 tabular-nums font-medium">{m.median.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{m.mean.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right text-zinc-500 tabular-nums">{m.p75.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right text-zinc-600 tabular-nums">{m.max.toFixed(1)}</td>
                  <td className="px-4 py-2 w-40">
                    <div className="relative h-2 bg-zinc-800 rounded-full">
                      {/* IQR bar */}
                      <div
                        className="absolute h-2 rounded-full bg-blue-600/60"
                        style={{
                          left: `${(m.p25 / maxVal) * 100}%`,
                          width: `${((m.p75 - m.p25) / maxVal) * 100}%`,
                        }}
                      />
                      {/* Median tick */}
                      <div
                        className="absolute h-2 w-0.5 bg-white rounded"
                        style={{ left: `${(m.median / maxVal) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Shipment value distribution + Customs post comparison */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Shipment Value Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.shipmentValueDist} margin={{ top: 0, right: 0, left: 0, bottom: 20 }}>
              <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fill: CHART_THEME.text, fontSize: 9 }} tickLine={false} angle={-30} textAnchor="end" />
              <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
              <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} />
              <Bar dataKey="count" fill={COLORS[1]} radius={[3, 3, 0, 0]} name="Shipments" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-white">Customs Post Comparison</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left px-4 py-2 font-medium">Aduana</th>
                <th className="text-right px-4 py-2 font-medium">Shipments</th>
                <th className="text-right px-4 py-2 font-medium">Avg Tons</th>
                <th className="text-left px-4 py-2 font-medium">Minerals</th>
              </tr>
            </thead>
            <tbody>
              {data.customsPostComparison.map((c) => (
                <tr key={c.aduana} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-2 text-zinc-300 font-medium">{c.aduana || '—'}</td>
                  <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{fmtNum(c.shipments)}</td>
                  <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{c.avgTons.toFixed(1)}</td>
                  <td className="px-4 py-2 text-zinc-500 truncate max-w-[120px]">{c.minerals.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Route efficiency */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Route Efficiency — Customs Post × Mineral</h3>
          <p className="text-xs text-zinc-500 mt-1">Average lot size per route — larger = more efficient utilisation</p>
        </div>
        <div className="overflow-y-auto max-h-72">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-zinc-900 z-10">
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left px-4 py-3 font-medium">Customs Post</th>
                <th className="text-left px-4 py-3 font-medium">Mineral</th>
                <th className="text-right px-4 py-3 font-medium">Shipments</th>
                <th className="text-right px-4 py-3 font-medium">Avg Tons</th>
                <th className="px-4 py-3 font-medium">Efficiency</th>
              </tr>
            </thead>
            <tbody>
              {data.routeEfficiency.map((r, i) => {
                const maxTons = Math.max(...data.routeEfficiency.map((x) => x.avgTons))
                return (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-2 text-zinc-300">{r.aduana || '—'}</td>
                    <td className="px-4 py-2 text-zinc-400">{r.mineral}</td>
                    <td className="px-4 py-2 text-right text-zinc-500">{fmtNum(r.shipmentCount)}</td>
                    <td className="px-4 py-2 text-right text-zinc-400 tabular-nums font-medium">{r.avgTons.toFixed(1)}</td>
                    <td className="px-4 py-2 w-32">
                      <div className="h-1.5 rounded-full bg-zinc-800">
                        <div
                          className="h-1.5 rounded-full bg-emerald-500"
                          style={{ width: `${maxTons > 0 ? (r.avgTons / maxTons) * 100 : 0}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly frequency heatmap */}
      {data.monthlyFrequencyHeatmap.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-white">Monthly Shipment Frequency — Top Suppliers</h3>
            <p className="text-xs text-zinc-500 mt-1">Number of shipments per month per supplier</p>
          </div>
          <div className="overflow-x-auto p-4">
            {(() => {
              const suppliers = [...new Set(data.monthlyFrequencyHeatmap.map((r) => r.supplier))]
              const months = [...new Set(data.monthlyFrequencyHeatmap.map((r) => r.month))].sort()
              const lookup: Record<string, Record<string, number>> = {}
              for (const r of data.monthlyFrequencyHeatmap) {
                if (!lookup[r.supplier]) lookup[r.supplier] = {}
                lookup[r.supplier][r.month] = r.count
              }
              const maxCount = Math.max(...data.monthlyFrequencyHeatmap.map((r) => r.count))

              return (
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left pr-3 py-1 text-zinc-500 font-medium min-w-[120px]">Supplier</th>
                        {months.map((m) => (
                          <th key={m} className="px-1 py-1 text-zinc-600 font-normal text-center" style={{ minWidth: 28 }}>
                            {m.slice(5)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {suppliers.map((s) => (
                        <tr key={s}>
                          <td className="pr-3 py-0.5 text-zinc-300 truncate max-w-[120px]" title={s}>{s}</td>
                          {months.map((m) => {
                            const count = lookup[s]?.[m] ?? 0
                            const intensity = maxCount > 0 ? count / maxCount : 0
                            return (
                              <td key={m} className="px-0.5 py-0.5">
                                <div
                                  className="w-6 h-5 rounded flex items-center justify-center text-xs font-medium"
                                  style={{
                                    background: count > 0 ? `rgba(59,130,246,${0.15 + intensity * 0.85})` : 'transparent',
                                    color: intensity > 0.5 ? '#fff' : '#6B7280',
                                  }}
                                  title={`${s} — ${m}: ${count} shipments`}
                                >
                                  {count > 0 ? count : ''}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
