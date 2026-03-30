import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters } from '@/lib/db'
import type { ForensicResult, SuspectInvestigation } from '@/types/data'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const mineral = params.get('mineral') ?? ''
    const targetVol = Number(params.get('targetVol') ?? 0)
    const tolerance = Number(params.get('tolerance') ?? 20) / 100
    const suspect = params.get('suspect')
    const metric = (params.get('metric') ?? 'tons') as 'tons' | 'kg'

    const all = await getData()
    const filters = parseFilters(params)
    const filtered = applyFilters(all, filters)

    const mineralRows = mineral ? filtered.filter((r) => r.mineral === mineral) : filtered

    if (suspect) {
      // ── Detailed investigation of one suspect ──────────────────────────
      const subRows = mineralRows.filter((r) => r.buyer === suspect)

      const supplierMap: Record<string, {
        firstPurchase: string; lastPurchase: string
        totalQty: number; shipmentCount: number
      }> = {}
      for (const r of subRows) {
        if (!supplierMap[r.supplier]) {
          supplierMap[r.supplier] = {
            firstPurchase: r.Date, lastPurchase: r.Date,
            totalQty: 0, shipmentCount: 0,
          }
        }
        supplierMap[r.supplier].totalQty += r[metric]
        supplierMap[r.supplier].shipmentCount++
        if (r.Date < supplierMap[r.supplier].firstPurchase) supplierMap[r.supplier].firstPurchase = r.Date
        if (r.Date > supplierMap[r.supplier].lastPurchase) supplierMap[r.supplier].lastPurchase = r.Date
      }

      const totalVolume = Object.values(supplierMap).reduce((a, v) => a + v.totalQty, 0)
      const supplierBreakdown = Object.entries(supplierMap)
        .sort((a, b) => b[1].totalQty - a[1].totalQty)
        .map(([supplier, v]) => ({
          supplier,
          ...v,
          avgShipmentSize: v.shipmentCount > 0 ? v.totalQty / v.shipmentCount : 0,
          shareOfWallet: totalVolume > 0 ? (v.totalQty / totalVolume) * 100 : 0,
        }))

      // Monthly timeline by supplier
      const timelineMap: Record<string, Record<string, number>> = {}
      for (const r of subRows) {
        const m = r.Date.slice(0, 7)
        if (!timelineMap[m]) timelineMap[m] = {}
        timelineMap[m][r.supplier] = (timelineMap[m][r.supplier] || 0) + r[metric]
      }
      const monthlyTimeline = Object.entries(timelineMap).flatMap(([date, supps]) =>
        Object.entries(supps).map(([supplier, qty]) => ({ date, supplier, qty })),
      ).sort((a, b) => a.date.localeCompare(b.date))

      const investigation: SuspectInvestigation = {
        buyer: suspect,
        totalVolume,
        uniqueSuppliers: supplierBreakdown.length,
        supplierBreakdown,
        monthlyTimeline,
        rawTransactions: subRows
          .sort((a, b) => b.Date.localeCompare(a.Date))
          .slice(0, 500)
          .map((r) => ({
            date: r.Date,
            supplier: r.supplier,
            kg: r.kg,
            tons: r.tons,
            usd: r.usd,
            aduana: r.aduana ?? '',
          })),
      }
      return NextResponse.json(investigation)
    }

    // ── Forensic filter: find suspects by volume pattern ──────────────────
    const monthlyBuyer: Record<string, Record<string, number>> = {}
    for (const r of mineralRows) {
      const m = r.Date.slice(0, 7)
      if (!monthlyBuyer[r.buyer]) monthlyBuyer[r.buyer] = {}
      monthlyBuyer[r.buyer][m] = (monthlyBuyer[r.buyer][m] || 0) + r[metric]
    }

    const buyerStats = Object.entries(monthlyBuyer).map(([buyer, months]) => {
      const activeMonths = Object.values(months).filter((v) => v > 0)
      const avg = activeMonths.length > 0
        ? activeMonths.reduce((a, b) => a + b, 0) / activeMonths.length
        : 0
      const max = Math.max(...activeMonths, 0)
      const allMonths = Object.keys(months).sort()
      return {
        buyer,
        avgMonthlyVol: avg,
        maxMonthlyVol: max,
        activeMonths: activeMonths.length,
        firstSeen: allMonths[0] ?? '',
        lastSeen: allMonths[allMonths.length - 1] ?? '',
      }
    })

    const min = targetVol * (1 - tolerance)
    const max = targetVol * (1 + tolerance)
    const splitMin = (targetVol / 2) * (1 - tolerance)
    const splitMax = (targetVol / 2) * (1 + tolerance)

    const directSuspects = buyerStats
      .filter((s) => s.avgMonthlyVol >= min && s.avgMonthlyVol <= max)
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))

    const splitSuspects = buyerStats
      .filter((s) => s.avgMonthlyVol >= splitMin && s.avgMonthlyVol <= splitMax)
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))

    // ── NEW: Volume/price anomaly detection ───────────────────────────────
    const anomalies: ForensicResult['anomalies'] = []
    for (const [buyer, months] of Object.entries(monthlyBuyer)) {
      const values = Object.entries(months).sort(([a], [b]) => a.localeCompare(b))
      if (values.length < 4) continue
      const vals = values.map(([, v]) => v)
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      const std = Math.sqrt(vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / vals.length)
      if (std === 0) continue
      for (const [date, val] of values) {
        const z = (val - mean) / std
        if (Math.abs(z) > 2.5) {
          anomalies.push({
            buyer,
            type: 'volume_spike',
            date,
            value: val,
            zscore: Math.round(z * 100) / 100,
          })
        }
      }
    }

    const result: ForensicResult = { directSuspects, splitSuspects, anomalies: anomalies.slice(0, 50) }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/data/forensic]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
