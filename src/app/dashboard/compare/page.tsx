'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { fmtUsd, fmtTons, fmtNum, cn } from '@/lib/utils'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, COLORS, CHART_THEME,
} from '@/components/charts'

interface BuyerSummary {
  name: string
  totalUsd: number
  totalTons: number
  totalShipments: number
  uniqueSuppliers: number
  marketSharePct: number
  avgShipmentUsd: number
  avgShipmentTons: number
  firstShipment: string
  lastShipment: string
  daysSinceLast: number
  quarterlyVolume: { quarter: string; usd: number; tons: number }[]
  suppliers: { supplier: string; usd: number; tons: number; share: number }[]
  minerals: { mineral: string; usd: number; tons: number; share: number }[]
  pricingByMineral: { mineral: string; avgPrice: number; marketAvg: number }[]
}

interface CompareResult {
  a: BuyerSummary | null
  b: BuyerSummary | null
  sharedSuppliers: string[]
  quarterlyComparison: { quarter: string; usdA: number; usdB: number; tonsA: number; tonsB: number }[]
}

export default function ComparePage() {
  const { queryString } = useFilters()
  const [buyerA, setBuyerA] = useState('')
  const [buyerB, setBuyerB] = useState('')

  const { data: list } = useQuery<{ name: string; usd: number }[]>({
    queryKey: ['buyers-list', queryString],
    queryFn: () => fetch(`/api/data/buyers${queryString}`).then((r) => r.json()),
  })

  const enabled = !!buyerA && !!buyerB && buyerA !== buyerB
  const { data, isLoading } = useQuery<CompareResult>({
    queryKey: ['compare', buyerA, buyerB, queryString],
    queryFn: () =>
      fetch(`/api/data/compare?buyerA=${encodeURIComponent(buyerA)}&buyerB=${encodeURIComponent(buyerB)}${queryString.replace('?', '&')}`).then((r) => r.json()),
    enabled,
  })

  const buyers = (list ?? []).map((b) => b.name).sort()

  function StatRow({ label, a, b }: { label: string; a: string | number; b: string | number }) {
    return (
      <tr className="border-b border-zinc-800/50">
        <td className="px-4 py-2 text-right text-zinc-300 tabular-nums font-medium">{a}</td>
        <td className="px-4 py-2 text-center text-xs text-zinc-600">{label}</td>
        <td className="px-4 py-2 text-left text-zinc-300 tabular-nums font-medium">{b}</td>
      </tr>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Trader vs Trader Comparison</h1>
        <p className="text-zinc-400 text-sm mt-1">Side-by-side analysis of two buyers — market share, supplier overlap, pricing</p>
      </div>

      {/* Selector */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">Buyer A</label>
            <select value={buyerA} onChange={(e) => setBuyerA(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Select buyer…</option>
              {buyers.filter((b) => b !== buyerB).map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">Buyer B</label>
            <select value={buyerB} onChange={(e) => setBuyerB(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Select buyer…</option>
              {buyers.filter((b) => b !== buyerA).map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
        {!enabled && buyerA && buyerB && buyerA === buyerB && (
          <p className="text-red-400 text-xs mt-3">Select two different buyers to compare.</p>
        )}
      </div>

      {isLoading && (
        <div className="text-center text-zinc-500 py-12">Loading comparison…</div>
      )}

      {data && data.a && data.b && (
        <>
          {/* Header name strip */}
          <div className="grid grid-cols-2 gap-4">
            {[data.a, data.b].map((p, idx) => (
              <div key={p.name} className={cn('rounded-xl p-4 border', idx === 0 ? 'bg-blue-900/20 border-blue-700/30' : 'bg-violet-900/20 border-violet-700/30')}>
                <div className={cn('text-lg font-bold', idx === 0 ? 'text-blue-300' : 'text-violet-300')}>{p.name}</div>
                <div className="text-xs text-zinc-500 mt-1">{p.firstShipment} → {p.lastShipment}</div>
              </div>
            ))}
          </div>

          {/* Key stats comparison table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">Head-to-Head Stats</h3>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-xs">
                  <th className="text-right px-4 py-2 text-blue-400 font-semibold">{data.a.name}</th>
                  <th className="text-center px-4 py-2 text-zinc-500 font-medium">Metric</th>
                  <th className="text-left px-4 py-2 text-violet-400 font-semibold">{data.b.name}</th>
                </tr>
              </thead>
              <tbody>
                <StatRow label="Total Revenue" a={fmtUsd(data.a.totalUsd)} b={fmtUsd(data.b.totalUsd)} />
                <StatRow label="Total Volume" a={fmtTons(data.a.totalTons)} b={fmtTons(data.b.totalTons)} />
                <StatRow label="Shipments" a={fmtNum(data.a.totalShipments)} b={fmtNum(data.b.totalShipments)} />
                <StatRow label="Unique Suppliers" a={data.a.uniqueSuppliers} b={data.b.uniqueSuppliers} />
                <StatRow label="Market Share" a={`${data.a.marketSharePct.toFixed(2)}%`} b={`${data.b.marketSharePct.toFixed(2)}%`} />
                <StatRow label="Avg Shipment Value" a={fmtUsd(data.a.avgShipmentUsd)} b={fmtUsd(data.b.avgShipmentUsd)} />
                <StatRow label="Avg Shipment Size" a={fmtTons(data.a.avgShipmentTons)} b={fmtTons(data.b.avgShipmentTons)} />
                <StatRow label="Days Since Last Ship" a={data.a.daysSinceLast} b={data.b.daysSinceLast} />
              </tbody>
            </table>
          </div>

          {/* Quarterly comparison chart */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Quarterly Revenue Comparison</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.quarterlyComparison} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_THEME.gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="quarter" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => fmtUsd(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="usdA" fill="#3B82F6" name={data.a.name} radius={[3, 3, 0, 0]} />
                <Bar dataKey="usdB" fill="#8B5CF6" name={data.b.name} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Shared suppliers */}
          {data.sharedSuppliers.length > 0 && (
            <div className="bg-zinc-900 border border-amber-700/30 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-amber-400 mb-2">
                Shared Suppliers ({data.sharedSuppliers.length})
              </h3>
              <p className="text-xs text-zinc-500 mb-3">Both buyers source from these suppliers — potential competitive tension</p>
              <div className="flex flex-wrap gap-2">
                {data.sharedSuppliers.map((s) => (
                  <span key={s} className="px-3 py-1 rounded-full bg-amber-900/30 text-amber-300 text-xs border border-amber-700/30">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Supplier rosters side by side */}
          <div className="grid grid-cols-2 gap-4">
            {[data.a, data.b].map((p, idx) => (
              <div key={p.name} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className={cn('px-4 py-3 border-b border-zinc-800 text-sm font-semibold', idx === 0 ? 'text-blue-400' : 'text-violet-400')}>
                  {p.name} — Top Suppliers
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500">
                      <th className="text-left px-4 py-2 font-medium">Supplier</th>
                      <th className="text-right px-4 py-2 font-medium">Revenue</th>
                      <th className="text-right px-4 py-2 font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.suppliers.slice(0, 8).map((s) => (
                      <tr key={s.supplier}
                        className={cn('border-b border-zinc-800/50', data.sharedSuppliers.includes(s.supplier) && 'bg-amber-900/10')}>
                        <td className="px-4 py-1.5 text-zinc-300">
                          {data.sharedSuppliers.includes(s.supplier) && <span className="text-amber-500 mr-1">⚡</span>}
                          {s.supplier}
                        </td>
                        <td className="px-4 py-1.5 text-right text-zinc-500 tabular-nums">{fmtUsd(s.usd)}</td>
                        <td className="px-4 py-1.5 text-right text-zinc-500">{s.share.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Pricing comparison */}
          {data.a.pricingByMineral.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-white">Pricing Comparison by Mineral</h3>
                <p className="text-xs text-zinc-500 mt-1">Average USD/kg paid vs market average</p>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="text-left px-4 py-3 font-medium">Mineral</th>
                    <th className="text-right px-4 py-3 text-blue-400 font-medium">{data.a.name}</th>
                    <th className="text-right px-4 py-3 text-violet-400 font-medium">{data.b.name}</th>
                    <th className="text-right px-4 py-3 font-medium">Market Avg</th>
                    <th className="text-right px-4 py-3 font-medium">Better Buyer</th>
                  </tr>
                </thead>
                <tbody>
                  {data.a.pricingByMineral.map((pa) => {
                    const pb = data.b!.pricingByMineral.find((p) => p.mineral === pa.mineral)
                    const betterBuyer = pb
                      ? pa.avgPrice <= pb.avgPrice ? data.a!.name : data.b!.name
                      : '—'
                    return (
                      <tr key={pa.mineral} className="border-b border-zinc-800/50">
                        <td className="px-4 py-2 text-zinc-300">{pa.mineral}</td>
                        <td className="px-4 py-2 text-right text-blue-300 tabular-nums">${pa.avgPrice.toFixed(3)}/kg</td>
                        <td className="px-4 py-2 text-right text-violet-300 tabular-nums">${pb ? pb.avgPrice.toFixed(3) : '—'}/kg</td>
                        <td className="px-4 py-2 text-right text-zinc-500 tabular-nums">${pa.marketAvg.toFixed(3)}/kg</td>
                        <td className="px-4 py-2 text-right">
                          <span className="text-xs text-emerald-400 font-medium">{betterBuyer}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
