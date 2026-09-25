/**
 * /api/data/watch?window=3&baseline=12&mineral=Zinc%20Ores&supplier=NAME
 * Penfold Watch — which of our suppliers are selling to competitors.
 * Honours the global `minerals` and `supplierSearch` filters; year/month filters
 * are ignored because the windows are always anchored on the latest data month.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getData, parseFilters } from '@/lib/db'
import { latestMonth } from '@/lib/period'
import { computeWatch } from '@/lib/analytics/watch'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const all = await getData()
    const filters = parseFilters(params)
    const windowMonths = Math.min(Math.max(Number(params.get('window')) || 3, 1), 12)
    const baselineMonths = Math.min(Math.max(Number(params.get('baseline')) || 12, 1), 24)
    const mineral = params.get('mineral')
    const supplier = params.get('supplier')

    const result = computeWatch(all, {
      refMonth: latestMonth(all),
      windowMonths,
      baselineMonths,
      basis: params.get('basis') === 'tons' ? 'tons' : 'usd',
      minerals: mineral ? [mineral] : filters.minerals,
      supplierSearch: filters.supplierSearch,
    })

    if (supplier) result.rows = result.rows.filter((r) => r.supplier === supplier)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/data/watch]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
