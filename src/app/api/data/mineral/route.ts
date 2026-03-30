import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters } from '@/lib/db'
import type { MineralHitListRow } from '@/types/data'

const STATUS_CUTOFFS = { NEW_ENTRY: 45, HOT: 90, WARM: 180, LUKEWARM: 365 }

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const mineral = params.get('mineral') ?? ''

    const all = await getData()
    const filters = parseFilters(params)
    const filtered = applyFilters(all, filters)

    const mineralRows = mineral ? filtered.filter((r) => r.mineral === mineral) : filtered
    if (!mineralRows.length) return NextResponse.json([])

    const todayMs = Date.now()
    const currentYear = new Date().getFullYear()

    // Market avg price for this mineral
    const marketPrices = mineralRows.filter((r) => r.usd_per_kg > 0).map((r) => r.usd_per_kg)
    const marketAvgPrice = marketPrices.length
      ? marketPrices.reduce((a, b) => a + b, 0) / marketPrices.length
      : 0

    // Per-supplier stats
    const bySupplier: Record<string, typeof mineralRows> = {}
    for (const r of mineralRows) {
      if (!bySupplier[r.supplier]) bySupplier[r.supplier] = []
      bySupplier[r.supplier].push(r)
    }

    const hitList: MineralHitListRow[] = []

    for (const [supplier, rows] of Object.entries(bySupplier)) {
      const dates = rows.map((r) => r.Date).sort()
      const lastDate = new Date(dates[dates.length - 1])
      const firstDate = new Date(dates[0])
      const daysInactive = (todayMs - lastDate.getTime()) / 86400000

      // Latest buyer (most recent shipment's buyer)
      const latestRow = rows.sort((a, b) => b.Date.localeCompare(a.Date))[0]
      const latestBuyer = latestRow.buyer

      const totalTons = rows.reduce((a, r) => a + r.tons, 0)
      const totalUsd = rows.reduce((a, r) => a + r.usd, 0)

      // Status
      let status: MineralHitListRow['status']
      if (firstDate.getFullYear() === currentYear && daysInactive <= STATUS_CUTOFFS.HOT) {
        status = 'NEW ENTRY'
      } else if (daysInactive <= STATUS_CUTOFFS.NEW_ENTRY) {
        status = 'HOT LEAD'
      } else if (daysInactive <= STATUS_CUTOFFS.HOT) {
        status = 'WARM'
      } else if (daysInactive <= STATUS_CUTOFFS.LUKEWARM) {
        status = 'LUKEWARM'
      } else {
        status = 'DORMANT'
      }

      // Lead score (0-100): higher = better prospect
      const recencyScore = Math.max(0, 100 - daysInactive / 3.65)
      const volumeScore = Math.min(100, Math.log1p(totalTons) * 15)
      const isNewBonus = status === 'NEW ENTRY' ? 20 : 0
      const statusBonus = status === 'HOT LEAD' ? 10 : status === 'WARM' ? 5 : 0
      const leadScore = Math.min(100, Math.round(recencyScore * 0.5 + volumeScore * 0.3 + isNewBonus + statusBonus))

      // Price vs market
      const supplierAvgPrice = marketPrices.length > 0
        ? rows.filter((r) => r.usd_per_kg > 0).reduce((a, r) => a + r.usd_per_kg, 0) /
          Math.max(rows.filter((r) => r.usd_per_kg > 0).length, 1)
        : 0
      const priceVsMarket = marketAvgPrice > 0 && supplierAvgPrice > 0
        ? ((supplierAvgPrice - marketAvgPrice) / marketAvgPrice) * 100
        : null

      // Recommended action
      const recommendedAction = buildAction(status, daysInactive, totalTons)

      hitList.push({
        supplier,
        status,
        leadScore,
        latestBuyer,
        daysInactive: Math.round(daysInactive),
        totalTons: Math.round(totalTons * 100) / 100,
        totalUsd: Math.round(totalUsd),
        shipmentCount: rows.length,
        firstSeen: dates[0],
        lastSeen: dates[dates.length - 1],
        priceVsMarket: priceVsMarket !== null ? Math.round(priceVsMarket * 10) / 10 : null,
        recommendedAction,
      })
    }

    hitList.sort((a, b) => {
      const statusOrder = { 'NEW ENTRY': 0, 'HOT LEAD': 1, 'WARM': 2, 'LUKEWARM': 3, 'DORMANT': 4 }
      const sd = statusOrder[a.status] - statusOrder[b.status]
      return sd !== 0 ? sd : b.leadScore - a.leadScore
    })

    return NextResponse.json(hitList)
  } catch (err) {
    console.error('[/api/data/mineral]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

function buildAction(status: MineralHitListRow['status'], days: number, tons: number): string {
  if (status === 'NEW ENTRY') return 'Immediate first-contact — new entrant, establish relationship before competitors'
  if (status === 'HOT LEAD' && tons > 500) return 'Priority call — high-volume active supplier, time-sensitive'
  if (status === 'HOT LEAD') return 'Outreach this week — recently active, high conversion probability'
  if (status === 'WARM') return 'Schedule meeting — active in last quarter, good opportunity'
  if (status === 'LUKEWARM') return 'Re-engagement campaign — check in, offer competitive terms'
  if (days > 365) return 'Archive or long-tail nurture — significant inactivity'
  return 'Monitor and revisit next quarter'
}
