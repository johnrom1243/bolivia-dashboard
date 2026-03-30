import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters } from '@/lib/db'
import type { KpiData } from '@/types/data'

export async function GET(req: NextRequest) {
  try {
    const all = await getData()
    const filters = parseFilters(req.nextUrl.searchParams)
    const filtered = applyFilters(all, filters)
    const topN = filters.topN ?? 15

    if (!filtered.length) return NextResponse.json(null)

    // ── Date range ────────────────────────────────────────────────────────────
    const allDates = filtered.map((r) => r.Date).sort()
    const dataDateRange = { min: allDates[0], max: allDates[allDates.length - 1] }

    // ── YoY calculation ───────────────────────────────────────────────────────
    const years = [...new Set(filtered.map((r) => r.year))].sort()
    const currentYear = years[years.length - 1]
    const prevYear = currentYear - 1
    const currentYearRows = filtered.filter((r) => r.year === currentYear)
    const prevYearRows = all.filter((r) => r.year === prevYear)

    const today = new Date()
    const isIncomplete = currentYear === today.getFullYear() && today.getMonth() < 11
    const maxMonth = Math.max(...currentYearRows.map((r) => r.month_num))
    const prevComparableRows = isIncomplete
      ? prevYearRows.filter((r) => r.month_num <= maxMonth)
      : prevYearRows

    const curUsd = currentYearRows.reduce((a, r) => a + r.usd, 0)
    const curTons = currentYearRows.reduce((a, r) => a + r.tons, 0)
    const prevUsd = prevComparableRows.reduce((a, r) => a + r.usd, 0)
    const prevTons = prevComparableRows.reduce((a, r) => a + r.tons, 0)

    const yoyUsd = prevUsd > 0 ? ((curUsd - prevUsd) / prevUsd) * 100 : null
    const yoyTons = prevTons > 0 ? ((curTons - prevTons) / prevTons) * 100 : null

    // ── Totals ────────────────────────────────────────────────────────────────
    const totalUsd = filtered.reduce((a, r) => a + r.usd, 0)
    const totalTons = filtered.reduce((a, r) => a + r.tons, 0)
    const totalKg = filtered.reduce((a, r) => a + r.kg, 0)
    const avgPricePerKg = totalKg > 0 ? totalUsd / totalKg : 0

    // ── Penfold share ─────────────────────────────────────────────────────────
    const penfoldUsd = filtered
      .filter((r) => r.buyer.toLowerCase().includes('penfold'))
      .reduce((a, r) => a + r.usd, 0)
    const penfoldSharePct = totalUsd > 0 ? (penfoldUsd / totalUsd) * 100 : 0

    // ── Supplier / buyer maps ─────────────────────────────────────────────────
    const supplierMap: Record<string, { usd: number; tons: number; kg: number }> = {}
    const buyerMap: Record<string, { usd: number; tons: number }> = {}

    for (const r of filtered) {
      if (!supplierMap[r.supplier]) supplierMap[r.supplier] = { usd: 0, tons: 0, kg: 0 }
      supplierMap[r.supplier].usd += r.usd
      supplierMap[r.supplier].tons += r.tons
      supplierMap[r.supplier].kg += r.kg
      if (!buyerMap[r.buyer]) buyerMap[r.buyer] = { usd: 0, tons: 0 }
      buyerMap[r.buyer].usd += r.usd
      buyerMap[r.buyer].tons += r.tons
    }

    const topSuppliers = Object.entries(supplierMap)
      .sort((a, b) => b[1].usd - a[1].usd)
      .slice(0, topN)
      .map(([name, v]) => ({
        name, ...v,
        share: totalUsd > 0 ? (v.usd / totalUsd) * 100 : 0,
        avgPriceKg: v.kg > 0 ? v.usd / v.kg : 0,
      }))

    const topBuyers = Object.entries(buyerMap)
      .sort((a, b) => b[1].usd - a[1].usd)
      .slice(0, topN)
      .map(([name, v]) => ({ name, ...v, share: totalUsd > 0 ? (v.usd / totalUsd) * 100 : 0 }))

    // ── Quarterly trend ────────────────────────────────────────────────────────
    const quarterlyMap: Record<string, { usd: number; tons: number; shipments: number; kg: number }> = {}
    for (const r of filtered) {
      if (!quarterlyMap[r.Quarter]) quarterlyMap[r.Quarter] = { usd: 0, tons: 0, shipments: 0, kg: 0 }
      quarterlyMap[r.Quarter].usd += r.usd
      quarterlyMap[r.Quarter].tons += r.tons
      quarterlyMap[r.Quarter].shipments++
      quarterlyMap[r.Quarter].kg += r.kg
    }
    const quarterlyTrend = Object.entries(quarterlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([quarter, v]) => ({
        quarter, usd: Math.round(v.usd), tons: Math.round(v.tons * 100) / 100,
        shipments: v.shipments,
        avgPriceKg: v.kg > 0 ? Math.round((v.usd / v.kg) * 100) / 100 : 0,
      }))

    // ── Monthly trend ──────────────────────────────────────────────────────────
    const monthlyMap: Record<string, { usd: number; tons: number; shipments: number }> = {}
    for (const r of filtered) {
      const m = r.Date.slice(0, 7) // YYYY-MM
      if (!monthlyMap[m]) monthlyMap[m] = { usd: 0, tons: 0, shipments: 0 }
      monthlyMap[m].usd += r.usd
      monthlyMap[m].tons += r.tons
      monthlyMap[m].shipments++
    }
    const monthlyTrend = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, usd: Math.round(v.usd), tons: Math.round(v.tons * 100) / 100, shipments: v.shipments }))

    // ── Price by mineral per quarter ──────────────────────────────────────────
    const mineralSet = [...new Set(filtered.map((r) => r.mineral))].sort()
    const priceQMap: Record<string, Record<string, { usd: number; kg: number }>> = {}
    for (const r of filtered) {
      if (!priceQMap[r.Quarter]) priceQMap[r.Quarter] = {}
      if (!priceQMap[r.Quarter][r.mineral]) priceQMap[r.Quarter][r.mineral] = { usd: 0, kg: 0 }
      priceQMap[r.Quarter][r.mineral].usd += r.usd
      priceQMap[r.Quarter][r.mineral].kg += r.kg
    }
    const priceByMineralQuarter: Record<string, number | string>[] = Object.entries(priceQMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([quarter, minerals]) => {
        const row: Record<string, number | string> = { quarter }
        for (const m of mineralSet) {
          const d = minerals[m]
          row[m] = d && d.kg > 0 ? Math.round((d.usd / d.kg) * 1000) / 1000 : 0
        }
        return row
      })

    // ── Mineral breakdown ─────────────────────────────────────────────────────
    const mineralMap: Record<string, { usd: number; tons: number; kg: number; shipments: number }> = {}
    for (const r of filtered) {
      if (!mineralMap[r.mineral]) mineralMap[r.mineral] = { usd: 0, tons: 0, kg: 0, shipments: 0 }
      mineralMap[r.mineral].usd += r.usd
      mineralMap[r.mineral].tons += r.tons
      mineralMap[r.mineral].kg += r.kg
      mineralMap[r.mineral].shipments++
    }
    const mineralBreakdown = Object.entries(mineralMap)
      .sort((a, b) => b[1].usd - a[1].usd)
      .map(([mineral, v]) => ({
        mineral,
        usd: Math.round(v.usd),
        tons: Math.round(v.tons * 100) / 100,
        shipments: v.shipments,
        share: totalUsd > 0 ? Math.round((v.usd / totalUsd) * 1000) / 10 : 0,
        avgPriceKg: v.kg > 0 ? Math.round((v.usd / v.kg) * 1000) / 1000 : 0,
      }))

    // ── Top movers (YoY, suppliers + buyers) ──────────────────────────────────
    const entitiesCurrentUsd: Record<string, number> = {}
    const entitiesPrevUsd: Record<string, number> = {}
    for (const r of currentYearRows) {
      entitiesCurrentUsd[r.supplier] = (entitiesCurrentUsd[r.supplier] || 0) + r.usd
    }
    for (const r of prevComparableRows) {
      entitiesPrevUsd[r.supplier] = (entitiesPrevUsd[r.supplier] || 0) + r.usd
    }
    const allMovers = Object.entries(entitiesCurrentUsd)
      .filter((e) => entitiesPrevUsd[e[0]])
      .map(([name, curVal]) => ({
        name,
        type: 'supplier' as const,
        currentUsd: curVal,
        prevUsd: entitiesPrevUsd[name] || 0,
        change: entitiesPrevUsd[name] > 0
          ? ((curVal - entitiesPrevUsd[name]) / entitiesPrevUsd[name]) * 100
          : 0,
        usdDelta: curVal - (entitiesPrevUsd[name] || 0),
      }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))

    const topMovers = allMovers.slice(0, 10)
    const gainers = allMovers.filter((m) => m.change > 0).slice(0, 8)
      .map(({ name, currentUsd, change, usdDelta }) => ({ name, currentUsd, change, usdDelta }))
    const losers = allMovers.filter((m) => m.change < 0).slice(0, 8)
      .map(({ name, currentUsd, change, usdDelta }) => ({ name, currentUsd, change, usdDelta }))

    // ── Rolling metrics with period-over-period comparison ────────────────────
    const todayMs = Date.now()
    const rollingMetrics = ([30, 90, 180] as const).map((days) => {
      const cutMs = todayMs - days * 86400000
      const prevCutMs = cutMs - days * 86400000
      const periodRows = filtered.filter((r) => new Date(r.Date).getTime() >= cutMs)
      const prevPeriodRows = filtered.filter((r) => {
        const t = new Date(r.Date).getTime()
        return t >= prevCutMs && t < cutMs
      })
      const tons = periodRows.reduce((a, r) => a + r.tons, 0)
      const usd = periodRows.reduce((a, r) => a + r.usd, 0)
      const shipments = periodRows.length
      const prevTonsVal = prevPeriodRows.reduce((a, r) => a + r.tons, 0)
      const prevUsdVal = prevPeriodRows.reduce((a, r) => a + r.usd, 0)
      const prevShipmentsVal = prevPeriodRows.length
      return {
        period: `${days}d` as '30d' | '90d' | '180d',
        tons: Math.round(tons * 100) / 100,
        usd: Math.round(usd),
        shipments,
        prevTons: Math.round(prevTonsVal * 100) / 100,
        prevUsd: Math.round(prevUsdVal),
        prevShipments: prevShipmentsVal,
        changeTons: prevTonsVal > 0 ? Math.round(((tons - prevTonsVal) / prevTonsVal) * 1000) / 10 : 0,
        changeUsd: prevUsdVal > 0 ? Math.round(((usd - prevUsdVal) / prevUsdVal) * 1000) / 10 : 0,
        changeShipments: prevShipmentsVal > 0 ? Math.round(((shipments - prevShipmentsVal) / prevShipmentsVal) * 1000) / 10 : 0,
      }
    })

    // ── Market health ─────────────────────────────────────────────────────────
    const suppShares = Object.values(supplierMap)
      .map((v) => (totalUsd > 0 ? (v.usd / totalUsd) * 100 : 0))
      .sort((a, b) => b - a)
    const hhi = suppShares.reduce((acc, s) => acc + s ** 2, 0)
    const cr4 = suppShares.slice(0, 4).reduce((a, b) => a + b, 0)

    const buyerShares = Object.values(buyerMap)
      .map((v) => (totalUsd > 0 ? (v.usd / totalUsd) * 100 : 0))
      .sort((a, b) => b - a)
    const buyerCr4 = buyerShares.slice(0, 4).reduce((a, b) => a + b, 0)

    // Price volatility: std dev of monthly avg price as % of mean
    const monthlyPrices = Object.values(monthlyMap)
      .filter((m) => m.usd > 0 && m.tons > 0)
      .map((m) => m.usd / m.tons)
    const priceMean = monthlyPrices.length
      ? monthlyPrices.reduce((a, b) => a + b, 0) / monthlyPrices.length
      : 1
    const priceStd = monthlyPrices.length > 1
      ? Math.sqrt(monthlyPrices.reduce((acc, p) => acc + (p - priceMean) ** 2, 0) / monthlyPrices.length)
      : 0
    const priceVolatilityPct = priceMean > 0 ? (priceStd / priceMean) * 100 : 0

    // New entrant rate
    const prevQSuppliers = new Set(
      filtered.filter((r) => {
        const cutMs2 = todayMs - 6 * 30 * 86400000
        const startMs = todayMs - 3 * 30 * 86400000
        const t = new Date(r.Date).getTime()
        return t >= cutMs2 && t < startMs
      }).map((r) => r.supplier),
    )
    const currentQSuppliers = new Set(
      filtered
        .filter((r) => new Date(r.Date).getTime() >= todayMs - 3 * 30 * 86400000)
        .map((r) => r.supplier),
    )
    const newEntrants = [...currentQSuppliers].filter((s) => !prevQSuppliers.has(s))
    const newEntrantRate = currentQSuppliers.size > 0
      ? (newEntrants.length / currentQSuppliers.size) * 100 : 0

    const marketHealth: KpiData['marketHealth'] = {
      hhi: Math.round(hhi),
      cr4: Math.round(cr4 * 10) / 10,
      buyerCr4: Math.round(buyerCr4 * 10) / 10,
      newEntrantRate: Math.round(newEntrantRate * 10) / 10,
      newEntrantCount: newEntrants.length,
      priceVolatilityPct: Math.round(priceVolatilityPct * 10) / 10,
      score: hhi < 1500 ? 'Healthy' : hhi < 2500 ? 'Moderate' : 'Concentrated',
    }

    const result: KpiData = {
      totalShipments: filtered.length,
      totalTons: Math.round(totalTons * 100) / 100,
      totalUsd: Math.round(totalUsd),
      uniqueSuppliers: Object.keys(supplierMap).length,
      uniqueBuyers: Object.keys(buyerMap).length,
      avgShipmentTons: filtered.length > 0 ? Math.round((totalTons / filtered.length) * 100) / 100 : 0,
      avgShipmentUsd: filtered.length > 0 ? Math.round(totalUsd / filtered.length) : 0,
      avgPricePerKg: Math.round(avgPricePerKg * 1000) / 1000,
      penfoldSharePct: Math.round(penfoldSharePct * 10) / 10,
      dataDateRange,
      yoyGrowthUsd: yoyUsd !== null ? Math.round(yoyUsd * 10) / 10 : null,
      yoyGrowthTons: yoyTons !== null ? Math.round(yoyTons * 10) / 10 : null,
      topSuppliers,
      topBuyers,
      quarterlyTrend,
      monthlyTrend,
      priceByMineralQuarter,
      mineralBreakdown,
      topMovers,
      gainers,
      losers,
      rollingMetrics,
      marketHealth,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/data/kpis]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
