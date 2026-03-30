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

    } else if (type === 'supplier') {
      const supplierName = params.get('supplier') ?? ''
      if (!supplierName) {
        return NextResponse.json({ error: 'supplier param required' }, { status: 400 })
      }
      const sub = filtered.filter((r) => r.supplier === supplierName)
      if (!sub.length) {
        return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
      }
      const todayMsS = Date.now()

      // KPI totals
      const sTotalUsd = sub.reduce((a, r) => a + r.usd, 0)
      const sTotalTons = sub.reduce((a, r) => a + r.tons, 0)
      const sTotalKg = sub.reduce((a, r) => a + r.kg, 0)
      const sDates = sub.map((r) => r.Date).sort()
      const sFirstShipment = sDates[0]
      const sLastShipment = sDates[sDates.length - 1]
      const sDaysSinceLast = Math.round((todayMsS - new Date(sLastShipment).getTime()) / 86400000)

      // Health score
      const sRecentTons = sub.filter((r) => new Date(r.Date).getTime() >= todayMsS - 90 * 86400000).reduce((a, r) => a + r.tons, 0)
      const sPrevTons = sub.filter((r) => {
        const t = new Date(r.Date).getTime()
        return t >= todayMsS - 180 * 86400000 && t < todayMsS - 90 * 86400000
      }).reduce((a, r) => a + r.tons, 0)
      const sMomentum = sPrevTons > 0 ? ((sRecentTons - sPrevTons) / sPrevTons) * 100 : 0
      const sRecencyScore = Math.max(0, 100 - sDaysSinceLast / 3)
      const sBuyerSet = new Set(sub.map((r) => r.buyer))
      const sDiversityScore = Math.min(100, sBuyerSet.size * 20)
      const sVolumeScore = Math.min(100, Math.log1p(sTotalTons) * 10)
      const sHealthScore = Math.min(100, Math.max(0, Math.round(sRecencyScore * 0.4 + sDiversityScore * 0.3 + sVolumeScore * 0.3)))

      // Sheet 1: Summary
      const summaryRows = [
        { metric: 'Supplier', value: supplierName },
        { metric: 'Total USD', value: Math.round(sTotalUsd) },
        { metric: 'Total Tons', value: Math.round(sTotalTons * 100) / 100 },
        { metric: 'Total KG', value: Math.round(sTotalKg) },
        { metric: 'Total Shipments', value: sub.length },
        { metric: 'Unique Buyers', value: sBuyerSet.size },
        { metric: 'First Shipment', value: sFirstShipment },
        { metric: 'Last Shipment', value: sLastShipment },
        { metric: 'Days Since Last', value: sDaysSinceLast },
        { metric: 'Health Score', value: sHealthScore },
        { metric: '90d Momentum %', value: Math.round(sMomentum * 10) / 10 },
      ]
      const sheet1: import('@/lib/export').SheetDef = {
        name: 'Summary',
        title: `Supplier Profile — ${supplierName}`,
        columns: [
          { header: 'Metric', key: 'metric', width: 28 },
          { header: 'Value', key: 'value', width: 24 },
        ],
        rows: summaryRows as Record<string, unknown>[],
      }

      // Buyer map
      const sBuyerMap: Record<string, {
        tons: number; usd: number; kg: number; count: number; firstDate: string; lastDate: string
      }> = {}
      for (const r of sub) {
        if (!sBuyerMap[r.buyer]) sBuyerMap[r.buyer] = { tons: 0, usd: 0, kg: 0, count: 0, firstDate: r.Date, lastDate: r.Date }
        sBuyerMap[r.buyer].tons += r.tons; sBuyerMap[r.buyer].usd += r.usd; sBuyerMap[r.buyer].kg += r.kg; sBuyerMap[r.buyer].count++
        if (r.Date < sBuyerMap[r.buyer].firstDate) sBuyerMap[r.buyer].firstDate = r.Date
        if (r.Date > sBuyerMap[r.buyer].lastDate) sBuyerMap[r.buyer].lastDate = r.Date
      }
      // Buyer total market
      const sBuyerTotalMarket: Record<string, number> = {}
      for (const r of all) sBuyerTotalMarket[r.buyer] = (sBuyerTotalMarket[r.buyer] || 0) + r.usd

      // Sheet 2: Buyer Relationships
      const t90s = todayMsS - 90 * 86400000
      const t180s = todayMsS - 180 * 86400000
      const sheet2Rows = Object.entries(sBuyerMap)
        .sort((a, b) => b[1].usd - a[1].usd)
        .map(([buyer, v]) => {
          const daysSince = Math.round((todayMsS - new Date(v.lastDate).getTime()) / 86400000)
          const firstMs = new Date(v.firstDate).getTime()
          const monthsOld = (todayMsS - firstMs) / (86400000 * 30)
          let status: string
          if (monthsOld < 6 && daysSince < 90) status = 'New'
          else if (daysSince < 90) status = 'Active'
          else if (daysSince < 180) status = 'Declining'
          else status = 'Dormant'
          const buyerSub = sub.filter((r) => r.buyer === buyer)
          const recentUsd = buyerSub.filter((r) => new Date(r.Date).getTime() >= t90s).reduce((a, r) => a + r.usd, 0)
          const prevUsd = buyerSub.filter((r) => { const t = new Date(r.Date).getTime(); return t >= t180s && t < t90s }).reduce((a, r) => a + r.usd, 0)
          let trend = 'stable'
          if (prevUsd > 0) { const pct = (recentUsd - prevUsd) / prevUsd * 100; if (pct > 10) trend = 'growing'; else if (pct < -10) trend = 'declining' }
          return {
            buyer,
            usd: Math.round(v.usd),
            tons: Math.round(v.tons * 100) / 100,
            kg: Math.round(v.kg),
            sharePct: sTotalUsd > 0 ? Math.round((v.usd / sTotalUsd) * 1000) / 10 : 0,
            shareOfWalletPct: sBuyerTotalMarket[buyer] > 0 ? Math.round((v.usd / sBuyerTotalMarket[buyer]) * 1000) / 10 : 0,
            firstDate: v.firstDate,
            lastDate: v.lastDate,
            daysSinceLast: daysSince,
            status,
            trend,
            shipmentCount: v.count,
            avgUsdPerKg: v.kg > 0 ? Math.round((v.usd / v.kg) * 1000) / 1000 : 0,
          }
        })
      const sheet2: import('@/lib/export').SheetDef = {
        name: 'Buyer Relationships',
        title: 'Buyer Relationships',
        columns: [
          { header: 'Buyer', key: 'buyer', width: 32 },
          { header: 'USD', key: 'usd', width: 16 },
          { header: 'Tons', key: 'tons', width: 14 },
          { header: 'KG', key: 'kg', width: 14 },
          { header: 'Share %', key: 'sharePct', width: 12 },
          { header: 'Wallet Share %', key: 'shareOfWalletPct', width: 16 },
          { header: 'First Date', key: 'firstDate', width: 14 },
          { header: 'Last Date', key: 'lastDate', width: 14 },
          { header: 'Days Since Last', key: 'daysSinceLast', width: 16 },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Trend', key: 'trend', width: 12 },
          { header: 'Shipments', key: 'shipmentCount', width: 12 },
          { header: 'Avg USD/KG', key: 'avgUsdPerKg', width: 14 },
        ],
        rows: sheet2Rows as Record<string, unknown>[],
      }

      // Sheet 3: Buyer × Mineral
      const sBuyerMineralMap: Record<string, Record<string, { tons: number; usd: number; kg: number; count: number; firstDate: string; lastDate: string }>> = {}
      for (const r of sub) {
        if (!sBuyerMineralMap[r.buyer]) sBuyerMineralMap[r.buyer] = {}
        if (!sBuyerMineralMap[r.buyer][r.mineral]) sBuyerMineralMap[r.buyer][r.mineral] = { tons: 0, usd: 0, kg: 0, count: 0, firstDate: r.Date, lastDate: r.Date }
        const bm = sBuyerMineralMap[r.buyer][r.mineral]
        bm.tons += r.tons; bm.usd += r.usd; bm.kg += r.kg; bm.count++
        if (r.Date < bm.firstDate) bm.firstDate = r.Date
        if (r.Date > bm.lastDate) bm.lastDate = r.Date
      }
      const sheet3Rows = Object.entries(sBuyerMineralMap).flatMap(([buyer, minerals]) =>
        Object.entries(minerals).map(([mineral, bm]) => ({
          buyer, mineral,
          tons: Math.round(bm.tons * 100) / 100,
          usd: Math.round(bm.usd),
          kg: Math.round(bm.kg),
          shipments: bm.count,
          firstDate: bm.firstDate,
          lastDate: bm.lastDate,
          avgUsdPerKg: bm.kg > 0 ? Math.round((bm.usd / bm.kg) * 1000) / 1000 : 0,
        }))
      ).sort((a, b) => b.usd - a.usd)
      const sheet3: import('@/lib/export').SheetDef = {
        name: 'Buyer x Mineral',
        title: 'Buyer × Mineral Detail',
        columns: [
          { header: 'Buyer', key: 'buyer', width: 32 },
          { header: 'Mineral', key: 'mineral', width: 18 },
          { header: 'Tons', key: 'tons', width: 14 },
          { header: 'USD', key: 'usd', width: 16 },
          { header: 'KG', key: 'kg', width: 14 },
          { header: 'Shipments', key: 'shipments', width: 12 },
          { header: 'First Date', key: 'firstDate', width: 14 },
          { header: 'Last Date', key: 'lastDate', width: 14 },
          { header: 'Avg USD/KG', key: 'avgUsdPerKg', width: 14 },
        ],
        rows: sheet3Rows as Record<string, unknown>[],
      }

      // Sheet 4: Mineral Mix
      const sMineralMap: Record<string, { tons: number; usd: number; kg: number; count: number; buyers: Set<string> }> = {}
      for (const r of sub) {
        if (!sMineralMap[r.mineral]) sMineralMap[r.mineral] = { tons: 0, usd: 0, kg: 0, count: 0, buyers: new Set() }
        sMineralMap[r.mineral].tons += r.tons; sMineralMap[r.mineral].usd += r.usd; sMineralMap[r.mineral].kg += r.kg; sMineralMap[r.mineral].count++
        sMineralMap[r.mineral].buyers.add(r.buyer)
      }
      const sMarketMineralPrice: Record<string, { sum: number; count: number }> = {}
      for (const r of all) {
        if (!sMarketMineralPrice[r.mineral]) sMarketMineralPrice[r.mineral] = { sum: 0, count: 0 }
        if (r.usd_per_kg > 0) { sMarketMineralPrice[r.mineral].sum += r.usd_per_kg; sMarketMineralPrice[r.mineral].count++ }
      }
      const sheet4Rows = Object.entries(sMineralMap)
        .sort((a, b) => b[1].tons - a[1].tons)
        .map(([mineral, v]) => {
          const avgPriceKg = v.kg > 0 ? v.usd / v.kg : 0
          const mktData = sMarketMineralPrice[mineral]
          const marketAvgPriceKg = mktData?.count > 0 ? mktData.sum / mktData.count : 0
          const premiumPct = marketAvgPriceKg > 0 ? ((avgPriceKg - marketAvgPriceKg) / marketAvgPriceKg) * 100 : 0
          return {
            mineral,
            tons: Math.round(v.tons * 100) / 100,
            usd: Math.round(v.usd),
            kg: Math.round(v.kg),
            sharePct: sTotalTons > 0 ? Math.round((v.tons / sTotalTons) * 1000) / 10 : 0,
            avgPriceKg: Math.round(avgPriceKg * 1000) / 1000,
            marketAvgPriceKg: Math.round(marketAvgPriceKg * 1000) / 1000,
            premiumPct: Math.round(premiumPct * 10) / 10,
            shipmentCount: v.count,
            buyers: [...v.buyers].join(', '),
          }
        })
      const sheet4: import('@/lib/export').SheetDef = {
        name: 'Mineral Mix',
        title: 'Mineral Mix',
        columns: [
          { header: 'Mineral', key: 'mineral', width: 18 },
          { header: 'Tons', key: 'tons', width: 14 },
          { header: 'USD', key: 'usd', width: 16 },
          { header: 'KG', key: 'kg', width: 14 },
          { header: 'Share %', key: 'sharePct', width: 12 },
          { header: 'Avg Price/KG', key: 'avgPriceKg', width: 16 },
          { header: 'Market Avg/KG', key: 'marketAvgPriceKg', width: 16 },
          { header: 'Premium %', key: 'premiumPct', width: 14 },
          { header: 'Shipments', key: 'shipmentCount', width: 12 },
          { header: 'Buyers', key: 'buyers', width: 50 },
        ],
        rows: sheet4Rows as Record<string, unknown>[],
      }

      // Sheet 5: Monthly Timeline
      const sMonthlyMap: Record<string, { usd: number; tons: number; shipments: number }> = {}
      for (const r of sub) {
        const mo = r.Date.slice(0, 7)
        if (!sMonthlyMap[mo]) sMonthlyMap[mo] = { usd: 0, tons: 0, shipments: 0 }
        sMonthlyMap[mo].usd += r.usd; sMonthlyMap[mo].tons += r.tons; sMonthlyMap[mo].shipments++
      }
      const sheet5Rows = Object.entries(sMonthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, usd: Math.round(v.usd), tons: Math.round(v.tons * 100) / 100, shipments: v.shipments }))
      const sheet5: import('@/lib/export').SheetDef = {
        name: 'Monthly Timeline',
        title: 'Monthly Timeline',
        columns: [
          { header: 'Month', key: 'date', width: 14 },
          { header: 'USD', key: 'usd', width: 16 },
          { header: 'Tons', key: 'tons', width: 14 },
          { header: 'Shipments', key: 'shipments', width: 12 },
        ],
        rows: sheet5Rows as Record<string, unknown>[],
      }

      // Sheet 6: Transactions
      const sheet6Rows = [...sub]
        .sort((a, b) => b.Date.localeCompare(a.Date))
        .map((r) => ({
          date: r.Date,
          buyer: r.buyer,
          mineral: r.mineral,
          tons: Math.round(r.tons * 100) / 100,
          usd: Math.round(r.usd),
          kg: Math.round(r.kg),
          usdPerKg: Math.round(r.usd_per_kg * 1000) / 1000,
          aduana: r.aduana ?? '',
        }))
      const sheet6: import('@/lib/export').SheetDef = {
        name: 'Transactions',
        title: 'All Transactions',
        columns: [
          { header: 'Date', key: 'date', width: 14 },
          { header: 'Buyer', key: 'buyer', width: 32 },
          { header: 'Mineral', key: 'mineral', width: 18 },
          { header: 'Tons', key: 'tons', width: 14 },
          { header: 'USD', key: 'usd', width: 16 },
          { header: 'KG', key: 'kg', width: 14 },
          { header: 'USD/KG', key: 'usdPerKg', width: 14 },
          { header: 'Customs Post', key: 'aduana', width: 24 },
        ],
        rows: sheet6Rows as Record<string, unknown>[],
      }

      buffer = await buildWorkbook([sheet1, sheet2, sheet3, sheet4, sheet5, sheet6])
      filename = `supplier_${supplierName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`

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
