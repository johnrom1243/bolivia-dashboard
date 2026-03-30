import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const all = await getData()
    const filters = parseFilters(req.nextUrl.searchParams)
    const filtered = applyFilters(all, filters)
    // Return max 20k rows to avoid memory issues on large datasets
    return NextResponse.json(filtered.slice(0, 20000))
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
