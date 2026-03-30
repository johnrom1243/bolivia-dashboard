'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { fmtTons, cn } from '@/lib/utils'
import type { ForensicResult, SuspectInvestigation } from '@/types/data'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, COLORS, CHART_THEME, ReferenceLine,
} from '@/components/charts'

export default function ForensicPage() {
  const { queryString } = useFilters()
  const { data: meta } = useQuery<{ minerals: string[] }>({ queryKey: ['meta'], queryFn: () => fetch('/api/data/meta').then((r) => r.json()), staleTime: Infinity })

  const [mineral, setMineral] = useState('')
  const [targetVol, setTargetVol] = useState(100)
  const [tolerance, setTolerance] = useState(20)
  const [metric, setMetric] = useState<'tons' | 'kg'>('tons')
  const [suspect, setSuspect] = useState<string>('')

  const qs = `?mineral=${mineral}&targetVol=${targetVol}&tolerance=${tolerance}&metric=${metric}${queryString.replace('?', '&')}`

  const { data: results, refetch, isLoading: scanning } = useQuery<ForensicResult>({
    queryKey: ['forensic', qs],
    queryFn: () => fetch(`/api/data/forensic${qs}`).then((r) => r.json()),
    enabled: false,
  })

  const { data: investigation } = useQuery<SuspectInvestigation>({
    queryKey: ['investigation', suspect, mineral, queryString],
    queryFn: () => fetch(`/api/data/forensic?suspect=${encodeURIComponent(suspect)}&mineral=${mineral}${queryString.replace('?', '&')}`).then((r) => r.json()),
    enabled: !!suspect,
  })

  const allSuspects = [
    ...(results?.directSuspects ?? []).map((s) => s.buyer),
    ...(results?.splitSuspects ?? []).map((s) => s.buyer),
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Forensic Detective</h1>
        <p className="text-zinc-400 text-sm mt-1">Find hidden buyers by behavioral volume patterns — not by name</p>
      </div>

      {/* Investigation parameters */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Investigation Parameters</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">1. Suspect Mineral</label>
            <select value={mineral} onChange={(e) => setMineral(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">All minerals</option>
              {meta?.minerals?.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">2. Target Monthly Volume ({metric})</label>
            <input type="number" value={targetVol} onChange={(e) => setTargetVol(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">3. Tolerance (± {tolerance}%)</label>
            <input type="range" min={0} max={50} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))}
              className="w-full mt-2 accent-blue-500" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">4. Metric</label>
            <div className="flex gap-2 mt-1">
              {(['tons', 'kg'] as const).map((m) => (
                <button key={m} onClick={() => setMetric(m)}
                  className={cn('flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                    metric === m ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700')}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button onClick={() => refetch()} disabled={scanning}
          className="mt-4 px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
          {scanning ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Scanning…</> : '🔍 Run Forensic Scan'}
        </button>
      </div>

      {results && (
        <>
          <div className="grid grid-cols-2 gap-4">
            {/* Direct suspects */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-white">Primary Suspects — Direct Match</h3>
                <p className="text-xs text-zinc-500 mt-1">Buyers averaging ~{targetVol} {metric}/month ±{tolerance}%</p>
              </div>
              {results.directSuspects.length ? (
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="text-left px-4 py-2 font-medium">Buyer</th>
                    <th className="text-right px-4 py-2 font-medium">Avg/Month</th>
                    <th className="text-right px-4 py-2 font-medium">Active Months</th>
                    <th className="text-right px-4 py-2 font-medium">Last Seen</th>
                  </tr></thead>
                  <tbody>
                    {results.directSuspects.map((s) => (
                      <tr key={s.buyer} onClick={() => setSuspect(s.buyer)}
                        className={cn('border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800/40 transition-colors',
                          suspect === s.buyer && 'bg-blue-900/20')}>
                        <td className="px-4 py-2 text-blue-400 font-medium">{s.buyer}</td>
                        <td className="px-4 py-2 text-right text-zinc-300 tabular-nums">{s.avgMonthlyVol.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right text-zinc-500">{s.activeMonths}</td>
                        <td className="px-4 py-2 text-right text-zinc-500">{s.lastSeen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="px-5 py-6 text-zinc-500 text-sm">No direct matches found</div>}
            </div>

            {/* Split suspects */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-white">Split Suspects — 50% Volume</h3>
                <p className="text-xs text-zinc-500 mt-1">Pairs that together equal ~{targetVol} {metric}/month</p>
              </div>
              {results.splitSuspects.length ? (
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="text-left px-4 py-2 font-medium">Buyer</th>
                    <th className="text-right px-4 py-2 font-medium">Avg/Month</th>
                    <th className="text-right px-4 py-2 font-medium">Active Months</th>
                    <th className="text-right px-4 py-2 font-medium">Last Seen</th>
                  </tr></thead>
                  <tbody>
                    {results.splitSuspects.map((s) => (
                      <tr key={s.buyer} onClick={() => setSuspect(s.buyer)}
                        className={cn('border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800/40 transition-colors',
                          suspect === s.buyer && 'bg-blue-900/20')}>
                        <td className="px-4 py-2 text-amber-400 font-medium">{s.buyer}</td>
                        <td className="px-4 py-2 text-right text-zinc-300 tabular-nums">{s.avgMonthlyVol.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right text-zinc-500">{s.activeMonths}</td>
                        <td className="px-4 py-2 text-right text-zinc-500">{s.lastSeen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="px-5 py-6 text-zinc-500 text-sm">No split-buyer matches found</div>}
            </div>
          </div>

          {/* Anomalies — NEW */}
          {results.anomalies.length > 0 && (
            <div className="bg-zinc-900 border border-amber-800/30 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-amber-800/30">
                <h3 className="text-sm font-semibold text-amber-400">Volume Anomalies Detected</h3>
                <p className="text-xs text-zinc-500 mt-1">Statistical outliers (Z-score &gt; 2.5) in buyer volume patterns</p>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="text-left px-4 py-2 font-medium">Buyer</th>
                  <th className="text-center px-4 py-2 font-medium">Type</th>
                  <th className="text-right px-4 py-2 font-medium">Date</th>
                  <th className="text-right px-4 py-2 font-medium">Volume</th>
                  <th className="text-right px-4 py-2 font-medium">Z-Score</th>
                </tr></thead>
                <tbody>
                  {results.anomalies.slice(0, 15).map((a, i) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      <td className="px-4 py-2 text-zinc-300">{a.buyer}</td>
                      <td className="px-4 py-2 text-center"><span className="text-xs bg-amber-900/40 text-amber-400 px-2 py-0.5 rounded-full">{a.type}</span></td>
                      <td className="px-4 py-2 text-right text-zinc-500">{a.date}</td>
                      <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">{a.value.toFixed(1)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-amber-400">{a.zscore > 0 ? '+' : ''}{a.zscore.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Suspect investigation */}
      {investigation && suspect && (
        <div className="bg-zinc-900 border border-blue-800/30 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-blue-800/30">
            <h3 className="text-sm font-semibold text-white">Investigating: <span className="text-blue-400">{suspect}</span></h3>
            <div className="flex gap-6 mt-2 text-xs text-zinc-500">
              <span>Total: <span className="text-white font-medium">{fmtTons(investigation.totalVolume)}</span></span>
              <span>Suppliers: <span className="text-white font-medium">{investigation.uniqueSuppliers}</span></span>
              {investigation.supplierBreakdown[0] && (
                <span>Primary Supplier: <span className="text-white font-medium">{investigation.supplierBreakdown[0].supplier}</span>
                  <span className="ml-1 text-zinc-600">({investigation.supplierBreakdown[0].shareOfWallet.toFixed(1)}% wallet)</span></span>
              )}
            </div>
          </div>

          {/* Timeline chart */}
          <div className="p-5">
            <h4 className="text-xs font-semibold text-zinc-400 mb-3">Monthly Procurement by Supplier</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={(() => {
                const grouped: Record<string, Record<string, number>> = {}
                for (const t of investigation.monthlyTimeline) {
                  if (!grouped[t.date]) grouped[t.date] = {}
                  grouped[t.date][t.supplier] = t.qty
                }
                return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, supps]) => ({ date, ...supps }))
              })()} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} />
                <ReferenceLine y={targetVol} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Target', fill: '#EF4444', fontSize: 10 }} />
                {investigation.supplierBreakdown.slice(0, 6).map((s, i) => (
                  <Bar key={s.supplier} dataKey={s.supplier} stackId="a" fill={COLORS[i % COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Supplier dossier table */}
          <div className="px-5 pb-5">
            <h4 className="text-xs font-semibold text-zinc-400 mb-3">Supplier Dossier</h4>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left py-2 font-medium">Supplier</th>
                <th className="text-right py-2 font-medium">Dependency</th>
                <th className="text-right py-2 font-medium">Total</th>
                <th className="text-right py-2 font-medium">Shipments</th>
                <th className="text-right py-2 font-medium">Avg Lot</th>
                <th className="text-right py-2 font-medium">Last Purchase</th>
              </tr></thead>
              <tbody>
                {investigation.supplierBreakdown.map((s) => (
                  <tr key={s.supplier} className="border-b border-zinc-800/50">
                    <td className="py-2 text-zinc-300 font-medium">{s.supplier}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <div className="w-16 h-1 rounded-full bg-zinc-800"><div className="h-1 rounded-full bg-blue-500" style={{ width: `${s.shareOfWallet}%` }} /></div>
                        <span className="text-zinc-400 tabular-nums">{s.shareOfWallet.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="py-2 text-right text-zinc-400 tabular-nums">{fmtTons(s.totalQty)}</td>
                    <td className="py-2 text-right text-zinc-500">{s.shipmentCount}</td>
                    <td className="py-2 text-right text-zinc-500 tabular-nums">{s.avgShipmentSize.toFixed(1)}</td>
                    <td className="py-2 text-right text-zinc-500">{s.lastPurchase}</td>
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
