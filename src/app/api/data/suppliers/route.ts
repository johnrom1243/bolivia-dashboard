/**
 * /api/data/suppliers?supplier=NAME&...filters
 * Returns a full SupplierProfile for one supplier, or a summary list.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters } from '@/lib/db'
import type { SupplierProfile } from '@/types/data'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const supplierName = params.get('supplier')

    const all = await getData()
    const filters = parseFilters(params)
    const filtered = applyFilters(all, filters)

    // No supplier selected → return list
    if (!supplierName) {
      const map: Record<string, { tons: number; usd: number; shipments: number; lastDate: string }> = {}
      for (const r of filtered) {
        if (!map[r.supplier]) map[r.supplier] = { tons: 0, usd: 0, shipments: 0, lastDate: '' }
        map[r.supplier].tons += r.tons
        map[r.supplier].usd += r.usd
        map[r.supplier].shipments++
        if (!map[r.supplier].lastDate || r.Date > map[r.supplier].lastDate) {
          map[r.supplier].lastDate = r.Date
        }
      }
      return NextResponse.json(
        Object.entries(map)
          .sort((a, b) => b[1].usd - a[1].usd)
          .map(([name, v]) => ({ name, ...v })),
      )
    }

    // Full profile
    const sub = filtered.filter((r) => r.supplier === supplierName)
    if (!sub.length) return NextResponse.json(null)

    const todayMs = Date.now()

    // Buyer shares
    const buyerMap: Record<string, { tons: number; usd: number; firstDate: string }> = {}
    for (const r of sub) {
      if (!buyerMap[r.buyer]) buyerMap[r.buyer] = { tons: 0, usd: 0, firstDate: r.Date }
      buyerMap[r.buyer].tons += r.tons
      buyerMap[r.buyer].usd += r.usd
      if (r.Date < buyerMap[r.buyer].firstDate) buyerMap[r.buyer].firstDate = r.Date
    }
    const totalTons = Object.values(buyerMap).reduce((a, v) => a + v.tons, 0)
    const totalUsd = Object.values(buyerMap).reduce((a, v) => a + v.usd, 0)
    const buyerShares = Object.entries(buyerMap)
      .sort((a, b) => b[1].usd - a[1].usd)
      .map(([buyer, v]) => ({
        buyer,
        tons: v.tons,
        usd: v.usd,
        share: totalUsd > 0 ? (v.usd / totalUsd) * 100 : 0,
        firstDate: v.firstDate,
      }))

    // Quarterly timeline (buyer × quarter)
    const timelineMap: Record<string, Record<string, number>> = {}
    for (const r of sub) {
      if (!timelineMap[r.Quarter]) timelineMap[r.Quarter] = {}
      timelineMap[r.Quarter][r.buyer] = (timelineMap[r.Quarter][r.buyer] || 0) + r.usd
    }
    const quarterlyTimeline = Object.entries(timelineMap).flatMap(([quarter, buyers]) =>
      Object.entries(buyers).map(([buyer, value]) => ({ quarter, buyer, value })),
    )

    // Mineral mix
    const mineralMap: Record<string, { tons: number; usd: number }> = {}
    for (const r of sub) {
      if (!mineralMap[r.mineral]) mineralMap[r.mineral] = { tons: 0, usd: 0 }
      mineralMap[r.mineral].tons += r.tons
      mineralMap[r.mineral].usd += r.usd
    }
    const mineralMix = Object.entries(mineralMap)
      .sort((a, b) => b[1].tons - a[1].tons)
      .map(([mineral, v]) => ({
        mineral,
        tons: v.tons,
        usd: v.usd,
        share: totalTons > 0 ? (v.tons / totalTons) * 100 : 0,
      }))

    // Price vs market (monthly avg usd_per_kg)
    const allSameMineralRows = all.filter((r) => mineralMix[0] && r.mineral === mineralMix[0].mineral)
    const monthlyPriceSupplier: Record<string, { sum: number; count: number }> = {}
    const monthlyPriceMarket: Record<string, { sum: number; count: number }> = {}
    for (const r of sub) {
      const m = r.Date.slice(0, 7)
      if (!monthlyPriceSupplier[m]) monthlyPriceSupplier[m] = { sum: 0, count: 0 }
      if (r.usd_per_kg > 0) {
        monthlyPriceSupplier[m].sum += r.usd_per_kg
        monthlyPriceSupplier[m].count++
      }
    }
    for (const r of allSameMineralRows) {
      const m = r.Date.slice(0, 7)
      if (!monthlyPriceMarket[m]) monthlyPriceMarket[m] = { sum: 0, count: 0 }
      if (r.usd_per_kg > 0) {
        monthlyPriceMarket[m].sum += r.usd_per_kg
        monthlyPriceMarket[m].count++
      }
    }
    const priceVsMarket = Object.keys(monthlyPriceSupplier)
      .sort()
      .map((date) => ({
        date,
        supplierPrice: monthlyPriceSupplier[date].count > 0
          ? monthlyPriceSupplier[date].sum / monthlyPriceSupplier[date].count
          : 0,
        marketPrice: monthlyPriceMarket[date]?.count > 0
          ? monthlyPriceMarket[date].sum / monthlyPriceMarket[date].count
          : 0,
      }))

    // Shipment size distribution (histogram buckets)
    const tonValues = sub.map((r) => r.tons).sort((a, b) => a - b)
    const shipmentDistribution = buildHistogramBuckets(tonValues, 10)

    // Aduana usage
    const aduanaMap: Record<string, number> = {}
    for (const r of sub) {
      if (r.aduana) aduanaMap[r.aduana] = (aduanaMap[r.aduana] || 0) + 1
    }
    const aduanaUsage = Object.entries(aduanaMap)
      .sort((a, b) => b[1] - a[1])
      .map(([aduana, count]) => ({ aduana, count, share: (count / sub.length) * 100 }))

    // Seasonal pattern (avg tons by month)
    const monthlyTons: Record<number, { sum: number; count: number }> = {}
    for (const r of sub) {
      if (!monthlyTons[r.month_num]) monthlyTons[r.month_num] = { sum: 0, count: 0 }
      monthlyTons[r.month_num].sum += r.tons
      monthlyTons[r.month_num].count++
    }
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const seasonalPattern = MONTHS.map((month, idx) => ({
      month,
      avgTons: monthlyTons[idx + 1]?.count > 0
        ? monthlyTons[idx + 1].sum / monthlyTons[idx + 1].count
        : 0,
    }))

    // Competitor presence: for each buyer, who else do they buy from?
    const competitorPresence = buyerShares.slice(0, 5).map((bs) => {
      const buyerRows = all.filter((r) => r.buyer === bs.buyer)
      const otherSuppliers = [...new Set(buyerRows.filter((r) => r.supplier !== supplierName).map((r) => r.supplier))]
        .slice(0, 5)
      return { buyer: bs.buyer, otherSuppliers }
    })

    // Health score (composite)
    const dates = sub.map((r) => new Date(r.Date).getTime()).sort((a, b) => a - b)
    const lastDate = dates[dates.length - 1]
    const daysSinceLastShipment = (todayMs - lastDate) / 86400000
    const recentTons = sub.filter((r) => new Date(r.Date).getTime() >= todayMs - 90 * 86400000).reduce((a, r) => a + r.tons, 0)
    const prevTons = sub.filter((r) => {
      const t = new Date(r.Date).getTime()
      return t >= todayMs - 180 * 86400000 && t < todayMs - 90 * 86400000
    }).reduce((a, r) => a + r.tons, 0)
    const momentum = prevTons > 0 ? ((recentTons - prevTons) / prevTons) * 100 : 0
    const recencyScore = Math.max(0, 100 - daysSinceLastShipment / 3)
    const diversityScore = Math.min(100, buyerShares.length * 20)
    const volumeScore = Math.min(100, Math.log1p(totalTons) * 10)
    const healthScore = Math.round((recencyScore * 0.4 + diversityScore * 0.3 + volumeScore * 0.3))

    // Peak quarter
    const quarterTotals: Record<string, number> = {}
    for (const r of sub) quarterTotals[r.Quarter] = (quarterTotals[r.Quarter] || 0) + r.usd
    const peakQuarter = Object.entries(quarterTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

    const firstShipment = sub.map((r) => r.Date).sort()[0]
    const lastShipment = sub.map((r) => r.Date).sort().at(-1)!

    const profile: SupplierProfile = {
      name: supplierName,
      totalShipments: sub.length,
      totalTons: Math.round(totalTons * 100) / 100,
      totalUsd: Math.round(totalUsd),
      uniqueBuyers: buyerShares.length,
      firstShipment,
      lastShipment,
      healthScore: Math.min(100, Math.max(0, healthScore)),
      momentumUsd: Math.round(momentum * 10) / 10,
      peakQuarter,
      buyerShares,
      quarterlyTimeline,
      mineralMix,
      priceVsMarket,
      shipmentDistribution,
      aduanaUsage,
      seasonalPattern,
      competitorPresence,
    }

    return NextResponse.json(profile)
  } catch (err) {
    console.error('[/api/data/suppliers]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

function buildHistogramBuckets(
  sorted: number[],
  numBuckets: number,
): { bucket: string; count: number }[] {
  if (!sorted.length) return []
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const range = max - min || 1
  const bucketSize = range / numBuckets
  const counts = new Array(numBuckets).fill(0)
  for (const v of sorted) {
    const idx = Math.min(Math.floor((v - min) / bucketSize), numBuckets - 1)
    counts[idx]++
  }
  return counts.map((count, i) => ({
    bucket: `${(min + i * bucketSize).toFixed(1)}–${(min + (i + 1) * bucketSize).toFixed(1)}`,
    count,
  }))
}
