'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { ExportButton } from '@/components/ExportButton'
import { fmtTons, cn } from '@/lib/utils'
import { InfoTooltip } from '@/components/InfoTooltip'
import { G } from '@/lib/glossary'
import type { PredatorRow } from '@/types/data'
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, BarChart, Bar, LineChart, Line,
  COLORS, CHART_THEME, ReferenceArea,
} from '@/components/charts'
import { useFilters as useFilterStore } from '@/store/filters'

export default function PredatorPage() {
  const { queryString } = useFilters()
  const [selectedMineral, setSelectedMineral] = useState('ZINC')
  const [selectedSupplier, setSelectedSupplier] = useState<PredatorRow | null>(null)

  const { data: meta } = useQuery<{ minerals: string[] }>({
    queryKey: ['meta'],
    queryFn: () => fetch('/api/data/meta').then((r) => r.json()),
    staleTime: Infinity,
  })

  const qs = queryString ? `${queryString}&mineral=${selectedMineral}` : `?mineral=${selectedMineral}`

  const { data, isLoading, refetch } = useQuery<PredatorRow[]>({
    queryKey: ['predator', queryString, selectedMineral],
    queryFn: () => fetch(`/api/data/analytics?type=predator${qs.replace('?', '&')}`).then((r) => r.json()),
    enabled: false,   // Manual trigger
  })

  const top25 = data?.filter((r) => r.predatorScore > 0).slice(0, 25) ?? []
  const zombies = data?.filter((r) => r.daysSilent > 455).length ?? 0
  const killZone = data?.filter((r) => r.predatorScore >= 60 && r.totalVol > (data.reduce((a, r) => a + r.totalVol, 0) / Math.max(data.length, 1))) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Predator Engine v4</h1>
          <p className="text-zinc-400 text-sm mt-1">Behavioral physics — detects desperation, decay, and vulnerability</p>
        </div>
        {data && (
          <ExportButton url={`/api/export?type=predator&mineral=${selectedMineral}${queryString.replace('?', '&')}`}
            label="Export Targets" />
        )}
      </div>

      {/* Info box */}
      <div className="bg-zinc-900 border border-amber-800/40 rounded-xl p-4 text-sm text-zinc-400">
        <div className="font-semibold text-amber-400 mb-2">How the Predator Engine works</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[
            { icon: '🩸', label: 'Desperation (20%)', desc: 'Statistical anomalies in shipment frequency — cash flow stress' },
            { icon: '🕸️', label: 'Network Entropy (10%)', desc: 'Mathematical chaos in buyer relationships' },
            { icon: '📉', label: 'Loyalty Decay (30%)', desc: 'Regression trend of primary buyer share over time' },
            { icon: '🐌', label: 'Peer Gap (15%)', desc: 'Supplier growing slower than market average' },
          ].map((item) => (
            <div key={item.label} className="bg-zinc-800/60 rounded-lg p-3">
              <div className="text-base mb-1">{item.icon}</div>
              <div className="font-medium text-zinc-300 mb-1">{item.label}</div>
              <div className="text-zinc-500">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <select
          value={selectedMineral}
          onChange={(e) => setSelectedMineral(e.target.value)}
          className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm
                     focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {meta?.minerals?.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm
                     font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {isLoading ? (
            <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>Analyzing…</>
          ) : (
            '⚡ Initialize Predator Algorithm'
          )}
        </button>
        {data && (
          <div className="flex gap-4 text-sm text-zinc-400 ml-2">
            <span>{data.length} suppliers analyzed</span>
            <span className="text-amber-400">{killZone.length} in kill zone</span>
            <span className="text-zinc-600">{zombies} inactive (&gt;15m)</span>
          </div>
        )}
      </div>

      {data && (
        <>
          {/* Kill Zone scatter */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">Kill Zone Matrix</h3>
              <div className="text-xs text-zinc-500">Top right = High Value + High Vulnerability</div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" />
                <XAxis dataKey="predatorScore" name="Vulnerability" type="number" domain={[0, 100]}
                  tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false}
                  label={{ value: 'Vulnerability Score', position: 'insideBottom', offset: -15, fill: CHART_THEME.text, fontSize: 11 }} />
                <YAxis dataKey="totalVol" name="Volume"
                  tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false}
                  tickFormatter={(v) => fmtTons(v)} />
                <ZAxis dataKey="stressIndex" range={[30, 300]} />
                {/* Kill zone highlight */}
                <ReferenceArea x1={60} x2={100} y1={0} y2={undefined}
                  fill="#EF4444" fillOpacity={0.05} stroke="#EF4444" strokeOpacity={0.3} />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload?.length) return null
                    const d = payload[0]?.payload as PredatorRow
                    return (
                      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs max-w-xs">
                        <div className="font-semibold text-white mb-2">{d.supplier}</div>
                        <div className="space-y-1 text-zinc-400">
                          <div>Score: <span className="text-white">{d.predatorScore.toFixed(1)}</span></div>
                          <div>Volume: <span className="text-white">{fmtTons(d.totalVol)}</span></div>
                          <div>Days Silent: <span className="text-white">{d.daysSilent}</span></div>
                          <div className="pt-1 text-zinc-500">{d.primaryWeakness}</div>
                        </div>
                      </div>
                    )
                  }}
                />
                <Scatter
                  data={data.filter((r) => r.predatorScore > 0).slice(0, 80)}
                  fill="#3B82F6"
                  fillOpacity={0.7}
                  onClick={(d: PredatorRow) => setSelectedSupplier(d)}
                  style={{ cursor: 'pointer' }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Priority hit list */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-white">Priority Hit List (Top 25)</h3>
              </div>
              <div className="overflow-y-auto max-h-80">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800">
                    <tr className="text-zinc-500">
                      <th className="text-left px-4 py-2 font-medium">Supplier</th>
                      <th className="text-right px-4 py-2 font-medium">
                        <span className="flex items-center justify-end gap-0.5">Score <InfoTooltip {...G.predatorScore} /></span>
                      </th>
                      <th className="text-right px-4 py-2 font-medium">
                        <span className="flex items-center justify-end gap-0.5">Silent <InfoTooltip {...G.zombieGuard} /></span>
                      </th>
                      <th className="text-left px-4 py-2 font-medium">Weakness</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top25.map((r, i) => (
                      <tr key={r.supplier}
                        onClick={() => setSelectedSupplier(r)}
                        className={cn(
                          'border-b border-zinc-800/50 cursor-pointer transition-colors',
                          selectedSupplier?.supplier === r.supplier ? 'bg-blue-900/20' : 'hover:bg-zinc-800/40',
                        )}>
                        <td className="px-4 py-2 text-zinc-300 font-medium truncate max-w-[120px]">{r.supplier}</td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            <div className="w-12 h-1 rounded-full bg-zinc-800">
                              <div className="h-1 rounded-full" style={{
                                width: `${r.predatorScore}%`,
                                background: r.predatorScore > 60 ? '#EF4444' : r.predatorScore > 30 ? '#F59E0B' : '#3B82F6',
                              }} />
                            </div>
                            <span className="text-zinc-300 tabular-nums w-8 text-right">{r.predatorScore.toFixed(0)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-zinc-500">{r.daysSilent}d</td>
                        <td className="px-4 py-2 text-zinc-500 truncate max-w-[120px]">{r.primaryWeakness}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Score history for selected supplier */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              {selectedSupplier ? (
                <>
                  <h3 className="text-sm font-semibold text-white mb-1">{selectedSupplier.supplier}</h3>
                  <p className="text-xs text-zinc-500 mb-4">Score history (last 6 quarters)</p>
                  {selectedSupplier.scoreHistory?.length ? (
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={selectedSupplier.scoreHistory}>
                        <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                        />
                        <Line type="monotone" dataKey="score" stroke="#EF4444" strokeWidth={2} dot={{ r: 4, fill: '#EF4444' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-xs text-zinc-600 italic">Insufficient history</div>
                  )}
                  {/* Component breakdown */}
                  <div className="mt-4 space-y-2">
                    {[
                      { label: 'Loyalty Decay', value: selectedSupplier.loyaltyDecay, max: 1, color: '#EF4444', info: G.loyaltyDecay },
                      { label: 'Cash Stress', value: selectedSupplier.stressIndex, max: 1, color: '#F59E0B', info: G.cashStress },
                      { label: 'Network Entropy', value: selectedSupplier.entropy / 2.5, max: 1, color: '#8B5CF6', info: G.networkEntropy },
                      { label: 'Peer Gap', value: Math.min(selectedSupplier.peerPerformanceGap, 1), max: 1, color: '#3B82F6', info: G.peerGap },
                      { label: 'Churn Risk', value: selectedSupplier.churnRisk, max: 1, color: '#F97316', info: G.churnRisk },
                    ].map((c) => (
                      <div key={c.label} className="flex items-center gap-2 text-xs">
                        <span className="text-zinc-500 w-28 flex items-center gap-0.5">{c.label} <InfoTooltip {...c.info} /></span>
                        <div className="flex-1 h-1.5 rounded-full bg-zinc-800">
                          <div className="h-1.5 rounded-full" style={{ width: `${Math.min(c.value, 1) * 100}%`, background: c.color }} />
                        </div>
                        <span className="text-zinc-400 w-10 text-right tabular-nums">{(c.value * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                  Click a supplier in the table or chart to see details
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
