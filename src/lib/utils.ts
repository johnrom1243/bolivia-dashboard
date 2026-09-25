import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtUsd(n: number, compact = false): string {
  if (compact) {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
    return `$${n.toFixed(0)}`
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function fmtTons(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}Mt`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}kt`
  return `${n.toFixed(1)}t`
}

export function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n))
}

export function fmtPct(n: number, decimals = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`
}

export function fmtDate(s: string): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function quarterlySorter(a: string, b: string): number {
  return a.localeCompare(b)
}

/** Build query string from filter params */
export function buildQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v) && v.length) q.set(k, v.join(','))
    else if (!Array.isArray(v)) q.set(k, String(v))
  }
  return q.toString() ? `?${q.toString()}` : ''
}

/** Colour palette used consistently across all charts */
export const CHART_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#F97316', '#EC4899', '#6EE7B7', '#FCA5A5',
  '#93C5FD', '#FDE68A', '#DDD6FE', '#99F6E4', '#FDBA74',
]

// Keyed by the mineral names that actually appear in the data
export const MINERAL_COLORS: Record<string, string> = {
  'Zinc Ores': '#3B82F6',
  'Lead Ores': '#EF4444',
  'Silver Ores': '#A78BFA',
  'Silver Bars': '#C4B5FD',
  'Tin Ores': '#10B981',
  'Tin Metals': '#34D399',
  'Antimony Ores': '#F59E0B',
  'Antimony Metals': '#FBBF24',
  'Antimony Oxides': '#FDE68A',
  'Copper Ores': '#F97316',
  'Gold Ores': '#EAB308',
  'Tungsten Ores': '#06B6D4',
  'Lithium Carbonate': '#EC4899',
}

export function mineralColor(mineral: string): string {
  if (!mineral) return CHART_COLORS[0]
  if (MINERAL_COLORS[mineral]) return MINERAL_COLORS[mineral]
  // Stable fallback for any new mineral: hash the full name, not just the first letter
  let h = 0
  for (let i = 0; i < mineral.length; i++) h = (h * 31 + mineral.charCodeAt(i)) >>> 0
  return CHART_COLORS[h % CHART_COLORS.length]
}
