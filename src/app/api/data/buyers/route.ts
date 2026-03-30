/**
 * /api/data/buyers?buyer=NAME&...filters
 * Returns a full TraderProfile for one buyer, or a summary list.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters } from '@/lib/db'
import type { TraderProfile } from '@/types/data'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const buyerName = params.get('buyer')

    const all = await getData()
    const filters = parseFilters(params)
    const filtered = applyFilters(all, filters)

    // List mode
    if (!buyerName) {
      const map: Record<string, { tons: number; usd: number; shipments: number }> = {}
      for (const r of filtered) {
        if (!map[r.buyer]) map[r.buyer] = { tons: 0, usd: 0, shipments: 0 }
        map[r.buyer].tons += r.tons
        map[r.buyer].usd += r.usd
        map[r.buyer].shipments++
      }
      return NextResponse.json(
        Object.entries(map)
          .sort((a, b) => b[1].usd - a[1].usd)
          .map(([name, v]) => ({ name, ...v })),
      )
    }

    const sub = filtered.filter((r) => r.buyer === buyerName)
    if (!sub.length) return NextResponse.json(null)

    const todayMs = Date.now()
    const totalTons = sub.reduce((a, r) => a + r.tons, 0)
    const totalUsd = sub.reduce((a, r) => a + r.usd, 0)
    const allTotalUsd = all.reduce((a, r) => a + r.usd, 0)

    // Market share & trend
    const marketSharePct = allTotalUsd > 0 ? (totalUsd / allTotalUsd) * 100 : 0

    // Quarterly volume
    const qMap: Record<string, { usd: number; tons: number }> = {}
    for (const r of sub) {
      if (!qMap[r.Quarter]) qMap[r.Quarter] = { usd: 0, tons: 0 }
      qMap[r.Quarter].usd += r.usd
      qMap[r.Quarter].tons += r.tons
    }
    const quarterlyVolume = Object.entries(qMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([quarter, v]) => ({ quarter, ...v }))

    // Market share trend
    const qVals = quarterlyVolume.map((q) => q.usd)
    const marketShareTrend: 'growing' | 'declining' | 'stable' =
      qVals.length >= 3
        ? qVals[qVals.length - 1] > qVals[qVals.length - 3] * 1.05
          ? 'growing'
          : qVals[qVals.length - 1] < qVals[qVals.length - 3] * 0.95
          ? 'declining'
          : 'stable'
        : 'stable'

    // Supplier roster
    const supplierRosterMap: Record<string, {
      totalKg: number; totalUsd: number; shipmentCount: number
      firstShipment: string; lastShipment: string
    }> = {}
    for (const r of sub) {
      if (!supplierRosterMap[r.supplier]) {
        supplierRosterMap[r.supplier] = {
          totalKg: 0, totalUsd: 0, shipmentCount: 0,
          firstShipment: r.Date, lastShipment: r.Date,
        }
      }
      supplierRosterMap[r.supplier].totalKg += r.kg
      supplierRosterMap[r.supplier].totalUsd += r.usd
      supplierRosterMap[r.supplier].shipmentCount++
      if (r.Date < supplierRosterMap[r.supplier].firstShipment) {
        supplierRosterMap[r.supplier].firstShipment = r.Date
      }
      if (r.Date > supplierRosterMap[r.supplier].lastShipment) {
        supplierRosterMap[r.supplier].lastShipment = r.Date
      }
    }

    // Share of wallet: what % of supplier's total volume goes to this buyer
    const supplierTotals: Record<string, number> = {}
    for (const r of all) supplierTotals[r.supplier] = (supplierTotals[r.supplier] || 0) + r.usd

    const supplierRoster = Object.entries(supplierRosterMap)
      .sort((a, b) => b[1].totalUsd - a[1].totalUsd)
      .map(([supplier, v]) => ({
        supplier,
        totalKg: v.totalKg,
        totalUsd: v.totalUsd,
        shipmentCount: v.shipmentCount,
        firstShipment: v.firstShipment,
        lastShipment: v.lastShipment,
        shareOfWallet: supplierTotals[supplier] > 0
          ? (v.totalUsd / supplierTotals[supplier]) * 100
          : 0,
        avgUsdPerShipment: v.shipmentCount > 0 ? v.totalUsd / v.shipmentCount : 0,
      }))

    // New acquisitions: first purchase within filtered range
    const firstPurchaseDates: Record<string, string> = {}
    for (const r of all.filter((r) => r.buyer === buyerName)) {
      if (!firstPurchaseDates[r.supplier] || r.Date < firstPurchaseDates[r.supplier]) {
        firstPurchaseDates[r.supplier] = r.Date
      }
    }
    const filteredMinDate = sub.map((r) => r.Date).sort()[0]
    const newAcquisitions = supplierRoster
      .filter((s) => firstPurchaseDates[s.supplier] >= filteredMinDate)
      .map((s) => ({
        supplier: s.supplier,
        firstPurchaseDate: firstPurchaseDates[s.supplier],
        totalUsdSince: s.totalUsd,
        totalKgSince: s.totalKg,
        shipmentsSince: s.shipmentCount,
      }))
      .sort((a, b) => b.firstPurchaseDate.localeCompare(a.firstPurchaseDate))

    // Price vs market per mineral
    const minerals = [...new Set(sub.map((r) => r.mineral))]
    const priceVsMarket: TraderProfile['priceVsMarket'] = []
    const pricingPower: TraderProfile['pricingPower'] = []

    for (const mineral of minerals) {
      const mineralSub = sub.filter((r) => r.mineral === mineral)
      const mineralAll = all.filter((r) => r.mineral === mineral)

      const monthlyBuyer: Record<string, { sum: number; n: number }> = {}
      const monthlyMarket: Record<string, { sum: number; n: number }> = {}

      for (const r of mineralSub) {
        const m = r.Date.slice(0, 7)
        if (!monthlyBuyer[m]) monthlyBuyer[m] = { sum: 0, n: 0 }
        if (r.usd_per_kg > 0) { monthlyBuyer[m].sum += r.usd_per_kg; monthlyBuyer[m].n++ }
      }
      for (const r of mineralAll) {
        const m = r.Date.slice(0, 7)
        if (!monthlyMarket[m]) monthlyMarket[m] = { sum: 0, n: 0 }
        if (r.usd_per_kg > 0) { monthlyMarket[m].sum += r.usd_per_kg; monthlyMarket[m].n++ }
      }

      Object.keys(monthlyBuyer).sort().forEach((date) => {
        priceVsMarket.push({
          mineral,
          date,
          traderPrice: monthlyBuyer[date].n > 0 ? monthlyBuyer[date].sum / monthlyBuyer[date].n : 0,
          marketPrice: monthlyMarket[date]?.n > 0 ? monthlyMarket[date].sum / monthlyMarket[date].n : 0,
        })
      })

      // Pricing power: overall avg vs market avg
      const buyerAvg = Object.values(monthlyBuyer).reduce((a, v) => a + v.sum, 0) /
        Math.max(Object.values(monthlyBuyer).reduce((a, v) => a + v.n, 0), 1)
      const marketAvg = Object.values(monthlyMarket).reduce((a, v) => a + v.sum, 0) /
        Math.max(Object.values(monthlyMarket).reduce((a, v) => a + v.n, 0), 1)
      pricingPower.push({
        mineral,
        premiumPct: marketAvg > 0 ? ((buyerAvg - marketAvg) / marketAvg) * 100 : 0,
      })
    }

    // Aduana + lot size
    const aduanaMap: Record<string, number> = {}
    for (const r of sub) if (r.aduana) aduanaMap[r.aduana] = (aduanaMap[r.aduana] || 0) + 1
    const aduanaUsage = Object.entries(aduanaMap)
      .sort((a, b) => b[1] - a[1])
      .map(([aduana, count]) => ({ aduana, count, share: (count / sub.length) * 100 }))

    const sortedTons = sub.map((r) => r.tons).sort((a, b) => a - b)
    const lotSizeDistribution = buildHistBuckets(sortedTons, 8)

    const firstShipment = sub.map((r) => r.Date).sort()[0]
    const lastShipment = sub.map((r) => r.Date).sort().at(-1)!

    // ── Supplier × Mineral breakdown ─────────────────────────────────────
    const smMap: Record<string, Record<string, {
      usd: number; tons: number; kg: number; count: number
      firstDate: string; lastDate: string
      recent90: number; prev90: number
    }>> = {}

    for (const r of sub) {
      if (!smMap[r.supplier]) smMap[r.supplier] = {}
      if (!smMap[r.supplier][r.mineral]) {
        smMap[r.supplier][r.mineral] = {
          usd: 0, tons: 0, kg: 0, count: 0,
          firstDate: r.Date, lastDate: r.Date,
          recent90: 0, prev90: 0,
        }
      }
      const m = smMap[r.supplier][r.mineral]
      m.usd += r.usd
      m.tons += r.tons
      m.kg += r.kg
      m.count++
      if (r.Date < m.firstDate) m.firstDate = r.Date
      if (r.Date > m.lastDate) m.lastDate = r.Date
      const rMs = new Date(r.Date).getTime()
      if (rMs >= todayMs - 90 * 86400000) m.recent90 += r.tons
      else if (rMs >= todayMs - 180 * 86400000) m.prev90 += r.tons
    }

    const supplierMineralBreakdown = Object.entries(smMap)
      .map(([supplier, mineralMap]) => {
        const minerals = Object.entries(mineralMap)
          .map(([mineral, v]) => {
            const daysSinceLast = Math.round((todayMs - new Date(v.lastDate).getTime()) / 86400000)
            const trend: 'growing' | 'falling' | 'stable' =
              v.prev90 === 0 ? 'stable'
              : v.recent90 > v.prev90 * 1.1 ? 'growing'
              : v.recent90 < v.prev90 * 0.9 ? 'falling'
              : 'stable'
            return {
              mineral,
              totalUsd: Math.round(v.usd),
              totalTons: Math.round(v.tons * 100) / 100,
              shipmentCount: v.count,
              firstDelivery: v.firstDate,
              lastDelivery: v.lastDate,
              daysSinceLast,
              avgTonsPerShipment: Math.round((v.tons / v.count) * 100) / 100,
              avgUsdPerKg: v.kg > 0 ? Math.round((v.usd / v.kg) * 1000) / 1000 : 0,
              trend,
            }
          })
          .sort((a, b) => b.totalUsd - a.totalUsd)

        const lastDelivery = minerals.reduce((d, m) => m.lastDelivery > d ? m.lastDelivery : d, '')
        const daysSinceLast = Math.round((todayMs - new Date(lastDelivery).getTime()) / 86400000)
        const suppTotal = supplierTotals[supplier] ?? 0
        const supplierTotalUsd = minerals.reduce((a, m) => a + m.totalUsd, 0)

        return {
          supplier,
          lastDelivery,
          daysSinceLast,
          totalUsd: supplierTotalUsd,
          totalTons: Math.round(minerals.reduce((a, m) => a + m.totalTons, 0) * 100) / 100,
          shipmentCount: minerals.reduce((a, m) => a + m.shipmentCount, 0),
          shareOfWallet: suppTotal > 0 ? Math.round((supplierTotalUsd / suppTotal) * 1000) / 10 : 0,
          minerals,
        }
      })
      .sort((a, b) => b.lastDelivery.localeCompare(a.lastDelivery))

    const profile: TraderProfile = {
      name: buyerName,
      totalShipments: sub.length,
      totalTons: Math.round(totalTons * 100) / 100,
      totalUsd: Math.round(totalUsd),
      uniqueSuppliers: supplierRoster.length,
      firstShipment,
      lastShipment,
      marketSharePct: Math.round(marketSharePct * 100) / 100,
      marketShareTrend,
      quarterlyVolume,
      supplierRoster,
      newAcquisitions,
      priceVsMarket,
      pricingPower,
      aduanaUsage,
      lotSizeDistribution,
      supplierMineralBreakdown,
    }

    return NextResponse.json(profile)
  } catch (err) {
    console.error('[/api/data/buyers]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

function buildHistBuckets(sorted: number[], n: number): { bucket: string; count: number }[] {
  if (!sorted.length) return []
  const min = sorted[0], max = sorted[sorted.length - 1]
  const size = (max - min) / n || 1
  const counts = new Array(n).fill(0)
  for (const v of sorted) counts[Math.min(Math.floor((v - min) / size), n - 1)]++
  return counts.map((count, i) => ({
    bucket: `${(min + i * size).toFixed(1)}–${(min + (i + 1) * size).toFixed(1)}`,
    count,
  }))
}
