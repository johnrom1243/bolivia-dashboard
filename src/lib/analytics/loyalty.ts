/**
 * Supplier Loyalty Index
 * Ported and improved from Python dashboard.py :: calculate_supplier_loyalty_index()
 *
 * Score (0-100) measures how committed a supplier is to its primary buyer.
 * Weights: concentration 30%, consistency 30%, exclusivity 30%, duration 10%
 *
 * New additions vs Python version:
 *  - 6-month loyalty TREND (rising/falling/stable) using linear regression
 *  - At-risk flag: loyalty > 60 but declining
 *  - Cohort year (first shipment year)
 */
import type { DataRow, LoyaltyRow } from '@/types/data'
import { linregress } from '@/lib/db'

export function calculateLoyaltyIndex(rows: DataRow[]): LoyaltyRow[] {
  if (!rows.length) return []

  // Group by supplier
  const bySupplier = groupBy(rows, 'supplier')
  const results: LoyaltyRow[] = []

  for (const [supplier, group] of Object.entries(bySupplier)) {
    // Buyer volumes
    const buyerVols: Record<string, number> = {}
    const buyerUsd: Record<string, number> = {}
    for (const r of group) {
      buyerVols[r.buyer] = (buyerVols[r.buyer] || 0) + r.tons
      buyerUsd[r.buyer] = (buyerUsd[r.buyer] || 0) + r.usd
    }

    const sortedBuyers = Object.entries(buyerVols).sort((a, b) => b[1] - a[1])
    if (!sortedBuyers.length) continue

    const [primaryBuyer, primaryVol] = sortedBuyers[0]
    const totalVol = Object.values(buyerVols).reduce((a, b) => a + b, 0)
    const totalUsd = Object.values(buyerUsd).reduce((a, b) => a + b, 0)
    const primaryBuyerShare = totalVol > 0 ? primaryVol / totalVol : 0

    // Relationship duration for primary buyer
    const primaryDates = group
      .filter((r) => r.buyer === primaryBuyer)
      .map((r) => new Date(r.Date).getTime())
    const minDate = Math.min(...primaryDates)
    const maxDate = Math.max(...primaryDates)
    const relationshipMonths = (maxDate - minDate) / (1000 * 60 * 60 * 24 * 30)

    // Consistency: shipments per month
    const shipmentCount = group.filter((r) => r.buyer === primaryBuyer).length
    const consistency = shipmentCount / Math.max(relationshipMonths, 1)

    // Exclusivity factor
    const uniqueBuyers = sortedBuyers.length

    // Composite score (same formula as Python)
    const loyaltyScore =
      primaryBuyerShare * 0.3 * 100 +
      Math.min(consistency * 10, 0.3 * 100) +
      (1 / uniqueBuyers) * 0.3 * 100 +
      Math.min(relationshipMonths / 12, 1) * 0.1 * 100

    // ── NEW: 6-month trend ────────────────────────────────────────────────
    // Calculate monthly primary-buyer share over last 6 months
    const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000
    const recentGroup = group.filter(
      (r) => new Date(r.Date).getTime() >= sixMonthsAgo,
    )

    let trend: 'rising' | 'falling' | 'stable' = 'stable'
    if (recentGroup.length >= 4) {
      const monthlyShares = computeMonthlyPrimaryShare(recentGroup, primaryBuyer)
      if (monthlyShares.length >= 3) {
        const xs = monthlyShares.map((_, i) => i)
        const ys = monthlyShares.map((s) => s.share)
        const { slope } = linregress(xs, ys)
        if (slope > 0.02) trend = 'rising'
        else if (slope < -0.02) trend = 'falling'
      }
    }

    // ── NEW: At-risk flag ─────────────────────────────────────────────────
    const atRisk = loyaltyScore > 60 && trend === 'falling'

    // ── NEW: Cohort year ──────────────────────────────────────────────────
    const firstDate = new Date(Math.min(...group.map((r) => new Date(r.Date).getTime())))
    const cohortYear = firstDate.getFullYear()

    results.push({
      supplier,
      primaryBuyer,
      loyaltyIndex: Math.round(Math.min(loyaltyScore, 100) * 10) / 10,
      primaryBuyerShare: Math.round(primaryBuyerShare * 1000) / 10,
      uniqueBuyers,
      relationshipMonths: Math.round(relationshipMonths * 10) / 10,
      totalVolumeTons: Math.round(totalVol * 100) / 100,
      totalUsd: Math.round(totalUsd),
      trend,
      atRisk,
      cohortYear,
    })
  }

  return results.sort((a, b) => b.loyaltyIndex - a.loyaltyIndex)
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const item of arr) {
    const k = String(item[key])
    if (!result[k]) result[k] = []
    result[k].push(item)
  }
  return result
}

function computeMonthlyPrimaryShare(
  rows: DataRow[],
  primaryBuyer: string,
): { month: string; share: number }[] {
  const monthlyTotal: Record<string, number> = {}
  const monthlyPrimary: Record<string, number> = {}
  for (const r of rows) {
    const m = r.Date.slice(0, 7) // YYYY-MM
    monthlyTotal[m] = (monthlyTotal[m] || 0) + r.tons
    if (r.buyer === primaryBuyer) {
      monthlyPrimary[m] = (monthlyPrimary[m] || 0) + r.tons
    }
  }
  return Object.keys(monthlyTotal)
    .sort()
    .map((m) => ({
      month: m,
      share: monthlyTotal[m] > 0 ? (monthlyPrimary[m] || 0) / monthlyTotal[m] : 0,
    }))
}
