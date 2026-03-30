/**
 * Data loading layer — reads the parquet or JSON data file and provides
 * filtered, query-ready access to it. All heavy analytics live in
 * src/lib/analytics/*.ts, not here.
 */
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import type { DataRow, FilterParams } from '@/types/data'

// ─── In-process cache (survives across requests in same Node.js instance) ──
let _cache: DataRow[] | null = null
let _cacheLoaded = false

// ─── Load data from JSON or parquet ────────────────────────────────────────
export async function getData(): Promise<DataRow[]> {
  if (_cacheLoaded && _cache) return _cache

  const jsonPath = path.join(process.cwd(), 'data', 'bolivia_data.json')
  const parquetPath = path.join(process.cwd(), 'data', 'bolivia_processed_data.parquet')

  // 1. Try pre-converted JSON first (fastest, preferred)
  if (existsSync(jsonPath)) {
    try {
      const raw = readFileSync(jsonPath, 'utf-8')
      const parsed: DataRow[] = JSON.parse(raw)
      _cache = normalise(parsed)
      _cacheLoaded = true
      return _cache
    } catch (e) {
      console.error('[db] JSON parse failed, falling back to parquet:', e)
    }
  }

  // 2. Fall back to parquet via hyparquet
  if (existsSync(parquetPath)) {
    try {
      const buffer = readFileSync(parquetPath)
      const { parquetRead } = await import('hyparquet')
      const rows: Record<string, unknown>[] = []

      await parquetRead({
        file: {
          byteLength: buffer.length,
          slice: (start: number, end?: number) =>
            Promise.resolve(
              buffer.buffer.slice(
                buffer.byteOffset + start,
                buffer.byteOffset + (end ?? buffer.length),
              ),
            ),
        },
        onChunk: (chunk: unknown) => {
          const { columnData, rowStart, rowEnd } = chunk as { columnData: Record<string, unknown[]>; rowStart: number; rowEnd: number }
          const cols = Object.keys(columnData)
          const numRows = rowEnd - rowStart
          for (let i = 0; i < numRows; i++) {
            const row: Record<string, unknown> = {}
            for (const col of cols) {
              row[col] = (columnData[col] as unknown[])[i]
            }
            rows.push(row)
          }
        },
      })

      _cache = normalise(rows as unknown as DataRow[])
      _cacheLoaded = true
      return _cache
    } catch (e) {
      console.error('[db] Parquet read failed:', e)
    }
  }

  throw new Error(
    'No data file found. Copy bolivia_processed_data.parquet to /data/ ' +
      'or run: npm run convert-data',
  )
}

// ─── Force reload (call after uploading new data) ──────────────────────────
export function invalidateCache() {
  _cache = null
  _cacheLoaded = false
}

// ─── Ensure computed columns exist and dates are strings ──────────────────
function normalise(rows: DataRow[]): DataRow[] {
  return rows.map((r) => {
    const date = toDateString(r.Date)
    const kg = Number(r.kg) || 0
    const usd = Number(r.usd) || 0
    const tons = Number(r.tons) || kg / 1000
    const usd_per_kg = usd > 0 && kg > 0 ? usd / kg : 0
    const d = new Date(date)
    const year = d.getFullYear()
    const month_num = d.getMonth() + 1

    return {
      ...r,
      Date: date,
      kg,
      usd,
      tons,
      usd_per_kg,
      year,
      month_num,
      month_name: r.month_name || d.toLocaleString('en', { month: 'long' }),
      Quarter: r.Quarter || `${year}Q${Math.ceil(month_num / 3)}`,
    }
  }).filter((r) => !isNaN(new Date(r.Date).getTime()))
}

function toDateString(val: unknown): string {
  if (typeof val === 'string') return val
  if (typeof val === 'number') {
    // Parquet sometimes stores dates as days since epoch
    return new Date(val * 86400000).toISOString().split('T')[0]
  }
  if (val instanceof Date) return val.toISOString().split('T')[0]
  if (val && typeof (val as { toString: () => string }).toString === 'function') {
    return String(val)
  }
  return ''
}

// ─── Apply standard filter params to a data array ─────────────────────────
export function applyFilters(rows: DataRow[], f: FilterParams): DataRow[] {
  let r = rows

  if (f.yearMin !== undefined) r = r.filter((d) => d.year >= f.yearMin!)
  if (f.yearMax !== undefined) r = r.filter((d) => d.year <= f.yearMax!)
  if (f.months?.length) r = r.filter((d) => f.months!.includes(d.month_num))
  if (f.minerals?.length) r = r.filter((d) => f.minerals!.includes(d.mineral))
  if (f.supplierSearch)
    r = r.filter((d) =>
      d.supplier.toLowerCase().includes(f.supplierSearch!.toLowerCase()),
    )
  if (f.buyerSearch)
    r = r.filter((d) =>
      d.buyer.toLowerCase().includes(f.buyerSearch!.toLowerCase()),
    )
  if (f.excludePenfold)
    r = r.filter((d) => !d.buyer.toLowerCase().includes('penfold'))
  if (f.onlyPenfold)
    r = r.filter((d) => d.buyer.toLowerCase().includes('penfold'))

  return r
}

// ─── Parse filter params from URL search params ────────────────────────────
export function parseFilters(params: URLSearchParams): FilterParams {
  const get = (k: string) => params.get(k)

  return {
    yearMin: get('yearMin') ? Number(get('yearMin')) : undefined,
    yearMax: get('yearMax') ? Number(get('yearMax')) : undefined,
    months: get('months')
      ? get('months')!.split(',').map(Number).filter(Boolean)
      : undefined,
    minerals: get('minerals')
      ? get('minerals')!.split(',').filter(Boolean)
      : undefined,
    supplierSearch: get('supplierSearch') || undefined,
    buyerSearch: get('buyerSearch') || undefined,
    excludePenfold: get('excludePenfold') === 'true',
    onlyPenfold: get('onlyPenfold') === 'true',
    topN: get('topN') ? Number(get('topN')) : 15,
  }
}

// ─── Helper: group by a field and sum numeric columns ─────────────────────
export function groupBySum(
  rows: DataRow[],
  key: keyof DataRow,
  metrics: (keyof DataRow)[],
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    const k = String(row[key])
    if (!result[k]) {
      result[k] = {}
      for (const m of metrics) result[k][m as string] = 0
    }
    for (const m of metrics) result[k][m as string] += Number(row[m]) || 0
  }
  return result
}

// ─── Helper: distinct values sorted ───────────────────────────────────────
export function distinct<T>(arr: T[]): T[] {
  return [...new Set(arr)].sort()
}

// ─── Helper: percentile of a sorted array ─────────────────────────────────
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.floor((p / 100) * (sorted.length - 1))
  return sorted[idx]
}

// ─── Helper: linear regression on (x[], y[]) → slope, intercept, r2 ──────
export function linregress(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
  const n = x.length
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 }
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0)
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0)
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 }
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const yMean = sumY / n
  const ssTot = y.reduce((acc, yi) => acc + (yi - yMean) ** 2, 0)
  const ssRes = y.reduce((acc, yi, i) => acc + (yi - (slope * x[i] + intercept)) ** 2, 0)
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot
  return { slope, intercept, r2 }
}

// ─── Helper: Shannon entropy ───────────────────────────────────────────────
export function shannonEntropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  return -counts.reduce((acc, c) => {
    if (c === 0) return acc
    const p = c / total
    return acc + p * Math.log2(p)
  }, 0)
}

// ─── Helper: gamma CDF approximation (Regularised incomplete gamma) ────────
export function gammaCdf(x: number, shape: number, scale: number): number {
  if (x <= 0 || shape <= 0 || scale <= 0) return 0
  return regularisedGammaP(shape, x / scale)
}

function regularisedGammaP(a: number, x: number): number {
  if (x < 0) return 0
  if (x === 0) return 0
  if (x < a + 1) {
    // Series expansion
    let sum = 1 / a
    let term = 1 / a
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n)
      sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-10) break
    }
    return Math.min(sum * Math.exp(-x + a * Math.log(x) - lnGamma(a)), 1)
  }
  // Continued fraction (Lentz)
  let fpmin = 1e-300
  let b = x + 1 - a
  let c = 1 / fpmin
  let d = 1 / b
  let h = d
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < fpmin) d = fpmin
    c = b + an / c
    if (Math.abs(c) < fpmin) c = fpmin
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-10) break
  }
  return Math.max(0, Math.min(1, 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h))
}

function lnGamma(z: number): number {
  // Lanczos approximation
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i)
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

// ─── Helper: fit gamma distribution to an array of values (MOM) ───────────
export function fitGamma(values: number[]): { shape: number; scale: number } {
  const n = values.length
  if (n < 2) return { shape: 1, scale: 1 }
  const mean = values.reduce((a, b) => a + b, 0) / n
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1)
  if (mean === 0 || variance === 0) return { shape: 1, scale: 1 }
  const scale = variance / mean
  const shape = mean / scale
  return { shape: Math.max(0.1, shape), scale: Math.max(0.1, scale) }
}
