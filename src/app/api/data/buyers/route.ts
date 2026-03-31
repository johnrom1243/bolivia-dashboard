/**
 * /api/data/buyers?buyer=NAME&...filters
 * Returns a full TraderProfile for one buyer, or a summary list.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters } from '@/lib/db'
import type { TraderProfile } from '@/types/data'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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

    // Use latest data date as reference "today" so recency/windows are meaningful
    const todayMs = Math.max(...all.map((r) => new Date(r.Date).getTime()))
    const totalTons = sub.reduce((a, r) => a + r.tons, 0)
    const totalUsd = sub.reduce((a, r) => a + r.usd, 0)
    const totalKg = sub.reduce((a, r) => a + r.kg, 0)
    const allTotalUsd = all.reduce((a, r) => a + r.usd, 0)

    const firstShipment = sub.map((r) => r.Date).sort()[0]
    const lastShipment = sub.map((r) => r.Date).sort().at(-1)!
    const daysSinceLast = Math.round((todayMs - new Date(lastShipment).getTime()) / 86400000)

    // Avg days between shipments
    const sortedDates = sub.map((r) => r.Date).sort()
    let avgDaysBetweenShipments = 0
    if (sortedDates.length >= 2) {
      const totalSpan = new Date(sortedDates[sortedDates.length - 1]).getTime() - new Date(sortedDates[0]).getTime()
      avgDaysBetweenShipments = Math.round(totalSpan / (sortedDates.length - 1) / 86400000)
    }

    const avgPriceKg = totalKg > 0 ? totalUsd / totalKg : 0

    // Market share & trend
    const marketSharePct = allTotalUsd > 0 ? (totalUsd / allTotalUsd) * 100 : 0

    // Market share rank
    const buyerUsdMap: Record<string, number> = {}
    for (const r of all) buyerUsdMap[r.buyer] = (buyerUsdMap[r.buyer] || 0) + r.usd
    const sortedBuyers = Object.entries(buyerUsdMap).sort((a, b) => b[1] - a[1])
    const marketShareRank = sortedBuyers.findIndex(([b]) => b === buyerName) + 1
    const totalBuyersInMarket = sortedBuyers.length

    // Quarterly volume
    const qMap: Record<string, { usd: number; tons: number; shipments: number }> = {}
    for (const r of sub) {
      if (!qMap[r.Quarter]) qMap[r.Quarter] = { usd: 0, tons: 0, shipments: 0 }
      qMap[r.Quarter].usd += r.usd
      qMap[r.Quarter].tons += r.tons
      qMap[r.Quarter].shipments++
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

    // Monthly timeline
    const monthMap: Record<string, { usd: number; tons: number; shipments: number }> = {}
    for (const r of sub) {
      const m = r.Date.slice(0, 7)
      if (!monthMap[m]) monthMap[m] = { usd: 0, tons: 0, shipments: 0 }
      monthMap[m].usd += r.usd
      monthMap[m].tons += r.tons
      monthMap[m].shipments++
    }
    const monthlyTimeline = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }))

    // ─── Monthly supplier breakdown (pivot) ─────────────────────────────────
    const msBuyerMap: Record<string, Record<string, number>> = {}
    for (const r of sub) {
      const m = r.Date.slice(0, 7)
      if (!msBuyerMap[m]) msBuyerMap[m] = {}
      msBuyerMap[m][r.supplier] = (msBuyerMap[m][r.supplier] || 0) + r.usd
    }
    const msMonths = Object.keys(msBuyerMap).sort()
    // Sort suppliers by total USD desc, cap at top 12 for readability
    const msSupplierTotals: Record<string, number> = {}
    for (const [, bySupplier] of Object.entries(msBuyerMap)) {
      for (const [supplier, usd] of Object.entries(bySupplier)) {
        msSupplierTotals[supplier] = (msSupplierTotals[supplier] || 0) + usd
      }
    }
    const msSuppliers = Object.entries(msSupplierTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([s]) => s)
    const monthlySupplierTimeline = {
      months: msMonths,
      suppliers: msSuppliers,
      rows: msMonths.map((month) => {
        const row: { month: string; [key: string]: number | string } = { month }
        for (const supplier of msSuppliers) {
          row[supplier] = Math.round(msBuyerMap[month]?.[supplier] ?? 0)
        }
        return row
      }),
    }

    // YoY comparison
    const yearMap: Record<number, { usd: number; tons: number; shipments: number; supplierSet: Set<string> }> = {}
    for (const r of sub) {
      if (!yearMap[r.year]) yearMap[r.year] = { usd: 0, tons: 0, shipments: 0, supplierSet: new Set() }
      yearMap[r.year].usd += r.usd
      yearMap[r.year].tons += r.tons
      yearMap[r.year].shipments++
      yearMap[r.year].supplierSet.add(r.supplier)
    }
    const yoyComparison = Object.entries(yearMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, v]) => ({
        year: Number(year),
        usd: Math.round(v.usd),
        tons: Math.round(v.tons * 100) / 100,
        shipments: v.shipments,
        suppliers: v.supplierSet.size,
      }))

    // Seasonal pattern (avg per month-of-year across all years)
    const seasonMap: Record<number, { usdSum: number; tonsSum: number; shipSum: number; yearSet: Set<number> }> = {}
    for (const r of sub) {
      const mn = r.month_num
      if (!seasonMap[mn]) seasonMap[mn] = { usdSum: 0, tonsSum: 0, shipSum: 0, yearSet: new Set() }
      seasonMap[mn].usdSum += r.usd
      seasonMap[mn].tonsSum += r.tons
      seasonMap[mn].shipSum++
      seasonMap[mn].yearSet.add(r.year)
    }
    const seasonalPattern = Array.from({ length: 12 }, (_, i) => {
      const mn = i + 1
      const d = seasonMap[mn]
      const count = d ? d.yearSet.size : 0
      return {
        month: MONTH_NAMES[i],
        avgTons: d && count > 0 ? Math.round((d.tonsSum / count) * 100) / 100 : 0,
        avgUsd: d && count > 0 ? Math.round(d.usdSum / count) : 0,
        avgShipments: d && count > 0 ? Math.round((d.shipSum / count) * 10) / 10 : 0,
      }
    })

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
    const supplierKgTotals: Record<string, number> = {}
    for (const r of all) {
      supplierTotals[r.supplier] = (supplierTotals[r.supplier] || 0) + r.usd
      supplierKgTotals[r.supplier] = (supplierKgTotals[r.supplier] || 0) + r.kg
    }

    // Classify supplier status
    function classifyStatus(firstShipDate: string, lastShipDate: string): 'Active' | 'New' | 'At-risk' | 'Dormant' {
      const daysSince = Math.round((todayMs - new Date(lastShipDate).getTime()) / 86400000)
      const ageMs = todayMs - new Date(firstShipDate).getTime()
      const ageDays = ageMs / 86400000
      if (daysSince < 90 && ageDays < 180) return 'New'
      if (daysSince < 90) return 'Active'
      if (daysSince < 180) return 'At-risk'
      return 'Dormant'
    }

    const supplierRoster = Object.entries(supplierRosterMap)
      .sort((a, b) => b[1].totalUsd - a[1].totalUsd)
      .map(([supplier, v]) => {
        const dsl = Math.round((todayMs - new Date(v.lastShipment).getTime()) / 86400000)
        return {
          supplier,
          totalKg: Math.round(v.totalKg),
          totalUsd: Math.round(v.totalUsd),
          shipmentCount: v.shipmentCount,
          firstShipment: v.firstShipment,
          lastShipment: v.lastShipment,
          daysSinceLast: dsl,
          status: classifyStatus(v.firstShipment, v.lastShipment) as 'Active' | 'New' | 'At-risk' | 'Dormant',
          shareOfWallet: supplierTotals[supplier] > 0
            ? (v.totalUsd / supplierTotals[supplier]) * 100
            : 0,
          avgUsdPerShipment: v.shipmentCount > 0 ? v.totalUsd / v.shipmentCount : 0,
          avgPriceKg: v.totalKg > 0 ? v.totalUsd / v.totalKg : 0,
        }
      })

    // Supplier status counts
    const supplierStatusCounts = { active: 0, new: 0, atRisk: 0, dormant: 0 }
    for (const s of supplierRoster) {
      if (s.status === 'Active') supplierStatusCounts.active++
      else if (s.status === 'New') supplierStatusCounts.new++
      else if (s.status === 'At-risk') supplierStatusCounts.atRisk++
      else supplierStatusCounts.dormant++
    }

    // Concentration risk
    const sortedByUsd = [...supplierRoster].sort((a, b) => b.totalUsd - a.totalUsd)
    const top1Usd = sortedByUsd.slice(0, 1).reduce((a, s) => a + s.totalUsd, 0)
    const top3Usd = sortedByUsd.slice(0, 3).reduce((a, s) => a + s.totalUsd, 0)
    const top5Usd = sortedByUsd.slice(0, 5).reduce((a, s) => a + s.totalUsd, 0)
    const concentrationRisk = {
      top1Share: totalUsd > 0 ? (top1Usd / totalUsd) * 100 : 0,
      top3Share: totalUsd > 0 ? (top3Usd / totalUsd) * 100 : 0,
      top5Share: totalUsd > 0 ? (top5Usd / totalUsd) * 100 : 0,
    }

    // Supplier retention rate
    const years = [...new Set(sub.map((r) => r.year))].sort()
    let supplierRetentionRate = 0
    if (years.length >= 2) {
      const mostRecentYear = years[years.length - 1]
      const prevYear = years[years.length - 2]
      const prevYearSuppliers = new Set(sub.filter((r) => r.year === prevYear).map((r) => r.supplier))
      const recentYearSuppliers = new Set(sub.filter((r) => r.year === mostRecentYear).map((r) => r.supplier))
      const retained = [...prevYearSuppliers].filter((s) => recentYearSuppliers.has(s)).length
      supplierRetentionRate = prevYearSuppliers.size > 0 ? (retained / prevYearSuppliers.size) * 100 : 0
    }

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

    // Supplier acquisition timeline
    const supplierFirstData: Record<string, { date: string; mineral: string; usd: number }> = {}
    for (const r of sub) {
      const existing = supplierFirstData[r.supplier]
      if (!existing || r.Date < existing.date) {
        supplierFirstData[r.supplier] = { date: r.Date, mineral: r.mineral, usd: r.usd }
      }
    }
    const supplierAcquisitionTimeline = Object.entries(supplierFirstData)
      .map(([supplier, d]) => ({ date: d.date, supplier, mineral: d.mineral, firstUsd: Math.round(d.usd) }))
      .sort((a, b) => a.date.localeCompare(b.date))

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

      const buyerAvg = Object.values(monthlyBuyer).reduce((a, v) => a + v.sum, 0) /
        Math.max(Object.values(monthlyBuyer).reduce((a, v) => a + v.n, 0), 1)
      const marketAvg = Object.values(monthlyMarket).reduce((a, v) => a + v.sum, 0) /
        Math.max(Object.values(monthlyMarket).reduce((a, v) => a + v.n, 0), 1)
      pricingPower.push({
        mineral,
        premiumPct: marketAvg > 0 ? ((buyerAvg - marketAvg) / marketAvg) * 100 : 0,
      })
    }

    // Mineral breakdown (richer)
    const mineralBreakdownMap: Record<string, {
      usd: number; tons: number; kg: number; shipmentCount: number; supplierSet: Set<string>
    }> = {}
    for (const r of sub) {
      if (!mineralBreakdownMap[r.mineral]) {
        mineralBreakdownMap[r.mineral] = { usd: 0, tons: 0, kg: 0, shipmentCount: 0, supplierSet: new Set() }
      }
      mineralBreakdownMap[r.mineral].usd += r.usd
      mineralBreakdownMap[r.mineral].tons += r.tons
      mineralBreakdownMap[r.mineral].kg += r.kg
      mineralBreakdownMap[r.mineral].shipmentCount++
      mineralBreakdownMap[r.mineral].supplierSet.add(r.supplier)
    }
    // Market avg price per mineral
    const marketAvgPriceByMineral: Record<string, number> = {}
    const marketMineralMap: Record<string, { usd: number; kg: number }> = {}
    for (const r of all) {
      if (!marketMineralMap[r.mineral]) marketMineralMap[r.mineral] = { usd: 0, kg: 0 }
      marketMineralMap[r.mineral].usd += r.usd
      marketMineralMap[r.mineral].kg += r.kg
    }
    for (const [mineral, v] of Object.entries(marketMineralMap)) {
      marketAvgPriceByMineral[mineral] = v.kg > 0 ? v.usd / v.kg : 0
    }
    const mineralBreakdown = Object.entries(mineralBreakdownMap)
      .sort((a, b) => b[1].usd - a[1].usd)
      .map(([mineral, v]) => {
        const avgPriceKgM = v.kg > 0 ? v.usd / v.kg : 0
        const marketAvgPriceKg = marketAvgPriceByMineral[mineral] || 0
        return {
          mineral,
          usd: Math.round(v.usd),
          tons: Math.round(v.tons * 100) / 100,
          kg: Math.round(v.kg),
          share: totalUsd > 0 ? (v.usd / totalUsd) * 100 : 0,
          shipmentCount: v.shipmentCount,
          supplierCount: v.supplierSet.size,
          avgPriceKg: Math.round(avgPriceKgM * 1000) / 1000,
          marketAvgPriceKg: Math.round(marketAvgPriceKg * 1000) / 1000,
          premiumPct: marketAvgPriceKg > 0 ? ((avgPriceKgM - marketAvgPriceKg) / marketAvgPriceKg) * 100 : 0,
        }
      })

    // Aduana + lot size
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

    const sortedTons = sub.map((r) => r.tons).sort((a, b) => a - b)
    const lotSizeDistribution = buildHistBuckets(sortedTons, 8)

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
        const mineralEntries = Object.entries(mineralMap)
          .map(([mineral, v]) => {
            const dsl2 = Math.round((todayMs - new Date(v.lastDate).getTime()) / 86400000)
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
              daysSinceLast: dsl2,
              avgTonsPerShipment: Math.round((v.tons / v.count) * 100) / 100,
              avgUsdPerKg: v.kg > 0 ? Math.round((v.usd / v.kg) * 1000) / 1000 : 0,
              trend,
            }
          })
          .sort((a, b) => b.totalUsd - a.totalUsd)

        const lastDelivery = mineralEntries.reduce((d, m) => m.lastDelivery > d ? m.lastDelivery : d, '')
        const dsl3 = Math.round((todayMs - new Date(lastDelivery).getTime()) / 86400000)
        const suppTotal = supplierTotals[supplier] ?? 0
        const supplierTotalUsd = mineralEntries.reduce((a, m) => a + m.totalUsd, 0)
        const supplierTotalKg = Object.values(mineralMap).reduce((a, v) => a + v.kg, 0)
        const supplierStatus = classifyStatus(
          supplierRosterMap[supplier]?.firstShipment ?? lastDelivery,
          lastDelivery,
        ) as 'Active' | 'New' | 'At-risk' | 'Dormant'

        return {
          supplier,
          lastDelivery,
          daysSinceLast: dsl3,
          totalUsd: supplierTotalUsd,
          totalTons: Math.round(mineralEntries.reduce((a, m) => a + m.totalTons, 0) * 100) / 100,
          shipmentCount: mineralEntries.reduce((a, m) => a + m.shipmentCount, 0),
          shareOfWallet: suppTotal > 0 ? Math.round((supplierTotalUsd / suppTotal) * 1000) / 10 : 0,
          status: supplierStatus,
          avgPriceKg: supplierTotalKg > 0 ? Math.round((supplierTotalUsd / supplierTotalKg) * 1000) / 1000 : 0,
          minerals: mineralEntries,
        }
      })
      .sort((a, b) => b.lastDelivery.localeCompare(a.lastDelivery))

    // Recent transactions (last 50)
    const recentTransactions = [...sub]
      .sort((a, b) => b.Date.localeCompare(a.Date))
      .slice(0, 50)
      .map((r) => ({
        date: r.Date,
        supplier: r.supplier,
        mineral: r.mineral,
        tons: Math.round(r.tons * 100) / 100,
        usd: Math.round(r.usd),
        usdPerKg: Math.round(r.usd_per_kg * 1000) / 1000,
        aduana: r.aduana || '',
      }))

    const profile: TraderProfile = {
      name: buyerName,
      totalShipments: sub.length,
      totalTons: Math.round(totalTons * 100) / 100,
      totalUsd: Math.round(totalUsd),
      totalKg: Math.round(totalKg),
      uniqueSuppliers: supplierRoster.length,
      firstShipment,
      lastShipment,
      daysSinceLast,
      avgDaysBetweenShipments,
      avgPriceKg: Math.round(avgPriceKg * 1000) / 1000,
      marketSharePct: Math.round(marketSharePct * 100) / 100,
      marketShareTrend,
      marketShareRank,
      totalBuyersInMarket,
      supplierRetentionRate: Math.round(supplierRetentionRate * 10) / 10,
      supplierStatusCounts,
      concentrationRisk: {
        top1Share: Math.round(concentrationRisk.top1Share * 10) / 10,
        top3Share: Math.round(concentrationRisk.top3Share * 10) / 10,
        top5Share: Math.round(concentrationRisk.top5Share * 10) / 10,
      },
      quarterlyVolume,
      monthlyTimeline,
      monthlySupplierTimeline,
      yoyComparison,
      mineralBreakdown,
      seasonalPattern,
      supplierAcquisitionTimeline,
      supplierRoster,
      newAcquisitions,
      priceVsMarket,
      pricingPower,
      aduanaUsage,
      lotSizeDistribution,
      supplierMineralBreakdown,
      recentTransactions,
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
