/**
 * /api/data/analytics?type=loyalty|poach|predator&mineral=ZINC&...filters
 * Single endpoint for all analytics engines.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters } from '@/lib/db'
import { calculateLoyaltyIndex } from '@/lib/analytics/loyalty'
import { calculatePoachIndex } from '@/lib/analytics/poach'
import { runPredatorModel } from '@/lib/analytics/predator'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const type = params.get('type') ?? 'loyalty'
    const mineral = params.get('mineral') ?? 'ZINC'

    const all = await getData()
    const filters = parseFilters(params)
    const filtered = applyFilters(all, filters)

    // Use latest data date as reference "today" so activity windows are meaningful
    const refMs = Math.max(...all.map((r) => new Date(r.Date).getTime()))

    let data: unknown

    if (type === 'loyalty') {
      data = calculateLoyaltyIndex(filtered, refMs)
    } else if (type === 'poach') {
      data = calculatePoachIndex(filtered, refMs)
    } else if (type === 'predator') {
      data = runPredatorModel(filtered, mineral, refMs)
    } else {
      return NextResponse.json({ error: 'Unknown analytics type' }, { status: 400 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[/api/data/analytics]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
