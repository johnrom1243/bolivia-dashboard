'use client'
import { useQuery } from '@tanstack/react-query'
import { useFilters } from '@/store/filters'
import { KpiCard } from '@/components/KpiCard'
import { ExportButton } from '@/components/ExportButton'
import { fmtUsd, fmtTons, fmtNum } from '@/lib/utils'
import type { KpiData } from '@/types/data'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, Legend, PieChart, Pie, Cell,
  COLORS, CHART_THEME,
} from '@/components/charts'

export default function DashboardPage() {
  const { queryString } = useFilters()

  const { data, isLoading, isError } = useQuery<KpiData>({
    queryKey: ['kpis', queryString],
    queryFn: () => fetch(`/api/data/kpis${queryString}`).then((r) => r.json()),
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) return <ErrorState />

  const HEALTH_COLOR = { Healthy: '#10B981', Moderate: '#F59E0B', Concentrated: '#EF4444' }
  const healthColor = HEALTH_COLOR[data.marketHealth.score]

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Market Overview</h1>
          <p className="text-zinc-400 text-sm mt-1">Bolivia mineral export intelligence</p>
        </div>
        <ExportButton url={`/api/export?type=kpis${queryString}`} label="Export KPIs" filename="bolivia_kpis.xlsx" />
      </div>

      {/* Primary KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard label="Total Shipments" value={fmtNum(data.totalShipments)} icon="📦" accent="blue" />
        <KpiCard
          label="Total USD"
          value={fmtUsd(data.totalUsd, true)}
          trend={data.yoyGrowthUsd}
          trendLabel="YoY"
          icon="💵"
          accent="green"
        />
        <KpiCard
          label="Total Tonnage"
          value={fmtTons(data.totalTons)}
          trend={data.yoyGrowthTons}
          trendLabel="YoY"
          icon="⚖️"
          accent="blue"
        />
        <KpiCard label="Suppliers" value={fmtNum(data.uniqueSuppliers)} icon="🏭" accent="amber" />
        <KpiCard label="Buyers" value={fmtNum(data.uniqueBuyers)} icon="🏢" accent="purple" />
        <KpiCard
          label="Avg Shipment"
          value={fmtTons(data.avgShipmentTons)}
          subValue={fmtUsd(data.avgShipmentUsd, true)}
          subLabel="avg value"
          icon="🚚"
          accent="blue"
        />
      </div>

      {/* Rolling windows */}
      <div className="grid grid-cols-3 gap-4">
        {data.rollingMetrics.map((rm) => (
          <div key={rm.period} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Last {rm.period}</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-white">{fmtTons(rm.tons)}</div>
                <div className="text-xs text-zinc-500">Tons</div>
              </div>
              <div>
                <div className="text-lg font-bold text-white">{fmtUsd(rm.usd, true)}</div>
                <div className="text-xs text-zinc-500">USD</div>
              </div>
              <div>
                <div className="text-lg font-bold text-white">{fmtNum(rm.shipments)}</div>
                <div className="text-xs text-zinc-500">Shipments</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Market health + quarterly trend */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Market health */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Market Health</h3>
          <div className="space-y-3">
            <HealthRow
              label="Concentration"
              value={`HHI ${fmtNum(data.marketHealth.hhi)}`}
              badge={data.marketHealth.score}
              badgeColor={healthColor}
            />
            <HealthRow
              label="Top-4 Share (CR4)"
              value={`${data.marketHealth.cr4.toFixed(1)}%`}
              sub={data.marketHealth.cr4 > 60 ? 'High concentration' : 'Competitive'}
            />
            <HealthRow
              label="New Entrant Rate"
              value={`${data.marketHealth.newEntrantRate.toFixed(1)}%`}
              sub="vs total suppliers last quarter"
            />
          </div>
        </div>

        {/* Quarterly trend */}
        <div className="xl:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Quarterly Volume (USD)</h3>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data.quarterlyTrend} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
              <XAxis dataKey="quarter" tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => fmtUsd(v, true)} />
              <Tooltip
                contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8 }}
                labelStyle={{ color: '#fff', fontWeight: 600 }}
                itemStyle={{ color: '#a1a1aa' }}
                formatter={(v: number) => [fmtUsd(v), 'USD']}
              />
              <Bar dataKey="usd" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top movers + Top suppliers/buyers */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Top movers */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Top Movers (YoY)</h3>
          <div className="space-y-2">
            {data.topMovers.slice(0, 8).map((m) => (
              <div key={m.name} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-300 truncate">{m.name}</div>
                  <div className="text-xs text-zinc-500">{fmtUsd(m.currentUsd, true)}</div>
                </div>
                <div className={`text-sm font-semibold tabular-nums ${m.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {m.change > 0 ? '+' : ''}{m.change.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top suppliers */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Top Suppliers by USD</h3>
          <div className="space-y-2">
            {data.topSuppliers.slice(0, 8).map((s, i) => (
              <div key={s.name} className="flex items-center gap-3">
                <span className="text-xs text-zinc-600 w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-zinc-300 truncate max-w-[60%]">{s.name}</span>
                    <span className="text-xs text-zinc-400">{s.share.toFixed(1)}%</span>
                  </div>
                  <div className="score-bar">
                    <div className="score-bar-fill bg-blue-500" style={{ width: `${s.share}%` }} />
                  </div>
                </div>
                <span className="text-xs text-zinc-400 w-16 text-right tabular-nums">{fmtUsd(s.usd, true)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function HealthRow({
  label, value, sub, badge, badgeColor,
}: {
  label: string; value: string; sub?: string; badge?: string; badgeColor?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm text-zinc-400">{label}</div>
        {sub && <div className="text-xs text-zinc-600">{sub}</div>}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-white">{value}</span>
        {badge && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ color: badgeColor, background: badgeColor + '20', border: `1px solid ${badgeColor}40` }}>
            {badge}
          </span>
        )}
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-zinc-800 rounded animate-pulse" />
      <div className="grid grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
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
