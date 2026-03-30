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

export const MINERAL_COLORS: Record<string, string> = {
  ZINC: '#3B82F6',
  TIN: '#10B981',
  ANTIMONY: '#F59E0B',
  LEAD: '#EF4444',
  SILVER: '#8B5CF6',
  COPPER: '#F97316',
  BISMUTH: '#06B6D4',
}

export function mineralColor(mineral: string): string {
  return MINERAL_COLORS[mineral?.toUpperCase()] ?? CHART_COLORS[mineral?.charCodeAt(0) % CHART_COLORS.length ?? 0]
}
