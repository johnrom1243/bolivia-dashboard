/**
 * Penfold Watch — supplier leakage / "cheating" detector.
 *
 * For every supplier × mineral that has EVER sold to Penfold, compare the
 * current window (last N months) against a baseline (the M months before it):
 *   - how much went to Penfold vs to competitors
 *   - Penfold's share of that supplier's volume (tons), now vs baseline
 *   - which competitors received volume, and whether any are brand-new
 *   - the price competitors paid vs Penfold (a likely reason for switching)
 *
 * Status (evaluated in this order):
 *   Lost      — shipped to Penfold in the baseline, zero to Penfold now, still shipping to competitors
 *   Former    — sold to Penfold before the baseline, now only ships to competitors (win-back lead)
 *   Dormant   — no shipments at all in the current window
 *   Leaking   — still ships to Penfold but share fell ≥ 15 pts vs baseline
 *   Split     — ships to Penfold AND competitors in the window
 *   Exclusive — ships only to Penfold in the window
 */
import type { DataRow } from '@/types/data'
import { isPenfold, monthKey, addMonths, monthRange } from '@/lib/period'

export type WatchStatus = 'Lost' | 'Former' | 'Dormant' | 'Leaking' | 'Split' | 'Exclusive'

export interface WatchCompetitor {
  buyer: string
  tons: number
  usd: number
  avgPriceKg: number
  firstMonth: string // first month this buyer ever took this supplier×mineral
  isNew: boolean     // first relationship falls inside the current window
}

export interface WatchRow {
  supplier: string
  mineral: string
  status: WatchStatus
  penTons: number
  penUsd: number
  compTons: number
  compUsd: number
  penTonsBase: number
  compTonsBase: number
  shareNow: number | null   // % of tons to Penfold in window (null if no shipments)
  shareBase: number | null  // % of tons to Penfold in baseline
  shareDelta: number | null // pts
  penPriceKg: number        // Penfold avg $/kg (window, falls back to baseline)
  compPriceKg: number       // competitors avg $/kg (window)
  priceGapPct: number | null // + = competitors paid more than Penfold
  firstPenfoldMonth: string
  lastPenfoldMonth: string
  lastAnyMonth: string
  monthsSincePenfold: number
  competitors: WatchCompetitor[]
  newCompetitors: number
  monthly: { month: string; penfold: number; competitors: number }[] // in the chosen basis
  severity: number
}

export interface WatchResult {
  refMonth: string
  basis: 'usd' | 'tons'
  window: { start: string; end: string; months: number }
  baseline: { start: string; end: string; months: number }
  minerals: string[]
  rows: WatchRow[]
  statusCounts: Record<WatchStatus, number>
  totals: {
    penTons: number; penUsd: number; compTons: number; compUsd: number
    penTonsPrev: number; penUsdPrev: number // equal-length window before current
    activeSuppliers: number                  // distinct suppliers with any shipment in window
  }
  topCompetitors: { buyer: string; suppliers: number; tons: number; usd: number; newRelationships: number }[]
  byMineral: {
    mineral: string; suppliers: number; penTons: number; compTons: number; penUsd: number; compUsd: number
    shareNow: number | null; shareBase: number | null
    marketTotal: number; marketShare: number | null // Penfold share of the whole Bolivian market for that mineral (window)
  }[]
  marketShareTrend: Record<string, number | string>[] // {month, [mineral]: Penfold % of market tons}
}

interface Agg { tons: number; usd: number; kg: number }
const zero = (): Agg => ({ tons: 0, usd: 0, kg: 0 })
const add = (a: Agg, r: DataRow) => { a.tons += r.tons; a.usd += r.usd; a.kg += r.kg }
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100
const price = (a: Agg) => (a.kg > 0 ? a.usd / a.kg : 0)
const share = (pen: number, comp: number) => (pen + comp > 0 ? (pen / (pen + comp)) * 100 : null)

export function computeWatch(
  all: DataRow[],
  opts: { refMonth: string; windowMonths: number; baselineMonths: number; basis?: 'usd' | 'tons'; minerals?: string[]; supplierSearch?: string },
): WatchResult {
  const { refMonth, windowMonths, baselineMonths } = opts
  const basis = opts.basis ?? 'usd'
  // Value used for shares: USD is robust to tiny/garbled kg on precious-metal rows; tons = physical volume
  const v = (a: Agg) => (basis === 'usd' ? a.usd : a.tons)
  const rv = (r: DataRow) => (basis === 'usd' ? r.usd : r.tons)
  const curStart = addMonths(refMonth, -(windowMonths - 1))
  const baseEnd = addMonths(curStart, -1)
  const baseStart = addMonths(baseEnd, -(baselineMonths - 1))
  const prevStart = addMonths(baseEnd, -(windowMonths - 1))
  const trendStart = addMonths(refMonth, -23)
  const sparkStart = addMonths(refMonth, -11)

  // Minerals Penfold has ever bought (computed before filtering, for the UI's mineral picker)
  const allPenMinerals = new Set<string>()
  for (const r of all) if (isPenfold(r.buyer)) allPenMinerals.add(r.mineral)

  let rows = all
  if (opts.minerals?.length) rows = rows.filter((r) => opts.minerals!.includes(r.mineral))

  // ── Which supplier×mineral pairs have ever sold to Penfold ───────────────
  const penfoldPairs = new Set<string>()
  for (const r of rows) if (isPenfold(r.buyer)) penfoldPairs.add(`${r.supplier}|${r.mineral}`)

  const q = opts.supplierSearch?.toLowerCase()

  // ── Group rows per pair ──────────────────────────────────────────────────
  const groups = new Map<string, DataRow[]>()
  for (const r of rows) {
    const k = `${r.supplier}|${r.mineral}`
    if (!penfoldPairs.has(k)) continue
    if (q && !r.supplier.toLowerCase().includes(q)) continue
    let g = groups.get(k)
    if (!g) { g = []; groups.set(k, g) }
    g.push(r)
  }

  const out: WatchRow[] = []
  const statusCounts: Record<WatchStatus, number> = { Lost: 0, Former: 0, Dormant: 0, Leaking: 0, Split: 0, Exclusive: 0 }
  const totals = { penTons: 0, penUsd: 0, compTons: 0, compUsd: 0, penTonsPrev: 0, penUsdPrev: 0, activeSuppliers: 0 }
  const activeSupplierSet = new Set<string>()
  const compAgg = new Map<string, { suppliers: Set<string>; tons: number; usd: number; newRel: number }>()
  const mineralAgg = new Map<string, { suppliers: Set<string>; penTons: number; compTons: number; penUsd: number; compUsd: number; penBase: number; compBase: number }>()

  for (const [key, g] of groups) {
    const [supplier, mineral] = key.split('|')
    const pen = zero(), comp = zero(), penBase = zero(), compBase = zero(), penPrev = zero()
    const compByBuyer = new Map<string, Agg>()
    const firstByBuyer = new Map<string, string>()
    const spark = new Map<string, { penfold: number; competitors: number }>()
    let firstPen = '', lastPen = '', lastAny = ''

    for (const r of g) {
      const m = monthKey(r.Date)
      const p = isPenfold(r.buyer)
      if (!firstByBuyer.has(r.buyer) || m < firstByBuyer.get(r.buyer)!) firstByBuyer.set(r.buyer, m)
      if (m > lastAny) lastAny = m
      if (p) {
        if (!firstPen || m < firstPen) firstPen = m
        if (m > lastPen) lastPen = m
      }
      if (m >= curStart && m <= refMonth) {
        if (p) add(pen, r)
        else {
          add(comp, r)
          let b = compByBuyer.get(r.buyer)
          if (!b) { b = zero(); compByBuyer.set(r.buyer, b) }
          add(b, r)
        }
      } else if (m >= baseStart && m <= baseEnd) {
        if (p) add(penBase, r)
        else add(compBase, r)
      }
      if (p && m >= prevStart && m <= baseEnd) add(penPrev, r)
      if (m >= sparkStart && m <= refMonth) {
        let s = spark.get(m)
        if (!s) { s = { penfold: 0, competitors: 0 }; spark.set(m, s) }
        if (p) s.penfold += rv(r)
        else s.competitors += rv(r)
      }
    }

    const shareNow = share(v(pen), v(comp))
    const shareBase = share(v(penBase), v(compBase))
    const shareDelta = shareNow !== null && shareBase !== null ? shareNow - shareBase : null

    let status: WatchStatus
    const penAny = pen.usd > 0 || pen.kg > 0, compAny = comp.usd > 0 || comp.kg > 0
    const penBaseAny = penBase.usd > 0 || penBase.kg > 0
    if (!penAny && compAny) status = penBaseAny ? 'Lost' : 'Former'
    else if (!penAny && !compAny) status = 'Dormant'
    else if (compAny && shareDelta !== null && shareDelta <= -15) status = 'Leaking'
    else if (compAny) status = 'Split'
    else status = 'Exclusive'

    const competitors: WatchCompetitor[] = [...compByBuyer.entries()]
      .map(([buyer, a]) => {
        const firstMonth = firstByBuyer.get(buyer) ?? ''
        return { buyer, tons: r2(a.tons), usd: Math.round(a.usd), avgPriceKg: Math.round(price(a) * 1000) / 1000, firstMonth, isNew: firstMonth >= curStart }
      })
      .sort((a, b) => b.tons - a.tons)

    const penPrice = price(pen) || price(penBase)
    const compPrice = price(comp)
    const priceGapPct = penPrice > 0 && compPrice > 0 ? ((compPrice - penPrice) / penPrice) * 100 : null

    const statusWeight: Record<WatchStatus, number> = { Lost: 3, Leaking: 2.5, Split: 1.5, Former: 1, Dormant: 0, Exclusive: 0 }
    const newCompetitors = competitors.filter((c) => c.isNew).length
    const severity = comp.usd * statusWeight[status] * (1 + 0.25 * newCompetitors)

    const monthly = monthRange(sparkStart, refMonth).map((month) => {
      const s = spark.get(month)
      return { month, penfold: r2(s?.penfold ?? 0), competitors: r2(s?.competitors ?? 0) }
    })

    const [ly, lm] = lastPen ? lastPen.split('-').map(Number) : [0, 0]
    const [ry, rm] = refMonth.split('-').map(Number)

    out.push({
      supplier, mineral, status,
      penTons: r2(pen.tons), penUsd: Math.round(pen.usd),
      compTons: r2(comp.tons), compUsd: Math.round(comp.usd),
      penTonsBase: r2(penBase.tons), compTonsBase: r2(compBase.tons),
      shareNow: shareNow === null ? null : r1(shareNow),
      shareBase: shareBase === null ? null : r1(shareBase),
      shareDelta: shareDelta === null ? null : r1(shareDelta),
      penPriceKg: Math.round(penPrice * 1000) / 1000,
      compPriceKg: Math.round(compPrice * 1000) / 1000,
      priceGapPct: priceGapPct === null ? null : r1(priceGapPct),
      firstPenfoldMonth: firstPen, lastPenfoldMonth: lastPen, lastAnyMonth: lastAny,
      monthsSincePenfold: lastPen ? (ry * 12 + rm) - (ly * 12 + lm) : -1,
      competitors, newCompetitors, monthly, severity,
    })

    statusCounts[status]++
    totals.penTons += pen.tons; totals.penUsd += pen.usd
    totals.compTons += comp.tons; totals.compUsd += comp.usd
    totals.penTonsPrev += penPrev.tons; totals.penUsdPrev += penPrev.usd
    if (penAny || compAny) activeSupplierSet.add(supplier)

    for (const c of competitors) {
      let a = compAgg.get(c.buyer)
      if (!a) { a = { suppliers: new Set(), tons: 0, usd: 0, newRel: 0 }; compAgg.set(c.buyer, a) }
      a.suppliers.add(supplier); a.tons += c.tons; a.usd += c.usd
      if (c.isNew) a.newRel++
    }

    let ma = mineralAgg.get(mineral)
    if (!ma) { ma = { suppliers: new Set(), penTons: 0, compTons: 0, penUsd: 0, compUsd: 0, penBase: 0, compBase: 0 }; mineralAgg.set(mineral, ma) }
    if (penAny || compAny) ma.suppliers.add(supplier)
    ma.penTons += pen.tons; ma.compTons += comp.tons
    ma.penUsd += pen.usd; ma.compUsd += comp.usd
    ma.penBase += v(penBase); ma.compBase += v(compBase)
  }

  totals.activeSuppliers = activeSupplierSet.size

  // ── Whole-market context per mineral ─────────────────────────────────────
  const marketWin = new Map<string, { total: number; pen: number }>()
  const trend = new Map<string, Map<string, { total: number; pen: number }>>()
  for (const r of rows) {
    const m = monthKey(r.Date)
    if (m >= curStart && m <= refMonth) {
      let a = marketWin.get(r.mineral)
      if (!a) { a = { total: 0, pen: 0 }; marketWin.set(r.mineral, a) }
      a.total += rv(r)
      if (isPenfold(r.buyer)) a.pen += rv(r)
    }
    if (m >= trendStart && m <= refMonth) {
      let mm = trend.get(m)
      if (!mm) { mm = new Map(); trend.set(m, mm) }
      for (const k of [r.mineral, 'All minerals']) {
        let a = mm.get(k)
        if (!a) { a = { total: 0, pen: 0 }; mm.set(k, a) }
        a.total += rv(r)
        if (isPenfold(r.buyer)) a.pen += rv(r)
      }
    }
  }

  const byMineral = [...mineralAgg.entries()]
    .map(([mineral, a]) => {
      const mw = marketWin.get(mineral)
      const sn = basis === 'usd' ? share(a.penUsd, a.compUsd) : share(a.penTons, a.compTons)
      const sb = share(a.penBase, a.compBase)
      return {
        mineral,
        suppliers: a.suppliers.size,
        penTons: r1(a.penTons),
        compTons: r1(a.compTons),
        penUsd: Math.round(a.penUsd),
        compUsd: Math.round(a.compUsd),
        shareNow: sn === null ? null : r1(sn),
        shareBase: sb === null ? null : r1(sb),
        marketTotal: basis === 'usd' ? Math.round(mw?.total ?? 0) : r1(mw?.total ?? 0),
        marketShare: mw && mw.total > 0 ? r1((mw.pen / mw.total) * 100) : null,
      }
    })
    .sort((a, b) => (b.penUsd + b.compUsd) - (a.penUsd + a.compUsd))

  // Only chart minerals Penfold has actually bought
  const penMinerals = new Set(byMineral.map((m) => m.mineral))
  const marketShareTrend = monthRange(trendStart, refMonth).map((month) => {
    const row: Record<string, number | string> = { month }
    const mm = trend.get(month)
    for (const k of ['All minerals', ...penMinerals]) {
      const a = mm?.get(k)
      row[k] = a && a.total > 0 ? r1((a.pen / a.total) * 100) : 0
    }
    return row
  })

  const topCompetitors = [...compAgg.entries()]
    .map(([buyer, a]) => ({ buyer, suppliers: a.suppliers.size, tons: r1(a.tons), usd: Math.round(a.usd), newRelationships: a.newRel }))
    .sort((a, b) => b.usd - a.usd)

  out.sort((a, b) => b.severity - a.severity || b.compTons - a.compTons || b.penTons - a.penTons)

  return {
    refMonth,
    basis,
    window: { start: curStart, end: refMonth, months: windowMonths },
    baseline: { start: baseStart, end: baseEnd, months: baselineMonths },
    minerals: [...allPenMinerals].sort(),
    rows: out,
    statusCounts,
    totals: {
      penTons: r1(totals.penTons), penUsd: Math.round(totals.penUsd),
      compTons: r1(totals.compTons), compUsd: Math.round(totals.compUsd),
      penTonsPrev: r1(totals.penTonsPrev), penUsdPrev: Math.round(totals.penUsdPrev),
      activeSuppliers: totals.activeSuppliers,
    },
    topCompetitors,
    byMineral,
    marketShareTrend,
  }
}
