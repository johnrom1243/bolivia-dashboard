import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters, percentile } from '@/lib/db'
import type { KpiData } from '@/types/data'

export async function GET(req: NextRequest) {
  try {
    const all = await getData()
    const filters = parseFilters(req.nextUrl.searchParams)
    const filtered = applyFilters(all, filters)
    const topN = filters.topN ?? 15

    if (!filtered.length) return NextResponse.json(null)

    // ── YoY calculation ───────────────────────────────────────────────────
    const years = [...new Set(filtered.map((r) => r.year))].sort()
    const currentYear = years[years.length - 1]
    const prevYear = currentYear - 1
    const currentYearRows = filtered.filter((r) => r.year === currentYear)
    const prevYearRows = all.filter((r) => r.year === prevYear)

    // If current year is incomplete, compare same months
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

    // ── Top suppliers / buyers ────────────────────────────────────────────
    const totalUsd = filtered.reduce((a, r) => a + r.usd, 0)
    const totalTons = filtered.reduce((a, r) => a + r.tons, 0)

    const supplierMap: Record<string, { usd: number; tons: number }> = {}
    const buyerMap: Record<string, { usd: number; tons: number }> = {}

    for (const r of filtered) {
      if (!supplierMap[r.supplier]) supplierMap[r.supplier] = { usd: 0, tons: 0 }
      supplierMap[r.supplier].usd += r.usd
      supplierMap[r.supplier].tons += r.tons
      if (!buyerMap[r.buyer]) buyerMap[r.buyer] = { usd: 0, tons: 0 }
      buyerMap[r.buyer].usd += r.usd
      buyerMap[r.buyer].tons += r.tons
    }

    const topSuppliers = Object.entries(supplierMap)
      .sort((a, b) => b[1].usd - a[1].usd)
      .slice(0, topN)
      .map(([name, v]) => ({ name, ...v, share: totalUsd > 0 ? (v.usd / totalUsd) * 100 : 0 }))

    const topBuyers = Object.entries(buyerMap)
      .sort((a, b) => b[1].usd - a[1].usd)
      .slice(0, topN)
      .map(([name, v]) => ({ name, ...v, share: totalUsd > 0 ? (v.usd / totalUsd) * 100 : 0 }))

    // ── Quarterly trend ────────────────────────────────────────────────────
    const quarterlyMap: Record<string, { usd: number; tons: number; shipments: number }> = {}
    for (const r of filtered) {
      if (!quarterlyMap[r.Quarter]) quarterlyMap[r.Quarter] = { usd: 0, tons: 0, shipments: 0 }
      quarterlyMap[r.Quarter].usd += r.usd
      quarterlyMap[r.Quarter].tons += r.tons
      quarterlyMap[r.Quarter].shipments++
    }
    const quarterlyTrend = Object.entries(quarterlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([quarter, v]) => ({ quarter, ...v }))

    // ── Top movers (vs previous year, same period) ────────────────────────
    const entitiesCurrentUsd: Record<string, number> = {}
    const entitiesPrevUsd: Record<string, number> = {}
    for (const r of currentYearRows) {
      entitiesCurrentUsd[r.supplier] = (entitiesCurrentUsd[r.supplier] || 0) + r.usd
    }
    for (const r of prevComparableRows) {
      entitiesPrevUsd[r.supplier] = (entitiesPrevUsd[r.supplier] || 0) + r.usd
    }
    const topMovers = Object.entries(entitiesCurrentUsd)
      .filter((e) => entitiesPrevUsd[e[0]])
      .map(([name, curVal]) => ({
        name,
        type: 'supplier' as const,
        currentUsd: curVal,
        prevUsd: entitiesPrevUsd[name] || 0,
        change: entitiesPrevUsd[name] > 0
          ? ((curVal - entitiesPrevUsd[name]) / entitiesPrevUsd[name]) * 100
          : 0,
      }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 10)

    // ── Rolling metrics ────────────────────────────────────────────────────
    const todayMs = Date.now()
    const rollingMetrics = ([30, 90, 180] as const).map((days) => {
      const cutMs = todayMs - days * 86400000
      const periodRows = filtered.filter((r) => new Date(r.Date).getTime() >= cutMs)
      return {
        period: `${days}d` as '30d' | '90d' | '180d',
        tons: periodRows.reduce((a, r) => a + r.tons, 0),
        usd: periodRows.reduce((a, r) => a + r.usd, 0),
        shipments: periodRows.length,
      }
    })

    // ── Market health (HHI, CR4) ──────────────────────────────────────────
    const suppShares = Object.values(supplierMap)
      .map((v) => (totalUsd > 0 ? (v.usd / totalUsd) * 100 : 0))
      .sort((a, b) => b - a)
    const hhi = suppShares.reduce((acc, s) => acc + s ** 2, 0)
    const cr4 = suppShares.slice(0, 4).reduce((a, b) => a + b, 0)

    // New entrant rate: suppliers that didn't exist in prev quarter
    const prevQuarterRows = filtered.filter((r) => {
      const d = new Date(r.Date)
      d.setMonth(d.getMonth() - 3)
      return new Date(r.Date).getTime() >= new Date(d).getTime()
    })
    const prevQuarterSuppliers = new Set(
      filtered
        .filter((r) => {
          const cutMs = todayMs - 6 * 30 * 86400000
          const startMs = todayMs - 3 * 30 * 86400000
          const t = new Date(r.Date).getTime()
          return t >= cutMs && t < startMs
        })
        .map((r) => r.supplier),
    )
    const currentQuarterSuppliers = new Set(
      filtered
        .filter((r) => new Date(r.Date).getTime() >= todayMs - 3 * 30 * 86400000)
        .map((r) => r.supplier),
    )
    const newEntrants = [...currentQuarterSuppliers].filter((s) => !prevQuarterSuppliers.has(s))
    const newEntrantRate =
      currentQuarterSuppliers.size > 0
        ? (newEntrants.length / currentQuarterSuppliers.size) * 100
        : 0

    const marketHealth: KpiData['marketHealth'] = {
      hhi: Math.round(hhi),
      cr4: Math.round(cr4 * 10) / 10,
      newEntrantRate: Math.round(newEntrantRate * 10) / 10,
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
      yoyGrowthUsd: yoyUsd !== null ? Math.round(yoyUsd * 10) / 10 : null,
      yoyGrowthTons: yoyTons !== null ? Math.round(yoyTons * 10) / 10 : null,
      topSuppliers,
      topBuyers,
      quarterlyTrend,
      topMovers,
      rollingMetrics,
      marketHealth,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/data/kpis]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
