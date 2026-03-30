import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters } from '@/lib/db'
import type { NewSupplierRow } from '@/types/data'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const cutoffDate = params.get('cutoffDate') ?? ''

    const all = await getData()
    const filters = parseFilters(params)
    const filtered = applyFilters(all, filters)

    // First-ever shipment date for each supplier in the FULL dataset
    const firstEverDate: Record<string, string> = {}
    for (const r of all) {
      if (!firstEverDate[r.supplier] || r.Date < firstEverDate[r.supplier]) {
        firstEverDate[r.supplier] = r.Date
      }
    }

    // Find suppliers whose first-ever shipment is on or after the cutoff
    const newSuppliers = Object.entries(firstEverDate)
      .filter(([, date]) => !cutoffDate || date >= cutoffDate)
      .map(([supplier, firstDate]) => supplier)

    const todayMs = Date.now()
    const results: NewSupplierRow[] = []

    for (const supplier of newSuppliers) {
      const rows = filtered.filter((r) => r.supplier === supplier)
      if (!rows.length) continue

      const totalTons = rows.reduce((a, r) => a + r.tons, 0)
      const totalUsd = rows.reduce((a, r) => a + r.usd, 0)
      const dates = rows.map((r) => r.Date).sort()
      const firstShipmentDate = dates[0]
      const lastShipmentDate = dates[dates.length - 1]
      const survivalMonths = Math.round(
        (new Date(lastShipmentDate).getTime() - new Date(firstShipmentDate).getTime()) /
        (86400000 * 30),
      )
      const daysSinceLastShipment = (todayMs - new Date(lastShipmentDate).getTime()) / 86400000
      const stillActive = daysSinceLastShipment <= 90

      // Growth velocity: slope of monthly volume
      const monthlyVol: Record<string, number> = {}
      for (const r of rows) {
        const m = r.Date.slice(0, 7)
        monthlyVol[m] = (monthlyVol[m] || 0) + r.tons
      }
      const months = Object.entries(monthlyVol).sort(([a], [b]) => a.localeCompare(b))
      let growthVelocity = 0
      if (months.length >= 2) {
        const xs = months.map((_, i) => i)
        const ys = months.map(([, v]) => v)
        const n = xs.length
        const sumX = xs.reduce((a, b) => a + b, 0)
        const sumY = ys.reduce((a, b) => a + b, 0)
        const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0)
        const sumX2 = xs.reduce((acc, x) => acc + x * x, 0)
        const denom = n * sumX2 - sumX * sumX
        growthVelocity = denom !== 0 ? ((n * sumXY - sumX * sumY) / denom) : 0
      }

      // Primary buyer & mineral
      const buyerMap: Record<string, number> = {}
      const mineralMap: Record<string, number> = {}
      for (const r of rows) {
        buyerMap[r.buyer] = (buyerMap[r.buyer] || 0) + r.tons
        mineralMap[r.mineral] = (mineralMap[r.mineral] || 0) + r.tons
      }
      const primaryBuyer = Object.entries(buyerMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
      const primaryMineral = Object.entries(mineralMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

      // Aduana entry
      const aduanaMap: Record<string, number> = {}
      for (const r of rows) if (r.aduana) aduanaMap[r.aduana] = (aduanaMap[r.aduana] || 0) + 1
      const aduanaEntry = Object.entries(aduanaMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

      results.push({
        supplier,
        firstShipmentDate,
        totalTons: Math.round(totalTons * 100) / 100,
        totalUsd: Math.round(totalUsd),
        shipmentCount: rows.length,
        uniqueBuyers: Object.keys(buyerMap).length,
        primaryBuyer,
        primaryMineral,
        growthVelocity: Math.round(growthVelocity * 100) / 100,
        survivalMonths,
        stillActive,
        aduanaEntry,
      })
    }

    results.sort((a, b) => b.firstShipmentDate.localeCompare(a.firstShipmentDate))
    return NextResponse.json(results)
  } catch (err) {
    console.error('[/api/data/new-suppliers]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
