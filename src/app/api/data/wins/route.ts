/**
 * /api/data/wins?window=6&lookback=12&mineral=Zinc%20Ores
 * Competitor Wins — new buyer ← supplier × mineral relationships started in the window.
 * Honours the global `minerals` and `supplierSearch` filters.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getData, parseFilters } from '@/lib/db'
import { latestMonth } from '@/lib/period'
import { computeWins } from '@/lib/analytics/wins'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const all = await getData()
    const filters = parseFilters(params)
    const windowMonths = Math.min(Math.max(Number(params.get('window')) || 6, 1), 24)
    const lookbackMonths = Math.min(Math.max(Number(params.get('lookback')) || 12, 1), 36)
    const mineral = params.get('mineral')

    return NextResponse.json(
      computeWins(all, {
        refMonth: latestMonth(all),
        windowMonths,
        lookbackMonths,
        minerals: mineral ? [mineral] : filters.minerals,
        supplierSearch: filters.supplierSearch,
      }),
    )
  } catch (err) {
    console.error('[/api/data/wins]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
