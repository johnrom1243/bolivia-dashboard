import { NextResponse } from 'next/server'
import { getData } from '@/lib/db'
import { latestMonth } from '@/lib/period'

export async function GET() {
  try {
    const all = await getData()
    const minerals = [...new Set(all.map((r) => r.mineral))].sort()
    const years = all.map((r) => r.year).filter(Boolean)
    return NextResponse.json({
      minerals,
      yearMin: Math.min(...years),
      yearMax: Math.max(...years),
      totalRows: all.length,
      latestMonth: latestMonth(all),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
