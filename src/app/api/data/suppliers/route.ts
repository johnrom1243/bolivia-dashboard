/**
 * /api/data/suppliers?supplier=NAME&...filters
 * Returns a full SupplierProfile for one supplier, or a summary list.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters } from '@/lib/db'
import type { SupplierProfile, BuyerRelationship, BuyerMineralDetail } from '@/types/data'

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

    // Use latest data date as reference "today" so recency/windows are meaningful
    const todayMs = Math.max(...all.map((r) => new Date(r.Date).getTime()))

    // ─── Basic totals ────────────────────────────────────────────────────────
    const totalTons = sub.reduce((a, r) => a + r.tons, 0)
    const totalUsd = sub.reduce((a, r) => a + r.usd, 0)
    const totalKg = sub.reduce((a, r) => a + r.kg, 0)

    // ─── Sorted dates for recency / cadence ─────────────────────────────────
    const sortedDates = sub.map((r) => r.Date).sort()
    const firstShipment = sortedDates[0]
    const lastShipment = sortedDates[sortedDates.length - 1]
    const daysSinceLast = Math.round((todayMs - new Date(lastShipment).getTime()) / 86400000)

    let avgDaysBetweenShipments = 0
    if (sortedDates.length > 1) {
      const gaps: number[] = []
      for (let i = 1; i < sortedDates.length; i++) {
        gaps.push((new Date(sortedDates[i]).getTime() - new Date(sortedDates[i - 1]).getTime()) / 86400000)
      }
      avgDaysBetweenShipments = Math.round(gaps.reduce((a, v) => a + v, 0) / gaps.length)
    }

    // ─── Buyer shares (legacy + rich) ───────────────────────────────────────
    const buyerMap: Record<string, {
      tons: number; usd: number; kg: number; firstDate: string; lastDate: string; count: number
    }> = {}
    for (const r of sub) {
      if (!buyerMap[r.buyer]) buyerMap[r.buyer] = { tons: 0, usd: 0, kg: 0, firstDate: r.Date, lastDate: r.Date, count: 0 }
      buyerMap[r.buyer].tons += r.tons
      buyerMap[r.buyer].usd += r.usd
      buyerMap[r.buyer].kg += r.kg
      buyerMap[r.buyer].count++
      if (r.Date < buyerMap[r.buyer].firstDate) buyerMap[r.buyer].firstDate = r.Date
      if (r.Date > buyerMap[r.buyer].lastDate) buyerMap[r.buyer].lastDate = r.Date
    }

    // Legacy buyerShares
    const buyerShares = Object.entries(buyerMap)
      .sort((a, b) => b[1].usd - a[1].usd)
      .map(([buyer, v]) => ({
        buyer,
        tons: v.tons,
        usd: v.usd,
        share: totalUsd > 0 ? (v.usd / totalUsd) * 100 : 0,
        firstDate: v.firstDate,
      }))

    // Total market purchases per buyer (across ALL suppliers)
    const buyerTotalMarket: Record<string, number> = {}
    for (const r of all) {
      buyerTotalMarket[r.buyer] = (buyerTotalMarket[r.buyer] || 0) + r.usd
    }

    // Buyer × Mineral breakdown
    const buyerMineralMap: Record<string, Record<string, {
      tons: number; usd: number; kg: number; count: number; firstDate: string; lastDate: string
    }>> = {}
    for (const r of sub) {
      if (!buyerMineralMap[r.buyer]) buyerMineralMap[r.buyer] = {}
      if (!buyerMineralMap[r.buyer][r.mineral]) {
        buyerMineralMap[r.buyer][r.mineral] = { tons: 0, usd: 0, kg: 0, count: 0, firstDate: r.Date, lastDate: r.Date }
      }
      const bm = buyerMineralMap[r.buyer][r.mineral]
      bm.tons += r.tons; bm.usd += r.usd; bm.kg += r.kg; bm.count++
      if (r.Date < bm.firstDate) bm.firstDate = r.Date
      if (r.Date > bm.lastDate) bm.lastDate = r.Date
    }

    // Trend: compare last 90d vs prev 90d
    const now = todayMs
    const t90 = now - 90 * 86400000
    const t180 = now - 180 * 86400000

    const buyerRelationships: BuyerRelationship[] = Object.entries(buyerMap)
      .sort((a, b) => b[1].usd - a[1].usd)
      .map(([buyer, v]) => {
        const daysSince = Math.round((now - new Date(v.lastDate).getTime()) / 86400000)
        const firstMs = new Date(v.firstDate).getTime()
        const monthsOld = (now - firstMs) / (86400000 * 30)

        // Status
        let status: BuyerRelationship['status']
        if (monthsOld < 6 && daysSince < 90) status = 'New'
        else if (daysSince < 90) status = 'Active'
        else if (daysSince < 180) status = 'Declining'
        else status = 'Dormant'

        // Trend: buyer-supplier pair last 90d vs prev 90d
        const buyerSub = sub.filter((r) => r.buyer === buyer)
        const recentUsd = buyerSub.filter((r) => new Date(r.Date).getTime() >= t90).reduce((a, r) => a + r.usd, 0)
        const prevUsd = buyerSub.filter((r) => {
          const t = new Date(r.Date).getTime()
          return t >= t180 && t < t90
        }).reduce((a, r) => a + r.usd, 0)
        let trend: BuyerRelationship['trend'] = 'stable'
        if (prevUsd > 0) {
          const pct = (recentUsd - prevUsd) / prevUsd * 100
          if (pct > 10) trend = 'growing'
          else if (pct < -10) trend = 'declining'
        }

        // Minerals for this buyer
        const mineralsForBuyer: BuyerMineralDetail[] = Object.entries(buyerMineralMap[buyer] || {})
          .sort((a, b) => b[1].usd - a[1].usd)
          .map(([mineral, bm]) => ({
            mineral,
            tons: Math.round(bm.tons * 100) / 100,
            usd: Math.round(bm.usd),
            kg: Math.round(bm.kg),
            shipmentCount: bm.count,
            firstDate: bm.firstDate,
            lastDate: bm.lastDate,
            avgUsdPerKg: bm.kg > 0 ? Math.round((bm.usd / bm.kg) * 1000) / 1000 : 0,
          }))

        const shareOfWallet = buyerTotalMarket[buyer] > 0
          ? (v.usd / buyerTotalMarket[buyer]) * 100
          : 0

        return {
          buyer,
          tons: Math.round(v.tons * 100) / 100,
          usd: Math.round(v.usd),
          kg: Math.round(v.kg),
          share: totalUsd > 0 ? (v.usd / totalUsd) * 100 : 0,
          shareOfWallet: Math.round(shareOfWallet * 10) / 10,
          firstDate: v.firstDate,
          lastDate: v.lastDate,
          daysSinceLast: daysSince,
          shipmentCount: v.count,
          status,
          trend,
          avgUsdPerKg: v.kg > 0 ? Math.round((v.usd / v.kg) * 1000) / 1000 : 0,
          minerals: mineralsForBuyer,
        }
      })

    // ─── Quarterly timeline (buyer × quarter) ────────────────────────────────
    const timelineMap: Record<string, Record<string, number>> = {}
    for (const r of sub) {
      if (!timelineMap[r.Quarter]) timelineMap[r.Quarter] = {}
      timelineMap[r.Quarter][r.buyer] = (timelineMap[r.Quarter][r.buyer] || 0) + r.usd
    }
    const quarterlyTimeline = Object.entries(timelineMap).flatMap(([quarter, buyers]) =>
      Object.entries(buyers).map(([buyer, value]) => ({ quarter, buyer, value })),
    )

    // ─── Monthly timeline ────────────────────────────────────────────────────
    const monthlyMap: Record<string, { usd: number; tons: number; shipments: number }> = {}
    for (const r of sub) {
      const mo = r.Date.slice(0, 7)
      if (!monthlyMap[mo]) monthlyMap[mo] = { usd: 0, tons: 0, shipments: 0 }
      monthlyMap[mo].usd += r.usd
      monthlyMap[mo].tons += r.tons
      monthlyMap[mo].shipments++
    }
    const monthlyTimeline = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        usd: Math.round(v.usd),
        tons: Math.round(v.tons * 100) / 100,
        shipments: v.shipments,
      }))

    // ─── Monthly buyer breakdown (pivot) ────────────────────────────────────
    const mbMap: Record<string, Record<string, number>> = {}
    for (const r of sub) {
      const m = r.Date.slice(0, 7)
      if (!mbMap[m]) mbMap[m] = {}
      mbMap[m][r.buyer] = (mbMap[m][r.buyer] || 0) + r.usd
    }
    const mbMonths = Object.keys(mbMap).sort()
    // Sort buyers by total USD desc
    const mbBuyerTotals: Record<string, number> = {}
    for (const [, byBuyer] of Object.entries(mbMap)) {
      for (const [buyer, usd] of Object.entries(byBuyer)) {
        mbBuyerTotals[buyer] = (mbBuyerTotals[buyer] || 0) + usd
      }
    }
    const mbBuyers = Object.entries(mbBuyerTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([b]) => b)
    const monthlyBuyerTimeline = {
      months: mbMonths,
      buyers: mbBuyers,
      rows: mbMonths.map((month) => {
        const row: { month: string; [key: string]: number | string } = { month }
        for (const buyer of mbBuyers) {
          row[buyer] = Math.round(mbMap[month]?.[buyer] ?? 0)
        }
        return row
      }),
    }

    // ─── Mineral mix (extended) ──────────────────────────────────────────────
    const mineralMapExt: Record<string, {
      tons: number; usd: number; kg: number; count: number; buyers: Set<string>
    }> = {}
    for (const r of sub) {
      if (!mineralMapExt[r.mineral]) mineralMapExt[r.mineral] = { tons: 0, usd: 0, kg: 0, count: 0, buyers: new Set() }
      mineralMapExt[r.mineral].tons += r.tons
      mineralMapExt[r.mineral].usd += r.usd
      mineralMapExt[r.mineral].kg += r.kg
      mineralMapExt[r.mineral].count++
      mineralMapExt[r.mineral].buyers.add(r.buyer)
    }

    // Market avg price by mineral
    const marketMineralPrice: Record<string, { sum: number; count: number }> = {}
    for (const r of all) {
      if (!marketMineralPrice[r.mineral]) marketMineralPrice[r.mineral] = { sum: 0, count: 0 }
      if (r.usd_per_kg > 0) {
        marketMineralPrice[r.mineral].sum += r.usd_per_kg
        marketMineralPrice[r.mineral].count++
      }
    }

    const mineralMix = Object.entries(mineralMapExt)
      .sort((a, b) => b[1].tons - a[1].tons)
      .map(([mineral, v]) => {
        const avgPriceKg = v.kg > 0 ? v.usd / v.kg : 0
        const mktData = marketMineralPrice[mineral]
        const marketAvgPriceKg = mktData?.count > 0 ? mktData.sum / mktData.count : 0
        const premiumPct = marketAvgPriceKg > 0 ? ((avgPriceKg - marketAvgPriceKg) / marketAvgPriceKg) * 100 : 0
        return {
          mineral,
          tons: Math.round(v.tons * 100) / 100,
          usd: Math.round(v.usd),
          kg: Math.round(v.kg),
          share: totalTons > 0 ? (v.tons / totalTons) * 100 : 0,
          avgPriceKg: Math.round(avgPriceKg * 1000) / 1000,
          marketAvgPriceKg: Math.round(marketAvgPriceKg * 1000) / 1000,
          premiumPct: Math.round(premiumPct * 10) / 10,
          buyers: [...v.buyers],
          shipmentCount: v.count,
        }
      })

    // ─── Price vs Market (primary mineral, monthly) ──────────────────────────
    const primaryMineral = mineralMix[0]?.mineral
    const allSameMineralRows = primaryMineral ? all.filter((r) => r.mineral === primaryMineral) : []
    const monthlyPriceSupplier: Record<string, { sum: number; count: number }> = {}
    const monthlyPriceMarket: Record<string, { sum: number; count: number }> = {}
    for (const r of sub) {
      if (r.mineral !== primaryMineral) continue
      const m = r.Date.slice(0, 7)
      if (!monthlyPriceSupplier[m]) monthlyPriceSupplier[m] = { sum: 0, count: 0 }
      if (r.usd_per_kg > 0) { monthlyPriceSupplier[m].sum += r.usd_per_kg; monthlyPriceSupplier[m].count++ }
    }
    for (const r of allSameMineralRows) {
      const m = r.Date.slice(0, 7)
      if (!monthlyPriceMarket[m]) monthlyPriceMarket[m] = { sum: 0, count: 0 }
      if (r.usd_per_kg > 0) { monthlyPriceMarket[m].sum += r.usd_per_kg; monthlyPriceMarket[m].count++ }
    }
    const priceVsMarket = Object.keys(monthlyPriceSupplier)
      .sort()
      .map((date) => ({
        date,
        supplierPrice: monthlyPriceSupplier[date].count > 0
          ? monthlyPriceSupplier[date].sum / monthlyPriceSupplier[date].count : 0,
        marketPrice: monthlyPriceMarket[date]?.count > 0
          ? monthlyPriceMarket[date].sum / monthlyPriceMarket[date].count : 0,
      }))

    // ─── Price vs Market by mineral ─────────────────────────────────────────
    const priceVsMarketByMineral = mineralMix.map(({ mineral }) => {
      const supplierMonthly: Record<string, { sum: number; count: number }> = {}
      const marketMonthly: Record<string, { sum: number; count: number }> = {}
      for (const r of sub) {
        if (r.mineral !== mineral) continue
        const mo = r.Date.slice(0, 7)
        if (!supplierMonthly[mo]) supplierMonthly[mo] = { sum: 0, count: 0 }
        if (r.usd_per_kg > 0) { supplierMonthly[mo].sum += r.usd_per_kg; supplierMonthly[mo].count++ }
      }
      for (const r of all) {
        if (r.mineral !== mineral) continue
        const mo = r.Date.slice(0, 7)
        if (!marketMonthly[mo]) marketMonthly[mo] = { sum: 0, count: 0 }
        if (r.usd_per_kg > 0) { marketMonthly[mo].sum += r.usd_per_kg; marketMonthly[mo].count++ }
      }
      const data = Object.keys(supplierMonthly).sort().map((date) => ({
        date,
        supplierPrice: supplierMonthly[date].count > 0 ? supplierMonthly[date].sum / supplierMonthly[date].count : 0,
        marketPrice: marketMonthly[date]?.count > 0 ? marketMonthly[date].sum / marketMonthly[date].count : 0,
      }))
      return { mineral, data }
    })

    // ─── Shipment size distribution ─────────────────────────────────────────
    const tonValues = sub.map((r) => r.tons).sort((a, b) => a - b)
    const shipmentDistribution = buildHistogramBuckets(tonValues, 10)

    // ─── Aduana usage (extended with tons) ──────────────────────────────────
    const aduanaMap: Record<string, { count: number; tons: number }> = {}
    for (const r of sub) {
      if (r.aduana) {
        if (!aduanaMap[r.aduana]) aduanaMap[r.aduana] = { count: 0, tons: 0 }
        aduanaMap[r.aduana].count++
        aduanaMap[r.aduana].tons += r.tons
      }
    }
    const aduanaUsage = Object.entries(aduanaMap)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([aduana, v]) => ({
        aduana,
        count: v.count,
        share: (v.count / sub.length) * 100,
        tons: Math.round(v.tons * 100) / 100,
      }))

    // ─── Seasonal pattern (extended with avgUsd and shipments) ──────────────
    const monthlySeasonMap: Record<number, { sumTons: number; sumUsd: number; count: number }> = {}
    for (const r of sub) {
      if (!monthlySeasonMap[r.month_num]) monthlySeasonMap[r.month_num] = { sumTons: 0, sumUsd: 0, count: 0 }
      monthlySeasonMap[r.month_num].sumTons += r.tons
      monthlySeasonMap[r.month_num].sumUsd += r.usd
      monthlySeasonMap[r.month_num].count++
    }
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const seasonalPattern = MONTHS.map((month, idx) => {
      const d = monthlySeasonMap[idx + 1]
      return {
        month,
        avgTons: d?.count > 0 ? d.sumTons / d.count : 0,
        avgUsd: d?.count > 0 ? d.sumUsd / d.count : 0,
        shipments: d?.count ?? 0,
      }
    })

    // ─── Competitor presence ─────────────────────────────────────────────────
    const competitorPresence = buyerShares.slice(0, 5).map((bs) => {
      const buyerRows = all.filter((r) => r.buyer === bs.buyer)
      const otherSuppliers = [...new Set(buyerRows.filter((r) => r.supplier !== supplierName).map((r) => r.supplier))]
        .slice(0, 5)
      return { buyer: bs.buyer, otherSuppliers }
    })

    // ─── Activity heatmap ────────────────────────────────────────────────────
    const heatmapMap: Record<string, { count: number; tons: number }> = {}
    for (const r of sub) {
      const key = `${r.year}-${r.month_num}`
      if (!heatmapMap[key]) heatmapMap[key] = { count: 0, tons: 0 }
      heatmapMap[key].count++
      heatmapMap[key].tons += r.tons
    }
    const activityHeatmap = Object.entries(heatmapMap).map(([key, v]) => {
      const [year, month] = key.split('-').map(Number)
      return { year, month, count: v.count, tons: Math.round(v.tons * 100) / 100 }
    })

    // ─── Recent transactions ─────────────────────────────────────────────────
    const recentTransactions = [...sub]
      .sort((a, b) => b.Date.localeCompare(a.Date))
      .slice(0, 50)
      .map((r) => ({
        date: r.Date,
        buyer: r.buyer,
        mineral: r.mineral,
        tons: Math.round(r.tons * 100) / 100,
        usd: Math.round(r.usd),
        usdPerKg: r.usd_per_kg,
        aduana: r.aduana ?? '',
      }))

    // ─── Health score ────────────────────────────────────────────────────────
    const recentTons = sub.filter((r) => new Date(r.Date).getTime() >= todayMs - 90 * 86400000).reduce((a, r) => a + r.tons, 0)
    const prevTons = sub.filter((r) => {
      const t = new Date(r.Date).getTime()
      return t >= todayMs - 180 * 86400000 && t < todayMs - 90 * 86400000
    }).reduce((a, r) => a + r.tons, 0)
    const momentum = prevTons > 0 ? ((recentTons - prevTons) / prevTons) * 100 : 0
    const recencyScore = Math.max(0, 100 - daysSinceLast / 3)
    const diversityScore = Math.min(100, buyerShares.length * 20)
    const volumeScore = Math.min(100, Math.log1p(totalTons) * 10)
    const healthScore = Math.round((recencyScore * 0.4 + diversityScore * 0.3 + volumeScore * 0.3))

    // ─── Peak quarter ────────────────────────────────────────────────────────
    const quarterTotals: Record<string, number> = {}
    for (const r of sub) quarterTotals[r.Quarter] = (quarterTotals[r.Quarter] || 0) + r.usd
    const peakQuarter = Object.entries(quarterTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

    const profile: SupplierProfile = {
      name: supplierName,
      totalShipments: sub.length,
      totalTons: Math.round(totalTons * 100) / 100,
      totalUsd: Math.round(totalUsd),
      totalKg: Math.round(totalKg),
      uniqueBuyers: buyerShares.length,
      firstShipment,
      lastShipment,
      daysSinceLast,
      avgDaysBetweenShipments,
      healthScore: Math.min(100, Math.max(0, healthScore)),
      momentumUsd: Math.round(momentum * 10) / 10,
      peakQuarter,
      buyerRelationships,
      buyerShares,
      quarterlyTimeline,
      monthlyTimeline,
      monthlyBuyerTimeline,
      mineralMix,
      priceVsMarket,
      priceVsMarketByMineral,
      shipmentDistribution,
      aduanaUsage,
      seasonalPattern,
      competitorPresence,
      activityHeatmap,
      recentTransactions,
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
