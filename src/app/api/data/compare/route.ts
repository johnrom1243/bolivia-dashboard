/**
 * /api/data/compare?buyerA=NAME&buyerB=NAME&...filters
 * Side-by-side comparison of two buyers.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const buyerA = params.get('buyerA') ?? ''
    const buyerB = params.get('buyerB') ?? ''

    const all = await getData()
    const filters = parseFilters(params)
    const filtered = applyFilters(all, filters)

    const refMs = Math.max(...all.map((r) => new Date(r.Date).getTime()))

    function profileBuyer(name: string) {
      const rows = filtered.filter((r) => r.buyer === name)
      if (!rows.length) return null

      const totalUsd = rows.reduce((a, r) => a + r.usd, 0)
      const totalTons = rows.reduce((a, r) => a + r.tons, 0)
      const allTotalUsd = all.reduce((a, r) => a + r.usd, 0)

      // Quarterly volumes
      const qMap: Record<string, { usd: number; tons: number }> = {}
      for (const r of rows) {
        if (!qMap[r.Quarter]) qMap[r.Quarter] = { usd: 0, tons: 0 }
        qMap[r.Quarter].usd += r.usd
        qMap[r.Quarter].tons += r.tons
      }
      const quarterlyVolume = Object.entries(qMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([quarter, v]) => ({ quarter, ...v }))

      // Supplier overlap info
      const supplierMap: Record<string, { usd: number; tons: number }> = {}
      for (const r of rows) {
        if (!supplierMap[r.supplier]) supplierMap[r.supplier] = { usd: 0, tons: 0 }
        supplierMap[r.supplier].usd += r.usd
        supplierMap[r.supplier].tons += r.tons
      }
      const suppliers = Object.entries(supplierMap)
        .sort((a, b) => b[1].usd - a[1].usd)
        .map(([supplier, v]) => ({
          supplier,
          usd: v.usd,
          tons: v.tons,
          share: totalUsd > 0 ? (v.usd / totalUsd) * 100 : 0,
        }))

      // Mineral breakdown
      const mineralMap: Record<string, { usd: number; tons: number }> = {}
      for (const r of rows) {
        if (!mineralMap[r.mineral]) mineralMap[r.mineral] = { usd: 0, tons: 0 }
        mineralMap[r.mineral].usd += r.usd
        mineralMap[r.mineral].tons += r.tons
      }
      const minerals = Object.entries(mineralMap)
        .sort((a, b) => b[1].usd - a[1].usd)
        .map(([mineral, v]) => ({
          mineral,
          usd: v.usd,
          tons: v.tons,
          share: totalUsd > 0 ? (v.usd / totalUsd) * 100 : 0,
        }))

      // Pricing by mineral
      const priceMap: Record<string, { sum: number; n: number }> = {}
      const marketPriceMap: Record<string, { sum: number; n: number }> = {}
      for (const r of rows) {
        if (r.usd_per_kg > 0) {
          if (!priceMap[r.mineral]) priceMap[r.mineral] = { sum: 0, n: 0 }
          priceMap[r.mineral].sum += r.usd_per_kg
          priceMap[r.mineral].n++
        }
      }
      for (const r of all) {
        if (r.usd_per_kg > 0) {
          if (!marketPriceMap[r.mineral]) marketPriceMap[r.mineral] = { sum: 0, n: 0 }
          marketPriceMap[r.mineral].sum += r.usd_per_kg
          marketPriceMap[r.mineral].n++
        }
      }
      const pricingByMineral = Object.entries(priceMap).map(([mineral, v]) => ({
        mineral,
        avgPrice: v.n > 0 ? v.sum / v.n : 0,
        marketAvg: marketPriceMap[mineral]?.n > 0 ? marketPriceMap[mineral].sum / marketPriceMap[mineral].n : 0,
      }))

      const firstShipment = rows.map((r) => r.Date).sort()[0]
      const lastShipment = rows.map((r) => r.Date).sort().at(-1)!
      const daysSinceLast = (refMs - new Date(lastShipment).getTime()) / 86400000

      return {
        name,
        totalUsd,
        totalTons,
        totalShipments: rows.length,
        uniqueSuppliers: suppliers.length,
        marketSharePct: allTotalUsd > 0 ? (totalUsd / allTotalUsd) * 100 : 0,
        avgShipmentUsd: totalUsd / rows.length,
        avgShipmentTons: totalTons / rows.length,
        firstShipment,
        lastShipment,
        daysSinceLast: Math.round(daysSinceLast),
        quarterlyVolume,
        suppliers,
        minerals,
        pricingByMineral,
      }
    }

    const a = buyerA ? profileBuyer(buyerA) : null
    const b = buyerB ? profileBuyer(buyerB) : null

    // Supplier overlap
    const suppliersA = new Set(a?.suppliers.map((s) => s.supplier) ?? [])
    const suppliersB = new Set(b?.suppliers.map((s) => s.supplier) ?? [])
    const sharedSuppliers = [...suppliersA].filter((s) => suppliersB.has(s))

    // All quarters union
    const allQuarters = [...new Set([
      ...(a?.quarterlyVolume.map((q) => q.quarter) ?? []),
      ...(b?.quarterlyVolume.map((q) => q.quarter) ?? []),
    ])].sort()

    const quarterlyComparison = allQuarters.map((quarter) => ({
      quarter,
      usdA: a?.quarterlyVolume.find((q) => q.quarter === quarter)?.usd ?? 0,
      usdB: b?.quarterlyVolume.find((q) => q.quarter === quarter)?.usd ?? 0,
      tonsA: a?.quarterlyVolume.find((q) => q.quarter === quarter)?.tons ?? 0,
      tonsB: b?.quarterlyVolume.find((q) => q.quarter === quarter)?.tons ?? 0,
    }))

    return NextResponse.json({ a, b, sharedSuppliers, quarterlyComparison })
  } catch (err) {
    console.error('[/api/data/compare]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
