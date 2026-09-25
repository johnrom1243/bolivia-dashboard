/**
 * Competitor Wins — new buyer ← supplier × mineral relationships.
 *
 * A "win" is the first month a buyer ever received a given mineral from a
 * given supplier. For each win inside the window we work out where that
 * volume came from by looking at the supplier's shipments of the same
 * mineral in the `lookback` months before the win:
 *
 *   New exporter  — the supplier had never exported anything before
 *   New mineral   — the supplier existed but never shipped this mineral before
 *   Returning     — the supplier shipped this mineral before, but not in the lookback
 *   From Penfold  — Penfold was one of the supplier's buyers for this mineral in the lookback
 *   Switched      — another buyer had the volume in the lookback
 *
 * and whether the previous main buyer kept receiving volume afterwards
 * (Added = supplier now splits, Replaced = previous buyer lost it).
 */
import type { DataRow } from '@/types/data'
import { isPenfold, monthKey, addMonths, monthRange } from '@/lib/period'

export type WinOrigin = 'New exporter' | 'New mineral' | 'Returning' | 'From Penfold' | 'Switched'

export interface WinRow {
  buyer: string
  buyerIsPenfold: boolean
  supplier: string
  mineral: string
  firstMonth: string
  origin: WinOrigin
  prevBuyer: string | null        // main buyer of this supplier×mineral in the lookback
  prevBuyerShare: number | null   // % of lookback tons that went to prevBuyer
  penfoldShareBefore: number | null // % of lookback tons that went to Penfold
  prevBuyerStillActive: boolean | null // prevBuyer received volume at/after the win
  outcome: 'Added' | 'Replaced' | 'New volume'
  tonsSince: number
  usdSince: number
  monthsActive: number            // distinct months with shipments to this buyer since the win
  lastMonth: string
  priceKg: number                 // this buyer's avg $/kg since the win
  prevPriceKg: number | null      // previous buyers' avg $/kg in the lookback
  priceGapPct: number | null      // + = the new buyer pays more
  supplierTotalTonsSince: number  // supplier's total tons of this mineral since the win (all buyers)
  shareOfSupplier: number         // % of that captured by the new buyer
}

export interface WinsResult {
  refMonth: string
  window: { start: string; end: string; months: number }
  lookback: number
  minerals: string[]
  buyers: string[]
  wins: WinRow[]
  byBuyer: { buyer: string; isPenfold: boolean; wins: number; fromPenfold: number; newExporters: number; tons: number; usd: number }[]
  byMineral: { mineral: string; wins: number; penfoldWins: number; fromPenfold: number; tons: number }[]
  byMonth: { month: string; penfold: number; competitors: number; fromPenfold: number }[]
  penfold: { wins: number; tonsWon: number; losses: number; tonsLost: number }
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function computeWins(
  all: DataRow[],
  opts: { refMonth: string; windowMonths: number; lookbackMonths: number; minerals?: string[]; supplierSearch?: string },
): WinsResult {
  const { refMonth, windowMonths, lookbackMonths } = opts
  const curStart = addMonths(refMonth, -(windowMonths - 1))

  const mineralSet = new Set<string>()
  for (const r of all) mineralSet.add(r.mineral)

  // Supplier-level first-ever month (any mineral, any buyer) — from the FULL dataset
  const supplierFirst = new Map<string, string>()
  for (const r of all) {
    const m = monthKey(r.Date)
    const f = supplierFirst.get(r.supplier)
    if (!f || m < f) supplierFirst.set(r.supplier, m)
  }

  let rows = all
  if (opts.minerals?.length) rows = rows.filter((r) => opts.minerals!.includes(r.mineral))
  const q = opts.supplierSearch?.toLowerCase()
  if (q) rows = rows.filter((r) => r.supplier.toLowerCase().includes(q))

  // Group by supplier×mineral
  const pairs = new Map<string, DataRow[]>()
  for (const r of rows) {
    const k = `${r.supplier}|${r.mineral}`
    let g = pairs.get(k)
    if (!g) { g = []; pairs.set(k, g) }
    g.push(r)
  }

  const wins: WinRow[] = []
  const buyerSet = new Set<string>()

  for (const [key, g] of pairs) {
    const [supplier, mineral] = key.split('|')
    const pairFirst = g.reduce((min, r) => (monthKey(r.Date) < min ? monthKey(r.Date) : min), '9999-99')

    // First month per buyer for this pair
    const firstByBuyer = new Map<string, string>()
    for (const r of g) {
      const m = monthKey(r.Date)
      const f = firstByBuyer.get(r.buyer)
      if (!f || m < f) firstByBuyer.set(r.buyer, m)
    }

    for (const [buyer, firstMonth] of firstByBuyer) {
      if (firstMonth < curStart || firstMonth > refMonth) continue
      buyerSet.add(buyer)

      const lbStart = addMonths(firstMonth, -lookbackMonths)
      const lbEnd = addMonths(firstMonth, -1)

      // Lookback: who had this supplier×mineral before the win
      const prevTons = new Map<string, number>()
      let prevTotal = 0, prevUsd = 0, prevKg = 0
      let buyerTons = 0, buyerUsd = 0, buyerKg = 0, supplierTotal = 0, last = firstMonth
      const buyerMonths = new Set<string>()
      for (const r of g) {
        const m = monthKey(r.Date)
        if (m >= lbStart && m <= lbEnd) {
          prevTons.set(r.buyer, (prevTons.get(r.buyer) ?? 0) + r.tons)
          prevTotal += r.tons; prevUsd += r.usd; prevKg += r.kg
        }
        if (m >= firstMonth) {
          supplierTotal += r.tons
          if (r.buyer === buyer) {
            buyerTons += r.tons; buyerUsd += r.usd; buyerKg += r.kg
            buyerMonths.add(m)
            if (m > last) last = m
          }
        }
      }

      const prevSorted = [...prevTons.entries()].sort((a, b) => b[1] - a[1])
      const prevBuyer = prevSorted[0]?.[0] ?? null
      const penfoldBefore = [...prevTons.entries()].filter(([b]) => isPenfold(b)).reduce((a, [, t]) => a + t, 0)
      const buyerIsPenfold = isPenfold(buyer)

      let origin: WinOrigin
      if (prevTotal === 0) {
        if ((supplierFirst.get(supplier) ?? firstMonth) >= firstMonth) origin = 'New exporter'
        else if (pairFirst >= firstMonth) origin = 'New mineral'
        else origin = 'Returning'
      } else if (penfoldBefore > 0 && !buyerIsPenfold) origin = 'From Penfold'
      else origin = 'Switched'

      let prevBuyerStillActive: boolean | null = null
      if (prevBuyer) {
        prevBuyerStillActive = g.some((r) => r.buyer === prevBuyer && monthKey(r.Date) >= firstMonth)
      }

      const priceKg = buyerKg > 0 ? buyerUsd / buyerKg : 0
      const prevPriceKg = prevKg > 0 ? prevUsd / prevKg : null

      wins.push({
        buyer, buyerIsPenfold, supplier, mineral, firstMonth, origin,
        prevBuyer,
        prevBuyerShare: prevBuyer && prevTotal > 0 ? r1((prevSorted[0][1] / prevTotal) * 100) : null,
        penfoldShareBefore: prevTotal > 0 ? r1((penfoldBefore / prevTotal) * 100) : null,
        prevBuyerStillActive,
        outcome: prevTotal === 0 ? 'New volume' : prevBuyerStillActive ? 'Added' : 'Replaced',
        tonsSince: r1(buyerTons),
        usdSince: Math.round(buyerUsd),
        monthsActive: buyerMonths.size,
        lastMonth: last,
        priceKg: Math.round(priceKg * 1000) / 1000,
        prevPriceKg: prevPriceKg === null ? null : Math.round(prevPriceKg * 1000) / 1000,
        priceGapPct: prevPriceKg && priceKg ? r1(((priceKg - prevPriceKg) / prevPriceKg) * 100) : null,
        supplierTotalTonsSince: r1(supplierTotal),
        shareOfSupplier: supplierTotal > 0 ? r1((buyerTons / supplierTotal) * 100) : 0,
      })
    }
  }

  wins.sort((a, b) => b.firstMonth.localeCompare(a.firstMonth) || b.usdSince - a.usdSince)

  // ── Aggregates ────────────────────────────────────────────────────────────
  const bb = new Map<string, WinsResult['byBuyer'][number]>()
  const bm = new Map<string, WinsResult['byMineral'][number]>()
  const bmo = new Map<string, WinsResult['byMonth'][number]>()
  for (const m of monthRange(curStart, refMonth)) bmo.set(m, { month: m, penfold: 0, competitors: 0, fromPenfold: 0 })
  const penfold = { wins: 0, tonsWon: 0, losses: 0, tonsLost: 0 }

  for (const w of wins) {
    let b = bb.get(w.buyer)
    if (!b) { b = { buyer: w.buyer, isPenfold: w.buyerIsPenfold, wins: 0, fromPenfold: 0, newExporters: 0, tons: 0, usd: 0 }; bb.set(w.buyer, b) }
    b.wins++; b.tons += w.tonsSince; b.usd += w.usdSince
    if (w.origin === 'From Penfold') b.fromPenfold++
    if (w.origin === 'New exporter') b.newExporters++

    let mi = bm.get(w.mineral)
    if (!mi) { mi = { mineral: w.mineral, wins: 0, penfoldWins: 0, fromPenfold: 0, tons: 0 }; bm.set(w.mineral, mi) }
    mi.wins++; mi.tons += w.tonsSince
    if (w.buyerIsPenfold) mi.penfoldWins++
    if (w.origin === 'From Penfold') mi.fromPenfold++

    const mo = bmo.get(w.firstMonth)
    if (mo) {
      if (w.buyerIsPenfold) mo.penfold++
      else mo.competitors++
      if (w.origin === 'From Penfold') mo.fromPenfold++
    }

    if (w.buyerIsPenfold) { penfold.wins++; penfold.tonsWon += w.tonsSince }
    if (w.origin === 'From Penfold') { penfold.losses++; penfold.tonsLost += w.tonsSince }
  }

  return {
    refMonth,
    window: { start: curStart, end: refMonth, months: windowMonths },
    lookback: lookbackMonths,
    minerals: [...mineralSet].sort(),
    buyers: [...buyerSet].sort(),
    wins,
    byBuyer: [...bb.values()].map((b) => ({ ...b, tons: r1(b.tons) })).sort((a, b) => b.wins - a.wins || b.usd - a.usd),
    byMineral: [...bm.values()].map((m) => ({ ...m, tons: r1(m.tons) })).sort((a, b) => b.wins - a.wins),
    byMonth: [...bmo.values()],
    penfold: { ...penfold, tonsWon: r1(penfold.tonsWon), tonsLost: r1(penfold.tonsLost) },
  }
}
