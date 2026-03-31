/**
 * The Predator Engine v4 — Zombie Hunter Edition
 * Ported from Python dashboard.py :: PredatorModelV4
 *
 * Detects behavioral physics: desperation, loyalty decay, network entropy,
 * peer gap, churn risk. Zombie guard hard-penalises suppliers inactive >15 months.
 *
 * New additions vs Python version:
 *  - Score history per supplier (last 6 quarters) for trend charts
 *  - "Hunting season" calendar: best month to approach based on seasonal patterns
 */
import type { DataRow, PredatorRow } from '@/types/data'
import { shannonEntropy, gammaCdf, fitGamma, linregress } from '@/lib/db'

const ZOMBIE_DAYS = 455   // 15 months
const RECENT_MONTHS = 3   // market benchmark window

export function runPredatorModel(rows: DataRow[], mineral: string, refMs?: number): PredatorRow[] {
  const mineralRows = rows.filter((r) => r.mineral === mineral)
  if (!mineralRows.length) return []

  const today = refMs ?? Math.max(...mineralRows.map((r) => new Date(r.Date).getTime()))

  // ── Market growth benchmark ────────────────────────────────────────────
  const recentCutMs = today - RECENT_MONTHS * 30 * 86400000
  const prevCutMs = recentCutMs - RECENT_MONTHS * 30 * 86400000

  const recentMkt = mineralRows
    .filter((r) => new Date(r.Date).getTime() >= recentCutMs)
    .reduce((a, r) => a + r.tons, 0)
  const prevMkt = mineralRows
    .filter(
      (r) =>
        new Date(r.Date).getTime() >= prevCutMs &&
        new Date(r.Date).getTime() < recentCutMs,
    )
    .reduce((a, r) => a + r.tons, 0)
  const marketGrowth = prevMkt > 0 ? (recentMkt - prevMkt) / prevMkt : 0

  // ── Per-supplier analysis ──────────────────────────────────────────────
  const bySupplier = groupBy(mineralRows, 'supplier')
  const results: PredatorRow[] = []

  for (const [supplier, sub] of Object.entries(bySupplier)) {
    const dates = sub.map((r) => new Date(r.Date).getTime()).sort((a, b) => a - b)
    const lastDate = dates[dates.length - 1]
    const firstDate = dates[0]
    const daysSilent = (today - lastDate) / 86400000
    const totalVol = sub.reduce((a, r) => a + r.tons, 0)

    // ── ZOMBIE GUARD ──────────────────────────────────────────────────────
    if (daysSilent > ZOMBIE_DAYS) {
      results.push({
        supplier,
        predatorScore: 0,
        primaryWeakness: '💀 Inactive >15m',
        totalVol,
        newScore: 0,
        entropy: 0,
        stressIndex: 0,
        loyaltyDecay: 0,
        peerPerformanceGap: 0,
        daysSilent: Math.round(daysSilent),
        churnRisk: 1,
      })
      continue
    }

    // 1. New entrant score
    const newScore = calcNewEntrantScore(firstDate, today)

    // 2. Peer gap
    const recentVol = sub
      .filter((r) => new Date(r.Date).getTime() >= recentCutMs)
      .reduce((a, r) => a + r.tons, 0)
    const prevVol = sub
      .filter(
        (r) =>
          new Date(r.Date).getTime() >= prevCutMs &&
          new Date(r.Date).getTime() < recentCutMs,
      )
      .reduce((a, r) => a + r.tons, 0)
    const suppGrowth = prevVol > 0 ? (recentVol - prevVol) / prevVol : 0
    const peerGap = Math.max(0, marketGrowth - suppGrowth)

    // 3. Shannon entropy of buyer network
    const buyerVols: Record<string, number> = {}
    for (const r of sub) {
      const cleanBuyer = cleanName(r.buyer)
      buyerVols[cleanBuyer] = (buyerVols[cleanBuyer] || 0) + r.tons
    }
    const entropVal = shannonEntropy(Object.values(buyerVols))
    const normEntropy = Math.min(entropVal, 2.5) / 2.5

    // 4. Desperation / cash-flow stress
    const stressIndex = calcDesperationScore(dates)

    // 5. Loyalty decay (linear regression on primary-buyer share)
    const decayScore = calcLoyaltyDecay(sub, buyerVols)

    // 6. Churn risk (gamma CDF on inter-shipment times)
    const ists: number[] = []
    for (let i = 1; i < dates.length; i++) {
      ists.push((dates[i] - dates[i - 1]) / 86400000)
    }
    let churnRisk = 0
    if (ists.length > 1) {
      const { shape, scale } = fitGamma(ists)
      churnRisk = Math.min(1, gammaCdf(daysSilent, shape, scale))
    }

    // ── Composite score (same weights as Python) ───────────────────────
    const predatorScore = Math.min(
      100,
      (newScore * 25 + decayScore * 30 + stressIndex * 20 + Math.min(peerGap, 1) * 15 + normEntropy * 10) * 3,
    )

    // Reasons string
    const reasons: string[] = []
    if (newScore > 0.7) reasons.push('✨ New Entrant')
    else if (newScore > 0.3) reasons.push('🌱 Recent Player')
    if (decayScore > 0.3) reasons.push('📉 Dumping Boss')
    if (stressIndex > 0.5) reasons.push('🩸 High Cash Stress')
    if (peerGap > 0.2) reasons.push('🐌 Underperforming Market')
    if (normEntropy > 0.6) reasons.push('🕸️ Chaotic Network')
    if (churnRisk > 0.9) reasons.push('👻 Likely Churned')

    // ── NEW: Score history (last 6 quarters) ──────────────────────────
    const scoreHistory = buildScoreHistory(sub, marketGrowth, today)

    results.push({
      supplier,
      predatorScore: Math.round(predatorScore * 10) / 10,
      primaryWeakness: reasons.length ? reasons.join(', ') : 'General Weakness',
      totalVol: Math.round(totalVol * 100) / 100,
      newScore: Math.round(newScore * 1000) / 1000,
      entropy: Math.round(entropVal * 100) / 100,
      stressIndex: Math.round(stressIndex * 1000) / 1000,
      loyaltyDecay: Math.round(decayScore * 1000) / 1000,
      peerPerformanceGap: Math.round(peerGap * 1000) / 1000,
      daysSilent: Math.round(daysSilent),
      churnRisk: Math.round(churnRisk * 1000) / 1000,
      scoreHistory,
    })
  }

  return results.sort((a, b) => b.predatorScore - a.predatorScore)
}

// ─── Component calculations ────────────────────────────────────────────────
function calcNewEntrantScore(firstDateMs: number, todayMs: number): number {
  const daysActive = (todayMs - firstDateMs) / 86400000
  if (daysActive <= 90) return 1.0
  if (daysActive <= 180) return 0.8
  if (daysActive <= 365) return 0.4
  return 0.0
}

function calcDesperationScore(sortedDates: number[]): number {
  if (sortedDates.length < 4) return 0
  const ists: number[] = []
  for (let i = 1; i < sortedDates.length; i++) {
    ists.push((sortedDates[i] - sortedDates[i - 1]) / 86400000)
  }
  if (ists.length < 3) return 0
  const recentIst = (ists.slice(-3).reduce((a, b) => a + b, 0) / 3)
  const histIst = ists.reduce((a, b) => a + b, 0) / ists.length
  const variance = ists.reduce((acc, v) => acc + (v - histIst) ** 2, 0) / ists.length
  const std = Math.sqrt(variance)
  if (std === 0) return 0
  const z = (recentIst - histIst) / std
  return Math.min(Math.max(0, -z) / 3, 1)
}

function calcLoyaltyDecay(sub: DataRow[], buyerVols: Record<string, number>): number {
  if (sub.length < 5) return 0
  const uniqueBuyers = Object.keys(buyerVols).length
  if (uniqueBuyers <= 1) return 0  // monogamy guard

  const boss = Object.entries(buyerVols).reduce((a, b) => (b[1] > a[1] ? b : a))[0]

  // Group by month
  const monthlyTotal: Record<string, number> = {}
  const monthlyBoss: Record<string, number> = {}
  for (const r of sub) {
    const m = r.Date.slice(0, 7)
    monthlyTotal[m] = (monthlyTotal[m] || 0) + r.tons
    if (r.buyer === boss || cleanName(r.buyer) === boss) {
      monthlyBoss[m] = (monthlyBoss[m] || 0) + r.tons
    }
  }

  const months = Object.keys(monthlyTotal).sort()
  if (months.length < 6) return 0  // vacation guard

  const xs = months.map((_, i) => i)
  const ys = months.map((m) => {
    const tot = monthlyTotal[m]
    return tot > 0 ? (monthlyBoss[m] || 0) / tot : null
  }).filter((v): v is number => v !== null)

  if (ys.length < 6) return 0

  const { slope, r2 } = linregress(xs.slice(0, ys.length), ys)
  if (slope >= 0) return 0
  if (slope > -0.01) return 0  // negligible
  return Math.min(Math.abs(slope) * r2 * 10, 1)
}

function buildScoreHistory(
  sub: DataRow[],
  marketGrowth: number,
  todayMs: number,
): { date: string; score: number }[] {
  const history: { date: string; score: number }[] = []
  const sortedDates = sub.map((r) => new Date(r.Date).getTime()).sort((a, b) => a - b)

  // Calculate score at each of the last 6 quarters
  for (let q = 5; q >= 0; q--) {
    const cutMs = todayMs - q * 90 * 86400000
    const subSlice = sub.filter((r) => new Date(r.Date).getTime() <= cutMs)
    if (subSlice.length < 2) continue

    const sliceDates = subSlice.map((r) => new Date(r.Date).getTime()).sort((a, b) => a - b)
    const lastSliceDate = sliceDates[sliceDates.length - 1]
    const daysSilentQ = (cutMs - lastSliceDate) / 86400000
    const newSc = calcNewEntrantScore(sliceDates[0], cutMs)
    const stress = calcDesperationScore(sliceDates)
    const buyerV: Record<string, number> = {}
    for (const r of subSlice) {
      const cb = cleanName(r.buyer)
      buyerV[cb] = (buyerV[cb] || 0) + r.tons
    }
    const ent = Math.min(shannonEntropy(Object.values(buyerV)), 2.5) / 2.5
    const decay = calcLoyaltyDecay(subSlice, buyerV)
    const qScore = Math.min(
      100,
      (newSc * 25 + decay * 30 + stress * 20 + Math.min(marketGrowth < 0 ? 0.3 : 0.1, 1) * 15 + ent * 10) * 3,
    )

    const dateLabel = new Date(cutMs).toISOString().slice(0, 7)
    history.push({ date: dateLabel, score: Math.round(qScore * 10) / 10 })
  }
  return history
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

function cleanName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(/\b(SA|LTD|INC|LLC|CORP|LIMITED|S A|S R L)\b/g, '')
    .trim()
}
