import { cn } from '@/lib/utils'

interface KpiCardProps {
  label: string
  value: string
  subValue?: string
  subLabel?: string
  trend?: number | null   // positive = good, negative = bad
  trendLabel?: string
  icon?: string
  className?: string
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'purple'
}

const ACCENT = {
  blue:   { card: 'border-blue-500/20',   icon: 'text-blue-400',   trend: 'text-blue-400' },
  green:  { card: 'border-green-500/20',  icon: 'text-green-400',  trend: 'text-green-400' },
  amber:  { card: 'border-amber-500/20',  icon: 'text-amber-400',  trend: 'text-amber-400' },
  red:    { card: 'border-red-500/20',    icon: 'text-red-400',    trend: 'text-red-400' },
  purple: { card: 'border-purple-500/20', icon: 'text-purple-400', trend: 'text-purple-400' },
}

export function KpiCard({
  label,
  value,
  subValue,
  subLabel,
  trend,
  trendLabel,
  icon,
  className,
  accent = 'blue',
}: KpiCardProps) {
  const colors = ACCENT[accent]
  const trendUp = trend !== null && trend !== undefined && trend > 0
  const trendDown = trend !== null && trend !== undefined && trend < 0

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-zinc-900 border kpi-glow p-5 flex flex-col gap-2',
        colors.card,
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</span>
        {icon && <span className="text-lg leading-none opacity-60">{icon}</span>}
      </div>

      <div className="flex items-end gap-3">
        <div className="text-2xl font-bold text-white tabular-nums leading-none">{value}</div>
        {subValue && (
          <div className="text-sm text-zinc-500 leading-tight mb-0.5">
            {subLabel && <span className="block text-xs text-zinc-600">{subLabel}</span>}
            {subValue}
          </div>
        )}
      </div>

      {trend !== null && trend !== undefined && (
        <div className={cn(
          'flex items-center gap-1 text-xs font-medium',
          trendUp ? 'text-green-400' : trendDown ? 'text-red-400' : 'text-zinc-400',
        )}>
          {trendUp ? '▲' : trendDown ? '▼' : '—'}
          <span>{Math.abs(trend).toFixed(1)}%</span>
          {trendLabel && <span className="text-zinc-500 font-normal">{trendLabel}</span>}
        </div>
      )}
    </div>
  )
}
