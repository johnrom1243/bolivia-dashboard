/**
 * Month-based period helpers.
 *
 * The dataset is monthly: every row is dated the 1st of its month. Day-based
 * windows ("last 30 days") straddle month boundaries unevenly, so all period
 * comparisons should be done on YYYY-MM keys instead.
 */
import type { DataRow } from '@/types/data'

export const PENFOLD_MATCH = 'penfold'

export function isPenfold(buyer: string): boolean {
  return buyer.toLowerCase().includes(PENFOLD_MATCH)
}

/** 'YYYY-MM' key for a row date string */
export function monthKey(date: string): string {
  return date.slice(0, 7)
}

/** Latest month present in the dataset — the reference "current month" */
export function latestMonth(rows: DataRow[]): string {
  let max = ''
  for (const r of rows) if (r.Date > max) max = r.Date
  return monthKey(max)
}

/** Shift a 'YYYY-MM' key by n months (negative = back in time) */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/** Whole months from a to b (b later → positive) */
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by * 12 + bm) - (ay * 12 + am)
}

/** Inclusive list of month keys from start to end */
export function monthRange(start: string, end: string): string[] {
  const out: string[] = []
  for (let m = start; m <= end; m = addMonths(m, 1)) out.push(m)
  return out
}

/** 'Mar 2026' style label — timezone-safe (no Date parsing) */
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function monthLabel(ym: string): string {
  if (!ym || ym.length < 7) return '—'
  const [y, m] = ym.split('-').map(Number)
  return `${MONTH_ABBR[m - 1]} ${y}`
}

/**
 * Window of the last n months ending at ref (inclusive) and the equal-length
 * window immediately before it. e.g. ref=2026-03, n=3 →
 *   current: 2026-01..2026-03, previous: 2025-10..2025-12
 */
export function windows(ref: string, n: number) {
  const curStart = addMonths(ref, -(n - 1))
  const prevEnd = addMonths(curStart, -1)
  const prevStart = addMonths(prevEnd, -(n - 1))
  return { curStart, curEnd: ref, prevStart, prevEnd }
}
