'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { KpiCard } from '@/components/KpiCard'
import { ExportButton } from '@/components/ExportButton'
import { InfoTooltip } from '@/components/InfoTooltip'
import { G } from '@/lib/glossary'
import { fmtUsd, fmtTons, fmtNum, mineralColor } from '@/lib/utils'
import type { KpiData } from '@/types/data'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, Legend, PieChart, Pie, Cell, Area, AreaChart,
  COLORS, CHART_THEME,
} from '@/components/charts'
import { ComposedChart } from 'recharts'

export default function DashboardPage() {
  const { queryString } = useFilters()
  const [priceTab, setPriceTab] = useState<'usd' | 'tons'>('usd')

  const { data, isLoading, isError } = useQuery<KpiData>({
    queryKey: ['kpis', queryString],
    queryFn: () => fetch(`/api/data/kpis${queryString}`).then((r) => r.json()),
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) return <ErrorState />

  const HEALTH_COLOR: Record<string, string> = {
    Healthy: '#10B981',
    Moderate: '#F59E0B',
    Concentrated: '#EF4444',
  }
  const healthColor = HEALTH_COLOR[data.marketHealth.score]

  const minerals = data.mineralBreakdown.map((m) => m.mineral)

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Market Overview</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Bolivia mineral export intelligence
            {data.dataDateRange && (
              <span className="ml-2 text-zinc-600">
                · Data: {data.dataDateRange.min} → {data.dataDateRange.max}
              </span>
            )}
          </p>
        </div>
        <ExportButton url={`/api/export?type=kpis${queryString}`} label="Export KPIs" filename="bolivia_kpis.xlsx" />
      </div>

      {/* ── Row 1: Primary KPI cards (8) ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <KpiCard label="Total Shipments" value={fmtNum(data.totalShipments)} icon="📦" accent="blue" info={G.totalShipments} />
        <KpiCard
          label="Total USD"
          value={fmtUsd(data.totalUsd, true)}
          trend={data.yoyGrowthUsd}
          trendLabel="YoY"
          icon="💵"
          accent="green"
          info={G.totalUsd}
        />
        <KpiCard
          label="Total Tonnage"
          value={fmtTons(data.totalTons)}
          trend={data.yoyGrowthTons}
          trendLabel="YoY"
          icon="⚖️"
          accent="blue"
          info={G.totalTons}
        />
        <KpiCard
          label="Avg Price / kg"
          value={`$${data.avgPricePerKg.toFixed(3)}`}
          icon="💲"
          accent="amber"
          info={G.avgPriceKg}
        />
        <KpiCard
          label="Penfold Share"
          value={`${data.penfoldSharePct.toFixed(1)}%`}
          subValue="of market USD"
          icon="🎯"
          accent="purple"
          info={G.penfoldShare}
        />
        <KpiCard
          label="Suppliers"
          value={fmtNum(data.uniqueSuppliers)}
          subValue={`+${data.marketHealth.newEntrantCount} new`}
          subLabel="this quarter"
          icon="🏭"
          accent="amber"
          info={G.uniqueSuppliers}
        />
        <KpiCard label="Buyers" value={fmtNum(data.uniqueBuyers)} icon="🏢" accent="purple" info={G.uniqueBuyers} />
        <KpiCard
          label="Avg Shipment"
          value={fmtTons(data.avgShipmentTons)}
          subValue={fmtUsd(data.avgShipmentUsd, true)}
          subLabel="avg value"
          icon="🚚"
          accent="blue"
          info={G.avgShipment}
        />
      </div>

      {/* ── Row 2: Rolling windows with period-over-period ─────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {data.rollingMetrics.map((rm) => (
          <div key={rm.period} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center text-xs text-zinc-500 uppercase tracking-wider">
                Last {rm.period}
                <InfoTooltip {...G.rollingWindow} />
              </div>
              <div className="text-xs text-zinc-600">vs prev {rm.period}</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <RollingCell label="Tons" value={fmtTons(rm.tons)} change={rm.changeTons} />
              <RollingCell label="USD" value={fmtUsd(rm.usd, true)} change={rm.changeUsd} />
              <RollingCell label="Shipments" value={fmtNum(rm.shipments)} change={rm.changeShipments} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Row 3: Quarterly dual-axis chart + Mineral donut ───────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Quarterly chart — USD bars + tons line */}
        <div className="xl:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Quarterly Trend — USD & Tonnage</h3>
            <div className="flex gap-3 text-xs text-zinc-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> USD</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-400 inline-block" /> Tons</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={data.quarterlyTrend} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
              <XAxis dataKey="quarter" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="usd" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => fmtUsd(v, true)} width={55} />
              <YAxis yAxisId="tons" orientation="right" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => fmtTons(v)} width={45} />
              <Tooltip
                contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                labelStyle={{ color: '#fff', fontWeight: 600 }}
                itemStyle={{ color: '#a1a1aa' }}
                formatter={(v: number, name: string) =>
                  name === 'usd' ? [fmtUsd(v), 'USD'] :
                  name === 'tons' ? [fmtTons(v), 'Tons'] :
                  [fmtNum(v), 'Shipments']
                }
              />
              <Bar yAxisId="usd" dataKey="usd" fill="#3B82F6" radius={[3, 3, 0, 0]} opacity={0.85} />
              <Line yAxisId="tons" dataKey="tons" stroke="#10B981" strokeWidth={2} dot={false} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Mineral breakdown donut */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Mineral Mix (USD)</h3>
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie
                data={data.mineralBreakdown}
                dataKey="usd"
                nameKey="mineral"
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={60}
                paddingAngle={2}
              >
                {data.mineralBreakdown.map((m) => (
                  <Cell key={m.mineral} fill={mineralColor(m.mineral)} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                formatter={(v: number, name: string) => [fmtUsd(v, true), name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {data.mineralBreakdown.map((m) => (
              <div key={m.mineral} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: mineralColor(m.mineral) }} />
                  <span className="text-zinc-300">{m.mineral}</span>
                </span>
                <div className="flex gap-3 tabular-nums text-zinc-400">
                  <span>{m.share.toFixed(1)}%</span>
                  <span>{fmtUsd(m.usd, true)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 4: Market health + Price per kg by mineral ─────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Market health — visual gauges */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Market Health</h3>
          <div className="space-y-4">
            <GaugeRow
              label="Supplier HHI"
              value={fmtNum(data.marketHealth.hhi)}
              sub={data.marketHealth.score}
              subColor={healthColor}
              pct={Math.min((data.marketHealth.hhi / 10000) * 100, 100)}
              barColor={healthColor}
              info={G.hhi}
            />
            <GaugeRow
              label="Supplier CR4"
              value={`${data.marketHealth.cr4.toFixed(1)}%`}
              sub={data.marketHealth.cr4 > 60 ? 'High concentration' : 'Competitive'}
              pct={Math.min(data.marketHealth.cr4, 100)}
              barColor={data.marketHealth.cr4 > 60 ? '#EF4444' : '#10B981'}
              info={G.supplierCr4}
            />
            <GaugeRow
              label="Buyer CR4"
              value={`${data.marketHealth.buyerCr4.toFixed(1)}%`}
              sub={data.marketHealth.buyerCr4 > 60 ? 'Buyer-side concentrated' : 'Buyer-side competitive'}
              pct={Math.min(data.marketHealth.buyerCr4, 100)}
              barColor={data.marketHealth.buyerCr4 > 60 ? '#EF4444' : '#8B5CF6'}
              info={G.buyerCr4}
            />
            <GaugeRow
              label="New Entrant Rate"
              value={`${data.marketHealth.newEntrantRate.toFixed(1)}% (${data.marketHealth.newEntrantCount})`}
              sub="new suppliers last quarter"
              pct={Math.min(data.marketHealth.newEntrantRate * 3, 100)}
              barColor="#F59E0B"
              info={G.newEntrantRate}
            />
            <GaugeRow
              label="Price Volatility"
              value={`${data.marketHealth.priceVolatilityPct.toFixed(1)}%`}
              sub="monthly avg price std dev"
              pct={Math.min(data.marketHealth.priceVolatilityPct * 2, 100)}
              barColor={data.marketHealth.priceVolatilityPct > 20 ? '#EF4444' : '#06B6D4'}
              info={G.priceVolatility}
            />
          </div>
        </div>

        {/* Price per kg by mineral over time */}
        <div className="xl:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Price Evolution — USD/kg by Mineral</h3>
            <div className="flex flex-wrap gap-2">
              {minerals.slice(0, 6).map((m) => (
                <span key={m} className="flex items-center gap-1 text-xs text-zinc-400">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: mineralColor(m) }} />
                  {m}
                </span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.priceByMineralQuarter} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
              <XAxis dataKey="quarter" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => `$${v}`} width={45} />
              <Tooltip
                contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                labelStyle={{ color: '#fff', fontWeight: 600 }}
                formatter={(v: number, name: string) => [`$${v.toFixed(3)}/kg`, name]}
              />
              {minerals.slice(0, 6).map((m) => (
                <Line key={m} dataKey={m} stroke={mineralColor(m)} strokeWidth={2} dot={false} type="monotone" connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Row 5: Top Suppliers + Top Buyers ──────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Top suppliers */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Top Suppliers</h3>
          <div className="grid grid-cols-12 text-xs text-zinc-500 uppercase tracking-wider mb-2 px-1">
            <span className="col-span-1">#</span>
            <span className="col-span-4">Supplier</span>
            <span className="col-span-2 text-right">USD</span>
            <span className="col-span-2 text-right">Tons</span>
            <span className="col-span-2 text-right flex items-center justify-end gap-0.5">
              $/kg <InfoTooltip {...G.avgPriceKg} />
            </span>
            <span className="col-span-1 text-right flex items-center justify-end gap-0.5">
              % <InfoTooltip term="Market Share %" what="This supplier's share of total market USD in the filtered range." calc="Supplier USD ÷ Total market USD × 100" />
            </span>
          </div>
          <div className="space-y-1.5">
            {data.topSuppliers.slice(0, 10).map((s, i) => (
              <div key={s.name} className="grid grid-cols-12 items-center text-xs px-1 py-1 rounded hover:bg-zinc-800 transition-colors">
                <span className="col-span-1 text-zinc-600">{i + 1}</span>
                <div className="col-span-4">
                  <div className="text-zinc-200 truncate pr-2">{s.name}</div>
                  <div className="score-bar mt-0.5">
                    <div className="score-bar-fill bg-blue-500" style={{ width: `${s.share}%` }} />
                  </div>
                </div>
                <span className="col-span-2 text-right text-zinc-300 tabular-nums">{fmtUsd(s.usd, true)}</span>
                <span className="col-span-2 text-right text-zinc-400 tabular-nums">{fmtTons(s.tons)}</span>
                <span className="col-span-2 text-right text-amber-400 tabular-nums">${s.avgPriceKg.toFixed(2)}</span>
                <span className="col-span-1 text-right text-zinc-500 tabular-nums">{s.share.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top buyers */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Top Buyers</h3>
          <div className="grid grid-cols-12 text-xs text-zinc-500 uppercase tracking-wider mb-2 px-1">
            <span className="col-span-1">#</span>
            <span className="col-span-5">Buyer</span>
            <span className="col-span-3 text-right">USD</span>
            <span className="col-span-2 text-right">Tons</span>
            <span className="col-span-1 text-right">%</span>
          </div>
          <div className="space-y-1.5">
            {data.topBuyers.slice(0, 10).map((b, i) => {
              const isPenfold = b.name.toLowerCase().includes('penfold')
              return (
                <div key={b.name} className={`grid grid-cols-12 items-center text-xs px-1 py-1 rounded transition-colors ${isPenfold ? 'bg-purple-900/20 border border-purple-800/30' : 'hover:bg-zinc-800'}`}>
                  <span className="col-span-1 text-zinc-600">{i + 1}</span>
                  <div className="col-span-5">
                    <div className={`truncate pr-2 ${isPenfold ? 'text-purple-300 font-medium' : 'text-zinc-200'}`}>
                      {b.name}{isPenfold && ' ★'}
                    </div>
                    <div className="score-bar mt-0.5">
                      <div className="score-bar-fill bg-purple-500" style={{ width: `${b.share}%` }} />
                    </div>
                  </div>
                  <span className="col-span-3 text-right text-zinc-300 tabular-nums">{fmtUsd(b.usd, true)}</span>
                  <span className="col-span-2 text-right text-zinc-400 tabular-nums">{fmtTons(b.tons)}</span>
                  <span className="col-span-1 text-right text-zinc-500 tabular-nums">{b.share.toFixed(1)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Row 6: Gainers / Losers ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Gainers */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-green-400 text-lg">▲</span>
            <h3 className="text-sm font-semibold text-white flex items-center gap-1">
              Top Gainers (YoY) <InfoTooltip {...G.yoy} />
            </h3>
            <span className="text-xs text-zinc-500 ml-auto">suppliers vs same period last year</span>
          </div>
          <div className="grid grid-cols-12 text-xs text-zinc-500 uppercase tracking-wider mb-2 px-1">
            <span className="col-span-5">Supplier</span>
            <span className="col-span-3 text-right">Current</span>
            <span className="col-span-2 text-right">+USD</span>
            <span className="col-span-2 text-right">Change</span>
          </div>
          <div className="space-y-1">
            {data.gainers.map((g) => (
              <div key={g.name} className="grid grid-cols-12 items-center text-xs px-1 py-1 rounded hover:bg-zinc-800 transition-colors">
                <span className="col-span-5 text-zinc-300 truncate pr-2">{g.name}</span>
                <span className="col-span-3 text-right text-zinc-400 tabular-nums">{fmtUsd(g.currentUsd, true)}</span>
                <span className="col-span-2 text-right text-green-400 tabular-nums">+{fmtUsd(g.usdDelta, true)}</span>
                <span className="col-span-2 text-right text-green-400 font-semibold tabular-nums">+{g.change.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Losers */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-red-400 text-lg">▼</span>
            <h3 className="text-sm font-semibold text-white">Top Losers (YoY)</h3>
            <span className="text-xs text-zinc-500 ml-auto">suppliers vs same period last year</span>
          </div>
          <div className="grid grid-cols-12 text-xs text-zinc-500 uppercase tracking-wider mb-2 px-1">
            <span className="col-span-5">Supplier</span>
            <span className="col-span-3 text-right">Current</span>
            <span className="col-span-2 text-right">−USD</span>
            <span className="col-span-2 text-right">Change</span>
          </div>
          <div className="space-y-1">
            {data.losers.map((l) => (
              <div key={l.name} className="grid grid-cols-12 items-center text-xs px-1 py-1 rounded hover:bg-zinc-800 transition-colors">
                <span className="col-span-5 text-zinc-300 truncate pr-2">{l.name}</span>
                <span className="col-span-3 text-right text-zinc-400 tabular-nums">{fmtUsd(l.currentUsd, true)}</span>
                <span className="col-span-2 text-right text-red-400 tabular-nums">{fmtUsd(l.usdDelta, true)}</span>
                <span className="col-span-2 text-right text-red-400 font-semibold tabular-nums">{l.change.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 7: Monthly trend ────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Monthly Activity</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setPriceTab('usd')}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${priceTab === 'usd' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              USD
            </button>
            <button
              onClick={() => setPriceTab('tons')}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${priceTab === 'tons' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Tonnage
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data.monthlyTrend} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradUsd" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradTons" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} axisLine={false}
              tickFormatter={(v: string) => v.slice(0, 7)}
              interval={Math.floor(data.monthlyTrend.length / 12)}
            />
            <YAxis tick={{ fill: CHART_THEME.text, fontSize: 10 }} tickLine={false} axisLine={false}
              tickFormatter={(v) => priceTab === 'usd' ? fmtUsd(v, true) : fmtTons(v)}
              width={55}
            />
            <Tooltip
              contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
              labelStyle={{ color: '#fff', fontWeight: 600 }}
              formatter={(v: number) => priceTab === 'usd' ? [fmtUsd(v), 'USD'] : [fmtTons(v), 'Tons']}
            />
            {priceTab === 'usd' ? (
              <Area dataKey="usd" stroke="#3B82F6" strokeWidth={2} fill="url(#gradUsd)" type="monotone" dot={false} />
            ) : (
              <Area dataKey="tons" stroke="#10B981" strokeWidth={2} fill="url(#gradTons)" type="monotone" dot={false} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Row 8: Mineral detail table ─────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Mineral Breakdown</h3>
        <div className="grid grid-cols-12 text-xs text-zinc-500 uppercase tracking-wider mb-2 px-2">
          <span className="col-span-3">Mineral</span>
          <span className="col-span-2 text-right">USD</span>
          <span className="col-span-2 text-right">Share</span>
          <span className="col-span-2 text-right">Tons</span>
          <span className="col-span-2 text-right">Avg $/kg</span>
          <span className="col-span-1 text-right">Shipments</span>
        </div>
        <div className="space-y-1">
          {data.mineralBreakdown.map((m) => (
            <div key={m.mineral} className="grid grid-cols-12 items-center text-xs px-2 py-1.5 rounded hover:bg-zinc-800 transition-colors">
              <div className="col-span-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: mineralColor(m.mineral) }} />
                <span className="text-zinc-200 font-medium">{m.mineral}</span>
              </div>
              <span className="col-span-2 text-right text-zinc-300 tabular-nums">{fmtUsd(m.usd, true)}</span>
              <div className="col-span-2 text-right">
                <span className="text-zinc-400 tabular-nums">{m.share.toFixed(1)}%</span>
                <div className="score-bar mt-0.5">
                  <div className="score-bar-fill" style={{ width: `${m.share}%`, background: mineralColor(m.mineral) }} />
                </div>
              </div>
              <span className="col-span-2 text-right text-zinc-400 tabular-nums">{fmtTons(m.tons)}</span>
              <span className="col-span-2 text-right text-amber-400 tabular-nums">${m.avgPriceKg.toFixed(3)}</span>
              <span className="col-span-1 text-right text-zinc-500 tabular-nums">{fmtNum(m.shipments)}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function RollingCell({ label, value, change }: { label: string; value: string; change: number }) {
  const up = change > 0
  const down = change < 0
  return (
    <div className="text-center">
      <div className="text-base font-bold text-white">{value}</div>
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className={`text-xs font-medium ${up ? 'text-green-400' : down ? 'text-red-400' : 'text-zinc-500'}`}>
        {up ? '▲' : down ? '▼' : '—'} {Math.abs(change).toFixed(1)}%
      </div>
    </div>
  )
}

function GaugeRow({
  label, value, sub, subColor, pct, barColor, info,
}: {
  label: string; value: string; sub?: string; subColor?: string; pct: number; barColor: string
  info?: { term: string; what: string; calc?: string }
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="flex items-center text-xs text-zinc-400">
            {label}
            {info && <InfoTooltip {...info} />}
          </div>
          {sub && (
            <div className="text-xs" style={{ color: subColor || '#71717a' }}>{sub}</div>
          )}
        </div>
        <span className="text-sm font-semibold text-white tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
        />
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-zinc-800 rounded animate-pulse" />
      <div className="grid grid-cols-8 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-24 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-28 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  )
}

function ErrorState() {
  return (
    <div className="flex items-center justify-center h-64 text-zinc-500">
      <div className="text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <div className="font-medium text-white mb-1">Failed to load data</div>
        <div className="text-sm">Check that the data file exists in /data/ and reload</div>
      </div>
    </div>
  )
}
