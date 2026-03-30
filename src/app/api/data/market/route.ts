import { NextRequest, NextResponse } from 'next/server'
import { getData, applyFilters, parseFilters, linregress } from '@/lib/db'
import type { MarketEvolutionData } from '@/types/data'

export async function GET(req: NextRequest) {
  try {
    const all = await getData()
    const filters = parseFilters(req.nextUrl.searchParams)
    const filtered = applyFilters(all, filters)
    const topN = filters.topN ?? 15

    if (!filtered.length) return NextResponse.json(null)

    // ── Quarterly overview ────────────────────────────────────────────────
    const qMap: Record<string, { usd: number; tons: number; shipments: number }> = {}
    for (const r of filtered) {
      if (!qMap[r.Quarter]) qMap[r.Quarter] = { usd: 0, tons: 0, shipments: 0 }
      qMap[r.Quarter].usd += r.usd
      qMap[r.Quarter].tons += r.tons
      qMap[r.Quarter].shipments++
    }
    const quarterlyOverview = Object.entries(qMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([quarter, v]) => ({ quarter, ...v }))

    // ── Monthly tonnage with moving averages ──────────────────────────────
    const monthMap: Record<string, number> = {}
    for (const r of filtered) {
      const m = r.Date.slice(0, 7)
      monthMap[m] = (monthMap[m] || 0) + r.tons
    }
    const monthList = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b))
    const monthlyTonnage = monthList.map(([date, tons], i) => ({
      date,
      tons,
      ma3: i >= 2 ? (monthList[i][1] + monthList[i-1][1] + monthList[i-2][1]) / 3 : null,
      ma6: i >= 5
        ? monthList.slice(i - 5, i + 1).reduce((a, [, v]) => a + v, 0) / 6
        : null,
    }))

    // ── Yearly comparison ─────────────────────────────────────────────────
    const yearMap: Record<number, { tons: number; usd: number }> = {}
    for (const r of filtered) {
      if (!yearMap[r.year]) yearMap[r.year] = { tons: 0, usd: 0 }
      yearMap[r.year].tons += r.tons
      yearMap[r.year].usd += r.usd
    }
    const yearList = Object.entries(yearMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([y, v]) => ({ year: Number(y), ...v }))
    const yearlyComparison = yearList.map((y, i) => ({
      ...y,
      yoyTons: i > 0 && yearList[i-1].tons > 0
        ? ((y.tons - yearList[i-1].tons) / yearList[i-1].tons) * 100
        : null,
      yoyUsd: i > 0 && yearList[i-1].usd > 0
        ? ((y.usd - yearList[i-1].usd) / yearList[i-1].usd) * 100
        : null,
    }))

    // ── Top suppliers / buyers by tonnage ─────────────────────────────────
    const suppMap: Record<string, number> = {}
    const buyMap: Record<string, number> = {}
    const totalTons = filtered.reduce((a, r) => a + r.tons, 0)
    for (const r of filtered) {
      suppMap[r.supplier] = (suppMap[r.supplier] || 0) + r.tons
      buyMap[r.buyer] = (buyMap[r.buyer] || 0) + r.tons
    }
    const topSuppliersByTons = Object.entries(suppMap)
      .sort((a, b) => b[1] - a[1]).slice(0, topN)
      .map(([supplier, tons]) => ({ supplier, tons, share: totalTons > 0 ? (tons / totalTons) * 100 : 0 }))
    const topBuyersByTons = Object.entries(buyMap)
      .sort((a, b) => b[1] - a[1]).slice(0, topN)
      .map(([buyer, tons]) => ({ buyer, tons, share: totalTons > 0 ? (tons / totalTons) * 100 : 0 }))

    // ── Mineral quarterly evolution ───────────────────────────────────────
    const minQMap: Record<string, Record<string, number>> = {}
    for (const r of filtered) {
      if (!minQMap[r.Quarter]) minQMap[r.Quarter] = {}
      minQMap[r.Quarter][r.mineral] = (minQMap[r.Quarter][r.mineral] || 0) + r.tons
    }
    const mineralEvolution = Object.entries(minQMap).flatMap(([quarter, mins]) =>
      Object.entries(mins).map(([mineral, tons]) => ({ quarter, mineral, tons })),
    ).sort((a, b) => a.quarter.localeCompare(b.quarter))

    // ── Price evolution by mineral (monthly avg) ──────────────────────────
    const priceMap: Record<string, Record<string, { sum: number; n: number }>> = {}
    for (const r of filtered) {
      if (r.usd_per_kg <= 0) continue
      const m = r.Date.slice(0, 7)
      if (!priceMap[r.mineral]) priceMap[r.mineral] = {}
      if (!priceMap[r.mineral][m]) priceMap[r.mineral][m] = { sum: 0, n: 0 }
      priceMap[r.mineral][m].sum += r.usd_per_kg
      priceMap[r.mineral][m].n++
    }
    const priceEvolution = Object.entries(priceMap).flatMap(([mineral, months]) =>
      Object.entries(months).map(([date, v]) => ({
        date,
        mineral,
        avgPrice: v.n > 0 ? v.sum / v.n : 0,
      })),
    ).sort((a, b) => a.date.localeCompare(b.date))

    // ── Price forecast (linear extrapolation, 3 months) ───────────────────
    const priceForecast: MarketEvolutionData['priceForecast'] = []
    for (const [mineral, months] of Object.entries(priceMap)) {
      const sorted = Object.entries(months).sort(([a], [b]) => a.localeCompare(b))
      if (sorted.length < 3) continue
      const xs = sorted.map((_, i) => i)
      const ys = sorted.map(([, v]) => v.n > 0 ? v.sum / v.n : 0)
      const { slope, intercept } = linregress(xs, ys)
      const stdErr = Math.sqrt(ys.reduce((acc, y, i) => acc + (y - (slope * i + intercept)) ** 2, 0) / ys.length)

      const lastDateStr = sorted[sorted.length - 1][0]
      for (let f = 1; f <= 3; f++) {
        const d = new Date(lastDateStr + '-01')
        d.setMonth(d.getMonth() + f)
        const forecastDate = d.toISOString().slice(0, 7)
        const forecast = slope * (xs.length - 1 + f) + intercept
        priceForecast.push({
          date: forecastDate,
          mineral,
          forecast: Math.max(0, forecast),
          lower: Math.max(0, forecast - 2 * stdErr),
          upper: forecast + 2 * stdErr,
        })
      }
    }

    // ── Competition metrics per quarter (HHI, CR4) ────────────────────────
    const competitionMetrics = quarterlyOverview.map(({ quarter }) => {
      const qRows = filtered.filter((r) => r.Quarter === quarter)
      const qTotal = qRows.reduce((a, r) => a + r.usd, 0)
      const shares: Record<string, number> = {}
      for (const r of qRows) shares[r.supplier] = (shares[r.supplier] || 0) + r.usd
      const sortedShares = Object.values(shares)
        .map((v) => qTotal > 0 ? (v / qTotal) * 100 : 0)
        .sort((a, b) => b - a)
      return {
        quarter,
        hhi: sortedShares.reduce((acc, s) => acc + s ** 2, 0),
        cr4: sortedShares.slice(0, 4).reduce((a, b) => a + b, 0),
        supplierCount: sortedShares.length,
      }
    })

    // ── Market dynamics: new/exited suppliers per quarter ─────────────────
    const quarterSuppliers: Record<string, Set<string>> = {}
    for (const r of filtered) {
      if (!quarterSuppliers[r.Quarter]) quarterSuppliers[r.Quarter] = new Set()
      quarterSuppliers[r.Quarter].add(r.supplier)
    }
    const quarters = Object.keys(quarterSuppliers).sort()
    const marketDynamics = quarters.map((q, i) => {
      const current = quarterSuppliers[q]
      const prev = i > 0 ? quarterSuppliers[quarters[i - 1]] : new Set<string>()
      const newBuyersSet = new Set(
        filtered.filter((r) => r.Quarter === q).map((r) => r.buyer),
      )
      const prevBuyers = i > 0
        ? new Set(filtered.filter((r) => r.Quarter === quarters[i - 1]).map((r) => r.buyer))
        : new Set<string>()
      return {
        quarter: q,
        newSuppliers: i === 0 ? 0 : [...current].filter((s) => !prev.has(s)).length,
        exitedSuppliers: i === 0 ? 0 : [...prev].filter((s) => !current.has(s)).length,
        newBuyers: i === 0 ? 0 : [...newBuyersSet].filter((b) => !prevBuyers.has(b)).length,
      }
    })

    // ── Trade flows (Sankey data): top supplier→buyer pairs ──────────────
    const flowMap: Record<string, Record<string, { value: number; mineral: string }>> = {}
    for (const r of filtered) {
      if (!flowMap[r.supplier]) flowMap[r.supplier] = {}
      if (!flowMap[r.supplier][r.buyer]) {
        flowMap[r.supplier][r.buyer] = { value: 0, mineral: r.mineral }
      }
      flowMap[r.supplier][r.buyer].value += r.usd
    }
    const tradeFlows = Object.entries(flowMap)
      .flatMap(([source, targets]) =>
        Object.entries(targets).map(([target, { value, mineral }]) => ({
          source, target, value, mineral,
        })),
      )
      .sort((a, b) => b.value - a.value)
      .slice(0, 80)  // top 80 flows for Sankey

    // ── Seasonal decomposition: avg tons by calendar month ────────────────
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const monthTons: Record<number, { sum: number; n: number }> = {}
    for (const r of filtered) {
      if (!monthTons[r.month_num]) monthTons[r.month_num] = { sum: 0, n: 0 }
      monthTons[r.month_num].sum += r.tons
      monthTons[r.month_num].n++
    }
    const grandAvg = Object.values(monthTons).reduce((a, v) => a + v.sum, 0) /
      Math.max(Object.values(monthTons).reduce((a, v) => a + v.n, 0), 1)
    const seasonalDecomposition = MONTH_NAMES.map((monthName, idx) => {
      const m = monthTons[idx + 1]
      const avgTons = m?.n > 0 ? m.sum / m.n : 0
      return {
        month: idx + 1,
        monthName,
        avgTons,
        seasonalIndex: grandAvg > 0 ? avgTons / grandAvg : 1,
      }
    })

    const result: MarketEvolutionData = {
      quarterlyOverview,
      monthlyTonnage,
      yearlyComparison,
      topSuppliersByTons,
      topBuyersByTons,
      mineralEvolution,
      priceEvolution,
      priceForecast,
      competitionMetrics,
      marketDynamics,
      tradeFlows,
      seasonalDecomposition,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/data/market]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
