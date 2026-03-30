import { NextRequest, NextResponse } from 'next/server'
import { getData } from '@/lib/db'
import type { SearchResult } from '@/types/data'

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get('q') ?? '').toLowerCase().trim()
    if (q.length < 2) return NextResponse.json([])

    const all = await getData()
    const results: SearchResult[] = []
    const seen = new Set<string>()

    // Supplier matches
    const supplierMap: Record<string, { usd: number; tons: number; lastDate: string; count: number }> = {}
    const buyerMap: Record<string, { usd: number; tons: number; lastDate: string; count: number }> = {}
    const mineralMap: Record<string, { usd: number; tons: number; lastDate: string; count: number }> = {}

    for (const r of all) {
      if (r.supplier.toLowerCase().includes(q)) {
        if (!supplierMap[r.supplier]) supplierMap[r.supplier] = { usd: 0, tons: 0, lastDate: r.Date, count: 0 }
        supplierMap[r.supplier].usd += r.usd
        supplierMap[r.supplier].tons += r.tons
        supplierMap[r.supplier].count++
        if (r.Date > supplierMap[r.supplier].lastDate) supplierMap[r.supplier].lastDate = r.Date
      }
      if (r.buyer.toLowerCase().includes(q)) {
        if (!buyerMap[r.buyer]) buyerMap[r.buyer] = { usd: 0, tons: 0, lastDate: r.Date, count: 0 }
        buyerMap[r.buyer].usd += r.usd
        buyerMap[r.buyer].tons += r.tons
        buyerMap[r.buyer].count++
        if (r.Date > buyerMap[r.buyer].lastDate) buyerMap[r.buyer].lastDate = r.Date
      }
      if (r.mineral.toLowerCase().includes(q)) {
        if (!mineralMap[r.mineral]) mineralMap[r.mineral] = { usd: 0, tons: 0, lastDate: r.Date, count: 0 }
        mineralMap[r.mineral].usd += r.usd
        mineralMap[r.mineral].tons += r.tons
        mineralMap[r.mineral].count++
        if (r.Date > mineralMap[r.mineral].lastDate) mineralMap[r.mineral].lastDate = r.Date
      }
    }

    for (const [name, v] of Object.entries(supplierMap)) {
      results.push({ name, type: 'Supplier', totalUsd: v.usd, totalTons: v.tons, lastActivity: v.lastDate, shipmentCount: v.count })
    }
    for (const [name, v] of Object.entries(buyerMap)) {
      results.push({ name, type: 'Buyer', totalUsd: v.usd, totalTons: v.tons, lastActivity: v.lastDate, shipmentCount: v.count })
    }
    for (const [name, v] of Object.entries(mineralMap)) {
      results.push({ name, type: 'Mineral', totalUsd: v.usd, totalTons: v.tons, lastActivity: v.lastDate, shipmentCount: v.count })
    }

    results.sort((a, b) => b.totalUsd - a.totalUsd)
    return NextResponse.json(results.slice(0, 20))
  } catch (err) {
    console.error('[/api/data/search]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
