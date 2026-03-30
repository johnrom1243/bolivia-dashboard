import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters } from '@/lib/db'
import type { MatrixData } from '@/types/data'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const metric = (params.get('metric') ?? 'usd') as 'usd' | 'tons' | 'kg'
    const comparePrev = params.get('comparePrev') === 'true'

    const all = await getData()
    const filters = parseFilters(params)
    const filtered = applyFilters(all, filters)

    if (!filtered.length) return NextResponse.json(null)

    function buildMatrix(rows: typeof filtered) {
      const values: Record<string, Record<string, number>> = {}
      const rowTotals: Record<string, number> = {}
      const colTotals: Record<string, number> = {}
      let grandTotal = 0

      for (const r of rows) {
        if (!values[r.supplier]) values[r.supplier] = {}
        const val = r[metric]
        values[r.supplier][r.buyer] = (values[r.supplier][r.buyer] || 0) + val
        rowTotals[r.supplier] = (rowTotals[r.supplier] || 0) + val
        colTotals[r.buyer] = (colTotals[r.buyer] || 0) + val
        grandTotal += val
      }

      const suppliers = Object.keys(rowTotals).sort((a, b) => rowTotals[b] - rowTotals[a])
      const buyers = Object.keys(colTotals).sort((a, b) => colTotals[b] - colTotals[a])

      return { suppliers, buyers, values, rowTotals, colTotals, grandTotal }
    }

    const current = buildMatrix(filtered)
    let deltaVsPrev: MatrixData['deltaVsPrev']

    if (comparePrev) {
      // Compare against same year range -1
      const prevFilters = {
        ...filters,
        yearMin: (filters.yearMin ?? 0) - 1,
        yearMax: (filters.yearMax ?? 9999) - 1,
      }
      const prevRows = applyFilters(all, prevFilters)
      const prev = buildMatrix(prevRows)

      deltaVsPrev = {}
      for (const s of current.suppliers) {
        deltaVsPrev[s] = {}
        for (const b of current.buyers) {
          const cur = current.values[s]?.[b] ?? 0
          const prv = prev.values[s]?.[b] ?? 0
          deltaVsPrev[s][b] = cur - prv
        }
      }
    }

    const result: MatrixData = { ...current, deltaVsPrev }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/data/matrix]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
