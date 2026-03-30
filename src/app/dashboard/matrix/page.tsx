'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { ExportButton } from '@/components/ExportButton'
import { fmtUsd, fmtTons, fmtNum, cn } from '@/lib/utils'
import type { MatrixData } from '@/types/data'

type Metric = 'usd' | 'tons' | 'kg'

function heatColor(value: number, max: number): string {
  if (value === 0 || max === 0) return ''
  const intensity = Math.pow(value / max, 0.5)
  const r = Math.round(59 + (139 - 59) * intensity)
  const g = Math.round(130 - 130 * intensity)
  const b = Math.round(246 - 100 * intensity)
  return `rgba(${r},${g},${b},${0.2 + intensity * 0.6})`
}

function deltaColor(delta: number): string {
  if (delta > 0) return 'text-emerald-400'
  if (delta < 0) return 'text-red-400'
  return 'text-zinc-500'
}

export default function MatrixPage() {
  const { queryString } = useFilters()
  const [metric, setMetric] = useState<Metric>('usd')
  const [comparePrev, setComparePrev] = useState(false)
  const [showDelta, setShowDelta] = useState(false)
  const [maxRows, setMaxRows] = useState(20)
  const [maxCols, setMaxCols] = useState(15)

  const qs = `?metric=${metric}&comparePrev=${comparePrev}${queryString.replace('?', '&')}`

  const { data, isLoading } = useQuery<MatrixData | null>({
    queryKey: ['matrix', qs],
    queryFn: () => fetch(`/api/data/matrix${qs}`).then((r) => r.json()),
  })

  const formatVal = (v: number) =>
    metric === 'usd' ? fmtUsd(v) : metric === 'tons' ? fmtTons(v) : fmtNum(v)

  const maxVal = useMemo(() => {
    if (!data) return 1
    return Math.max(
      ...data.suppliers.slice(0, maxRows).flatMap((s) =>
        data.buyers.slice(0, maxCols).map((b) => data.values[s]?.[b] ?? 0),
      ),
      1,
    )
  }, [data, maxRows, maxCols])

  const suppliers = data?.suppliers.slice(0, maxRows) ?? []
  const buyers = data?.buyers.slice(0, maxCols) ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Supplier × Buyer Matrix</h1>
          <p className="text-zinc-400 text-sm mt-1">Heatmap pivot — click cells to see values, toggle delta vs previous period</p>
        </div>
        <ExportButton url={`/api/export?type=matrix&metric=${metric}${queryString.replace('?', '&')}`} label="Export" filename="matrix.xlsx" />
      </div>

      {/* Controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <span className="text-xs text-zinc-500 block mb-1.5">Metric</span>
            <div className="flex gap-1">
              {(['usd', 'tons', 'kg'] as Metric[]).map((m) => (
                <button key={m} onClick={() => setMetric(m)}
                  className={cn('px-3 py-1.5 rounded text-xs font-medium transition-colors',
                    metric === m ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700')}>
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs text-zinc-500 block mb-1.5">Max Suppliers</span>
            <select value={maxRows} onChange={(e) => setMaxRows(Number(e.target.value))}
              className="px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-white text-xs focus:outline-none">
              {[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div>
            <span className="text-xs text-zinc-500 block mb-1.5">Max Buyers</span>
            <select value={maxCols} onChange={(e) => setMaxCols(Number(e.target.value))}
              className="px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-white text-xs focus:outline-none">
              {[10, 15, 20, 30].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={comparePrev} onChange={(e) => { setComparePrev(e.target.checked); if (!e.target.checked) setShowDelta(false) }}
                className="rounded accent-blue-500" />
              <span className="text-xs text-zinc-300">Compare vs prev period</span>
            </label>
            {comparePrev && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showDelta} onChange={(e) => setShowDelta(e.target.checked)}
                  className="rounded accent-blue-500" />
                <span className="text-xs text-zinc-300">Show delta values</span>
              </label>
            )}
          </div>
        </div>
      </div>

      {isLoading && <div className="flex items-center justify-center h-40 text-zinc-500">Building matrix…</div>}

      {data && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Grand Total', value: formatVal(data.grandTotal) },
              { label: 'Suppliers', value: fmtNum(data.suppliers.length) },
              { label: 'Buyers', value: fmtNum(data.buyers.length) },
              { label: 'Active Pairs', value: fmtNum(Object.values(data.values).reduce((a, b) => a + Object.keys(b).length, 0)) },
            ].map((s) => (
              <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-xs text-zinc-500 mb-1">{s.label}</div>
                <div className="text-xl font-bold text-white">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Matrix table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-auto max-h-[600px]">
              <table className="text-xs border-collapse">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-zinc-900">
                    <th className="sticky left-0 z-30 bg-zinc-900 px-3 py-2 text-left text-zinc-500 font-medium min-w-[140px] border-b border-r border-zinc-800">
                      Supplier ↓ / Buyer →
                    </th>
                    <th className="px-3 py-2 text-right text-zinc-400 font-semibold border-b border-zinc-800 min-w-[80px]">Total</th>
                    {buyers.map((b) => (
                      <th key={b} className="px-2 py-2 text-zinc-400 font-normal border-b border-zinc-800 min-w-[80px] max-w-[100px]">
                        <div className="truncate" title={b} style={{ maxWidth: 80 }}>{b}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Column totals row */}
                  <tr className="border-b border-zinc-700 bg-zinc-800/50">
                    <td className="sticky left-0 z-10 bg-zinc-800/50 px-3 py-1.5 text-zinc-400 font-semibold border-r border-zinc-800">Total</td>
                    <td className="px-3 py-1.5 text-right text-zinc-300 font-semibold tabular-nums">{formatVal(data.grandTotal)}</td>
                    {buyers.map((b) => (
                      <td key={b} className="px-2 py-1.5 text-right text-zinc-400 tabular-nums font-medium">{formatVal(data.colTotals[b] ?? 0)}</td>
                    ))}
                  </tr>

                  {suppliers.map((s) => (
                    <tr key={s} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                      <td className="sticky left-0 z-10 bg-zinc-900 px-3 py-1.5 text-zinc-300 font-medium border-r border-zinc-800 max-w-[140px] truncate hover:bg-zinc-800/50" title={s}>
                        {s}
                      </td>
                      <td className="px-3 py-1.5 text-right text-zinc-400 tabular-nums font-medium">{formatVal(data.rowTotals[s] ?? 0)}</td>
                      {buyers.map((b) => {
                        const val = data.values[s]?.[b] ?? 0
                        const delta = showDelta && data.deltaVsPrev ? (data.deltaVsPrev[s]?.[b] ?? 0) : null
                        const bg = heatColor(val, maxVal)
                        return (
                          <td key={b} className="px-2 py-1.5 text-right tabular-nums" style={{ background: bg }}>
                            {val > 0 ? (
                              <div>
                                <span className="text-zinc-200">{formatVal(val)}</span>
                                {delta !== null && delta !== 0 && (
                                  <div className={cn('text-xs', deltaColor(delta))}>
                                    {delta > 0 ? '+' : ''}{formatVal(Math.abs(delta))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-zinc-800">—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {(data.suppliers.length > maxRows || data.buyers.length > maxCols) && (
            <p className="text-xs text-zinc-600 text-center">
              Showing {suppliers.length} of {data.suppliers.length} suppliers, {buyers.length} of {data.buyers.length} buyers.
              Increase limits above to see more.
            </p>
          )}
        </>
      )}
    </div>
  )
}
