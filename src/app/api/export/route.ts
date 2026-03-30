/**
 * /api/export?type=...&...filters
 * Returns an Excel workbook for any dataset.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters } from '@/lib/db'
import { calculateLoyaltyIndex } from '@/lib/analytics/loyalty'
import { calculatePoachIndex } from '@/lib/analytics/poach'
import { runPredatorModel } from '@/lib/analytics/predator'
import {
  buildWorkbook,
  buildSingleSheet,
  poachSheet,
  loyaltySheet,
  predatorSheet,
  rawDataSheet,
} from '@/lib/export'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const type = params.get('type') ?? 'raw'
    const mineral = params.get('mineral') ?? 'ZINC'

    const all = await getData()
    const filters = parseFilters(params)
    const filtered = applyFilters(all, filters)

    let buffer: Buffer
    let filename = 'bolivia_export.xlsx'

    if (type === 'raw') {
      buffer = await buildSingleSheet(rawDataSheet(filtered as unknown as Record<string, unknown>[]))
      filename = 'bolivia_raw_data.xlsx'

    } else if (type === 'loyalty') {
      const data = calculateLoyaltyIndex(filtered)
      buffer = await buildSingleSheet(loyaltySheet(data as unknown as Record<string, unknown>[]))
      filename = 'supplier_loyalty_analysis.xlsx'

    } else if (type === 'poach') {
      const data = calculatePoachIndex(filtered)
      buffer = await buildSingleSheet(poachSheet(data as unknown as Record<string, unknown>[]))
      filename = 'poach_index_rankings.xlsx'

    } else if (type === 'predator') {
      const data = runPredatorModel(filtered, mineral)
      buffer = await buildSingleSheet(predatorSheet(data as unknown as Record<string, unknown>[]))
      filename = `predator_targets_${mineral}.xlsx`

    } else if (type === 'kpis') {
      // Build KPI summary sheet
      const totalTons = filtered.reduce((a, r) => a + r.tons, 0)
      const totalUsd = filtered.reduce((a, r) => a + r.usd, 0)
      const kpiRows = [
        { metric: 'Total Shipments', value: filtered.length },
        { metric: 'Total Tons', value: totalTons },
        { metric: 'Total USD', value: totalUsd },
        { metric: 'Unique Suppliers', value: new Set(filtered.map((r) => r.supplier)).size },
        { metric: 'Unique Buyers', value: new Set(filtered.map((r) => r.buyer)).size },
        { metric: 'Avg Shipment Tons', value: filtered.length > 0 ? totalTons / filtered.length : 0 },
      ]
      buffer = await buildSingleSheet({
        name: 'KPI Summary',
        title: 'Bolivia Market KPI Summary',
        columns: [
          { header: 'Metric', key: 'metric', width: 30 },
          { header: 'Value', key: 'value', width: 20 },
        ],
        rows: kpiRows,
      })
      filename = 'bolivia_kpis.xlsx'

    } else if (type === 'supplier-intel') {
      // Full supplier × mineral breakdown for a specific buyer — the "boss report"
      const buyerName = params.get('buyer') ?? ''
      const sub = buyerName ? filtered.filter((r) => r.buyer === buyerName) : filtered
      const todayMs = Date.now()

      // Group by supplier × mineral
      const smMap: Record<string, Record<string, {
        usd: number; tons: number; kg: number; count: number
        firstDate: string; lastDate: string
      }>> = {}
      for (const r of sub) {
        if (!smMap[r.supplier]) smMap[r.supplier] = {}
        if (!smMap[r.supplier][r.mineral]) {
          smMap[r.supplier][r.mineral] = { usd: 0, tons: 0, kg: 0, count: 0, firstDate: r.Date, lastDate: r.Date }
        }
        const m = smMap[r.supplier][r.mineral]
        m.usd += r.usd; m.tons += r.tons; m.kg += r.kg; m.count++
        if (r.Date < m.firstDate) m.firstDate = r.Date
        if (r.Date > m.lastDate) m.lastDate = r.Date
      }

      // Flat rows: one per supplier × mineral
      const intelRows = Object.entries(smMap)
        .flatMap(([supplier, minerals]) =>
          Object.entries(minerals).map(([mineral, v]) => ({
            supplier,
            mineral,
            totalUsd: Math.round(v.usd),
            totalTons: Math.round(v.tons * 100) / 100,
            totalKg: Math.round(v.kg),
            shipmentCount: v.count,
            avgTonsPerShipment: Math.round((v.tons / v.count) * 100) / 100,
            avgUsdPerKg: v.kg > 0 ? Math.round((v.usd / v.kg) * 1000) / 1000 : 0,
            firstDelivery: v.firstDate,
            lastDelivery: v.lastDate,
            daysSinceLast: Math.round((todayMs - new Date(v.lastDate).getTime()) / 86400000),
          })),
        )
        .sort((a, b) => b.lastDelivery.localeCompare(a.lastDelivery))

      buffer = await buildSingleSheet({
        name: 'Supplier Intelligence',
        title: `Supplier Intelligence — ${buyerName || 'All Buyers'}`,
        columns: [
          { header: 'Supplier', key: 'supplier', width: 32 },
          { header: 'Mineral', key: 'mineral', width: 18 },
          { header: 'Total USD', key: 'totalUsd', width: 16 },
          { header: 'Total Tons', key: 'totalTons', width: 14 },
          { header: 'Total KG', key: 'totalKg', width: 14 },
          { header: 'Shipments', key: 'shipmentCount', width: 12 },
          { header: 'Avg Tons/Ship', key: 'avgTonsPerShipment', width: 16 },
          { header: 'Avg USD/KG', key: 'avgUsdPerKg', width: 14 },
          { header: 'First Delivery', key: 'firstDelivery', width: 16 },
          { header: 'Last Delivery', key: 'lastDelivery', width: 16 },
          { header: 'Days Since Last', key: 'daysSinceLast', width: 16 },
        ],
        rows: intelRows as unknown as Record<string, unknown>[],
      })
      filename = `supplier_intelligence_${buyerName || 'all'}.xlsx`

    } else if (type === 'mineral') {
      const mineralName = params.get('mineral') ?? ''
      const sub = mineralName ? filtered.filter((r) => r.mineral === mineralName) : filtered
      const todayMs = Date.now()
      const supplierMap: Record<string, { tons: number; usd: number; count: number; firstSeen: string; lastSeen: string; latestBuyer: string }> = {}
      for (const r of sub) {
        if (!supplierMap[r.supplier]) supplierMap[r.supplier] = { tons: 0, usd: 0, count: 0, firstSeen: r.Date, lastSeen: r.Date, latestBuyer: r.buyer }
        supplierMap[r.supplier].tons += r.tons
        supplierMap[r.supplier].usd += r.usd
        supplierMap[r.supplier].count++
        if (r.Date > supplierMap[r.supplier].lastSeen) { supplierMap[r.supplier].lastSeen = r.Date; supplierMap[r.supplier].latestBuyer = r.buyer }
        if (r.Date < supplierMap[r.supplier].firstSeen) supplierMap[r.supplier].firstSeen = r.Date
      }
      const rows = Object.entries(supplierMap).map(([supplier, v]) => ({
        supplier,
        latestBuyer: v.latestBuyer,
        daysInactive: Math.round((todayMs - new Date(v.lastSeen).getTime()) / 86400000),
        totalTons: v.tons,
        totalUsd: v.usd,
        shipmentCount: v.count,
        firstSeen: v.firstSeen,
        lastSeen: v.lastSeen,
      })).sort((a, b) => a.daysInactive - b.daysInactive)
      buffer = await buildSingleSheet({
        name: 'Mineral Hit List',
        title: `Mineral Hit List — ${mineralName || 'All'}`,
        columns: [
          { header: 'Supplier', key: 'supplier', width: 30 },
          { header: 'Latest Buyer', key: 'latestBuyer', width: 30 },
          { header: 'Days Inactive', key: 'daysInactive', width: 14 },
          { header: 'Total Tons', key: 'totalTons', width: 14 },
          { header: 'Total USD', key: 'totalUsd', width: 16 },
          { header: 'Shipments', key: 'shipmentCount', width: 12 },
          { header: 'First Seen', key: 'firstSeen', width: 14 },
          { header: 'Last Seen', key: 'lastSeen', width: 14 },
        ],
        rows: rows as unknown as Record<string, unknown>[],
      })
      filename = `mineral_hit_list_${mineralName || 'all'}.xlsx`

    } else if (type === 'matrix') {
      const metricParam = (params.get('metric') ?? 'usd') as 'usd' | 'tons' | 'kg'
      const pairMap: Record<string, Record<string, number>> = {}
      const rowTotals: Record<string, number> = {}
      const colTotals: Record<string, number> = {}
      for (const r of filtered) {
        const val = r[metricParam]
        if (!pairMap[r.supplier]) pairMap[r.supplier] = {}
        pairMap[r.supplier][r.buyer] = (pairMap[r.supplier][r.buyer] || 0) + val
        rowTotals[r.supplier] = (rowTotals[r.supplier] || 0) + val
        colTotals[r.buyer] = (colTotals[r.buyer] || 0) + val
      }
      const suppliers = Object.keys(rowTotals).sort((a, b) => rowTotals[b] - rowTotals[a]).slice(0, 50)
      const buyers = Object.keys(colTotals).sort((a, b) => colTotals[b] - colTotals[a]).slice(0, 30)
      const matrixRows = suppliers.map((s) => {
        const row: Record<string, unknown> = { supplier: s, total: rowTotals[s] }
        for (const b of buyers) row[b] = pairMap[s]?.[b] ?? 0
        return row
      })
      buffer = await buildSingleSheet({
        name: 'Matrix',
        title: `Supplier × Buyer Matrix — ${metricParam.toUpperCase()}`,
        columns: [
          { header: 'Supplier', key: 'supplier', width: 30 },
          { header: 'Total', key: 'total', width: 16 },
          ...buyers.map((b) => ({ header: b, key: b, width: 14 })),
        ],
        rows: matrixRows,
      })
      filename = 'supplier_buyer_matrix.xlsx'

    } else if (type === 'new-suppliers') {
      const cutoffDate = params.get('cutoffDate') ?? ''
      const firstEverDate: Record<string, string> = {}
      for (const r of all) {
        if (!firstEverDate[r.supplier] || r.Date < firstEverDate[r.supplier]) firstEverDate[r.supplier] = r.Date
      }
      const newSupplierNames = Object.entries(firstEverDate)
        .filter(([, d]) => !cutoffDate || d >= cutoffDate)
        .map(([s]) => s)
      const todayMs2 = Date.now()
      const nsRows = newSupplierNames.flatMap((supplier) => {
        const rows2 = filtered.filter((r) => r.supplier === supplier)
        if (!rows2.length) return []
        const totalTons2 = rows2.reduce((a, r) => a + r.tons, 0)
        const totalUsd2 = rows2.reduce((a, r) => a + r.usd, 0)
        const dates2 = rows2.map((r) => r.Date).sort()
        const lastDate2 = dates2[dates2.length - 1]
        const survivalMonths2 = Math.round((new Date(lastDate2).getTime() - new Date(dates2[0]).getTime()) / (86400000 * 30))
        const daysSince2 = Math.round((todayMs2 - new Date(lastDate2).getTime()) / 86400000)
        const buyerMap2: Record<string, number> = {}
        for (const r of rows2) buyerMap2[r.buyer] = (buyerMap2[r.buyer] || 0) + r.tons
        const primaryBuyer2 = Object.entries(buyerMap2).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
        return [{
          supplier,
          firstShipmentDate: dates2[0],
          lastShipmentDate: lastDate2,
          totalTons: Math.round(totalTons2 * 100) / 100,
          totalUsd: Math.round(totalUsd2),
          shipmentCount: rows2.length,
          uniqueBuyers: Object.keys(buyerMap2).length,
          primaryBuyer: primaryBuyer2,
          survivalMonths: survivalMonths2,
          daysSinceLast: daysSince2,
          stillActive: daysSince2 <= 90 ? 'Yes' : 'No',
        }]
      }).sort((a, b) => b.firstShipmentDate.localeCompare(a.firstShipmentDate))
      buffer = await buildSingleSheet({
        name: 'New Suppliers',
        title: 'New Supplier Tracker',
        columns: [
          { header: 'Supplier', key: 'supplier', width: 30 },
          { header: 'First Shipment', key: 'firstShipmentDate', width: 16 },
          { header: 'Last Shipment', key: 'lastShipmentDate', width: 16 },
          { header: 'Total Tons', key: 'totalTons', width: 14 },
          { header: 'Total USD', key: 'totalUsd', width: 16 },
          { header: 'Shipments', key: 'shipmentCount', width: 12 },
          { header: 'Buyers', key: 'uniqueBuyers', width: 10 },
          { header: 'Primary Buyer', key: 'primaryBuyer', width: 30 },
          { header: 'Survival Months', key: 'survivalMonths', width: 16 },
          { header: 'Days Since Last', key: 'daysSinceLast', width: 16 },
          { header: 'Active', key: 'stillActive', width: 10 },
        ],
        rows: nsRows as unknown as Record<string, unknown>[],
      })
      filename = 'new_suppliers.xlsx'

    } else if (type === 'market') {
      const yearMap: Record<number, { tons: number; usd: number }> = {}
      for (const r of filtered) {
        if (!yearMap[r.year]) yearMap[r.year] = { tons: 0, usd: 0 }
        yearMap[r.year].tons += r.tons
        yearMap[r.year].usd += r.usd
      }
      const marketRows = Object.entries(yearMap).sort(([a], [b]) => Number(a) - Number(b)).map(([year, v]) => ({ year: Number(year), tons: v.tons, usd: v.usd }))
      buffer = await buildSingleSheet({
        name: 'Market Overview',
        title: 'Bolivia Market Evolution',
        columns: [
          { header: 'Year', key: 'year', width: 10 },
          { header: 'Total Tons', key: 'tons', width: 16 },
          { header: 'Total USD', key: 'usd', width: 16 },
        ],
        rows: marketRows as unknown as Record<string, unknown>[],
      })
      filename = 'market_evolution.xlsx'

    } else if (type === 'logistics') {
      const routeMap2: Record<string, { sum: number; n: number }> = {}
      for (const r of filtered) {
        const key = `${r.aduana || 'Unknown'}|||${r.mineral}`
        if (!routeMap2[key]) routeMap2[key] = { sum: 0, n: 0 }
        routeMap2[key].sum += r.tons
        routeMap2[key].n++
      }
      const logRows = Object.entries(routeMap2).map(([k, { sum, n }]) => {
        const [aduana, mineral] = k.split('|||')
        return { aduana, mineral, avgTons: Math.round((sum / n) * 100) / 100, shipmentCount: n, totalTons: Math.round(sum * 100) / 100 }
      }).sort((a, b) => b.shipmentCount - a.shipmentCount)
      buffer = await buildSingleSheet({
        name: 'Logistics',
        title: 'Logistics — Route Efficiency',
        columns: [
          { header: 'Customs Post', key: 'aduana', width: 24 },
          { header: 'Mineral', key: 'mineral', width: 18 },
          { header: 'Shipments', key: 'shipmentCount', width: 12 },
          { header: 'Avg Tons', key: 'avgTons', width: 14 },
          { header: 'Total Tons', key: 'totalTons', width: 14 },
        ],
        rows: logRows as unknown as Record<string, unknown>[],
      })
      filename = 'logistics.xlsx'

    } else {
      return NextResponse.json({ error: 'Unknown export type' }, { status: 400 })
    }

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err) {
    console.error('[/api/export]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
