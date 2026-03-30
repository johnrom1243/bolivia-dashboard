import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters, percentile } from '@/lib/db'
import type { LogisticsData } from '@/types/data'

export async function GET(req: NextRequest) {
  try {
    const all = await getData()
    const filters = parseFilters(req.nextUrl.searchParams)
    const filtered = applyFilters(all, filters)

    if (!filtered.length) return NextResponse.json(null)

    // ── Lot size by mineral (box plot stats) ─────────────────────────────
    const mineralTons: Record<string, number[]> = {}
    for (const r of filtered) {
      if (!mineralTons[r.mineral]) mineralTons[r.mineral] = []
      mineralTons[r.mineral].push(r.tons)
    }
    const lotSizeByMineral = Object.entries(mineralTons)
      .map(([mineral, vals]) => {
        const sorted = vals.sort((a, b) => a - b)
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length
        return {
          mineral,
          p25: percentile(sorted, 25),
          median: percentile(sorted, 50),
          p75: percentile(sorted, 75),
          mean: Math.round(mean * 100) / 100,
          max: sorted[sorted.length - 1],
        }
      })
      .sort((a, b) => b.median - a.median)

    // ── Shipment value distribution ───────────────────────────────────────
    const usdVals = filtered.map((r) => r.usd).sort((a, b) => a - b)
    const usdMin = usdVals[0]
    const usdMax = usdVals[usdVals.length - 1]
    const NUM_BUCKETS = 10
    const bucketSize = (usdMax - usdMin) / NUM_BUCKETS || 1
    const usdBuckets: { count: number; totalUsd: number }[] = Array.from({ length: NUM_BUCKETS }, () => ({ count: 0, totalUsd: 0 }))
    for (const r of filtered) {
      const idx = Math.min(Math.floor((r.usd - usdMin) / bucketSize), NUM_BUCKETS - 1)
      usdBuckets[idx].count++
      usdBuckets[idx].totalUsd += r.usd
    }
    const shipmentValueDist = usdBuckets.map((b, i) => ({
      bucket: `$${((usdMin + i * bucketSize) / 1000).toFixed(0)}k–$${((usdMin + (i + 1) * bucketSize) / 1000).toFixed(0)}k`,
      count: b.count,
      totalUsd: Math.round(b.totalUsd),
    }))

    // ── Average lot size matrix (top suppliers × buyers) ──────────────────
    const pairMap: Record<string, Record<string, { sum: number; n: number }>> = {}
    for (const r of filtered) {
      if (!pairMap[r.supplier]) pairMap[r.supplier] = {}
      if (!pairMap[r.supplier][r.buyer]) pairMap[r.supplier][r.buyer] = { sum: 0, n: 0 }
      pairMap[r.supplier][r.buyer].sum += r.tons
      pairMap[r.supplier][r.buyer].n++
    }
    // Top 10 suppliers by volume
    const supplierTotals: Record<string, number> = {}
    for (const r of filtered) supplierTotals[r.supplier] = (supplierTotals[r.supplier] || 0) + r.tons
    const topSuppliers = Object.entries(supplierTotals).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s]) => s)

    const avgLotMatrix = topSuppliers.flatMap((s) =>
      Object.entries(pairMap[s] ?? {}).map(([b, { sum, n }]) => ({
        supplier: s,
        buyer: b,
        avgTons: Math.round((sum / n) * 100) / 100,
      })),
    ).sort((a, b) => b.avgTons - a.avgTons).slice(0, 60)

    // ── Customs post comparison ───────────────────────────────────────────
    const aduanaMap: Record<string, { count: number; tons: number; minerals: Set<string> }> = {}
    for (const r of filtered) {
      const a = r.aduana || 'Unknown'
      if (!aduanaMap[a]) aduanaMap[a] = { count: 0, tons: 0, minerals: new Set() }
      aduanaMap[a].count++
      aduanaMap[a].tons += r.tons
      aduanaMap[a].minerals.add(r.mineral)
    }
    const customsPostComparison = Object.entries(aduanaMap)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([aduana, v]) => ({
        aduana,
        shipments: v.count,
        avgTons: Math.round((v.tons / v.count) * 100) / 100,
        minerals: [...v.minerals].sort(),
      }))

    // ── Monthly frequency heatmap (top 10 suppliers × month) ─────────────
    const monthlyFreqMap: Record<string, Record<string, number>> = {}
    for (const r of filtered) {
      const m = r.Date.slice(0, 7)
      if (!monthlyFreqMap[r.supplier]) monthlyFreqMap[r.supplier] = {}
      monthlyFreqMap[r.supplier][m] = (monthlyFreqMap[r.supplier][m] || 0) + 1
    }
    const monthlyFrequencyHeatmap = topSuppliers.flatMap((s) =>
      Object.entries(monthlyFreqMap[s] ?? {}).map(([month, count]) => ({ supplier: s, month, count })),
    ).sort((a, b) => a.month.localeCompare(b.month))

    // ── Route efficiency (aduana × mineral) ──────────────────────────────
    const routeMap: Record<string, { sum: number; n: number }> = {}
    for (const r of filtered) {
      const key = `${r.aduana || 'Unknown'}|||${r.mineral}`
      if (!routeMap[key]) routeMap[key] = { sum: 0, n: 0 }
      routeMap[key].sum += r.tons
      routeMap[key].n++
    }
    const routeEfficiency = Object.entries(routeMap)
      .map(([key, { sum, n }]) => {
        const [aduana, mineral] = key.split('|||')
        return { aduana, mineral, avgTons: Math.round((sum / n) * 100) / 100, shipmentCount: n }
      })
      .sort((a, b) => b.shipmentCount - a.shipmentCount)
      .slice(0, 50)

    const result: LogisticsData = {
      lotSizeByMineral,
      shipmentValueDist,
      avgLotMatrix,
      customsPostComparison,
      monthlyFrequencyHeatmap,
      routeEfficiency,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/data/logistics]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
