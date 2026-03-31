/**
 * Supplier Poach Index
 * Ported from Python dashboard.py :: calculate_poach_index()
 *
 * Score (0-1) — higher = more attractive to poach.
 * Weights: gap 40%, recency 30%, frequency 20%, concentration 10%
 *
 * New additions vs Python version:
 *  - Tier classification: A (>0.65), B (0.40-0.65), C (<0.40), Unpoachable
 *  - Recommended action text per tier
 */
import type { DataRow, PoachRow } from '@/types/data'

export function calculatePoachIndex(rows: DataRow[], refMs?: number): PoachRow[] {
  if (!rows.length) return []

  const today = refMs ?? Math.max(...rows.map((r) => new Date(r.Date).getTime()))

  // ── Corporate root extraction (same logic as Python) ──────────────────
  function getCorporateRoot(name: string): string {
    name = name.toUpperCase()
    const legalTerms = [
      ' S A', ' S R L', ' COM', ' BOL', ' SA', ' SRL',
      'EMPRESA', 'MINERA', 'COOPERATIVA', ' LTDA', ' LLC',
      ' INC', ' CORP', ' LIMITED', ' LTD',
    ]
    for (const t of legalTerms) name = name.replace(t, '')
    const parts = name.split(/[^A-Z0-9]+/).filter((p) => p.length > 2)
    return parts.length ? parts.reduce((a, b) => (a.length >= b.length ? a : b)) : ''
  }

  // Annotate linkage on each row
  const annotated = rows.map((r) => {
    const supplierRoot = getCorporateRoot(r.supplier)
    const buyerRoot = getCorporateRoot(r.buyer)
    const isLinked =
      supplierRoot.length > 3 &&
      buyerRoot.length > 3 &&
      (supplierRoot.includes(buyerRoot) || buyerRoot.includes(supplierRoot))
        ? 1
        : 0
    return { ...r, supplierRoot, buyerRoot, isLinked }
  })

  // ── Per-supplier stats ────────────────────────────────────────────────
  const bySupplier = groupBy(annotated, 'supplier')
  const raw: RawStats[] = []

  for (const [supplier, group] of Object.entries(bySupplier)) {
    const totalKg = sum(group, 'kg')
    const penfoldKg = group
      .filter((r) => r.buyer.toLowerCase().includes('penfold'))
      .reduce((a, r) => a + r.kg, 0)

    const buyerKgs: Record<string, number> = {}
    for (const r of group) buyerKgs[r.buyer] = (buyerKgs[r.buyer] || 0) + r.kg
    const hhi = totalKg > 0
      ? Object.values(buyerKgs).reduce((acc, v) => acc + ((v / totalKg) * 100) ** 2, 0)
      : 10000

    const isLinked = group.some((r) => (r as any).isLinked) && Object.keys(buyerKgs).length === 1

    const dates = group.map((r) => new Date(r.Date).getTime()).sort((a, b) => a - b)
    const firstDate = dates[0]
    const lastDate = dates[dates.length - 1]
    const recencyDays = (today - lastDate) / 86400000
    const spanMonths = Math.max((lastDate - firstDate) / (86400000 * 30), 1)

    raw.push({
      supplier,
      totalTons: totalKg / 1000,
      totalUsd: sum(group, 'usd'),
      isLinked,
      gap: totalKg > 0 ? 1 - penfoldKg / totalKg : 1,
      recencyDays,
      shipmentCount: group.length,
      frequencyMonths: spanMonths,
      buyerDiversity: Object.keys(buyerKgs).length,
      buyerConcentrationHhi: hhi,
      primaryMineral: mode(group.map((r) => r.mineral)) ?? 'N/A',
    })
  }

  // ── Normalise components ───────────────────────────────────────────────
  const maxRecency = Math.max(...raw.map((r) => r.recencyDays))

  const withNorm = raw.map((r) => {
    const freqScore = r.shipmentCount / r.frequencyMonths
    return { ...r, freqScore }
  })

  // Log-normalise
  const recencyNorm = normalise01(withNorm.map((r) => Math.log1p(maxRecency - r.recencyDays)))
  const freqNorm = normalise01(withNorm.map((r) => Math.log1p(r.freqScore)))
  const concNorm = normalise01(withNorm.map((r) => Math.log1p(10000 - r.buyerConcentrationHhi)))

  // ── Composite score & tier ─────────────────────────────────────────────
  const results: PoachRow[] = withNorm.map((r, i) => {
    const poachIndex = r.isLinked
      ? 0
      : 0.4 * r.gap + 0.3 * recencyNorm[i] + 0.2 * freqNorm[i] + 0.1 * concNorm[i]

    const tier: PoachRow['tier'] = r.isLinked
      ? 'Unpoachable'
      : poachIndex >= 0.65 ? 'A'
      : poachIndex >= 0.40 ? 'B'
      : 'C'

    const recommendedAction = buildRecommendedAction(tier, r.recencyDays, r.gap, r.buyerDiversity)

    return {
      supplier: r.supplier,
      totalTons: Math.round(r.totalTons * 100) / 100,
      totalUsd: Math.round(r.totalUsd),
      poachIndex: Math.round(poachIndex * 1000) / 1000,
      poachStatus: r.isLinked ? 'Unpoachable (Linked)' : 'Potentially Poachable',
      tier,
      gap: Math.round(r.gap * 1000) / 1000,
      recencyDays: Math.round(r.recencyDays),
      frequencyScore: Math.round(withNorm[i].freqScore * 100) / 100,
      concentrationNorm: Math.round(concNorm[i] * 1000) / 1000,
      buyerDiversity: r.buyerDiversity,
      buyerConcentrationHhi: Math.round(r.buyerConcentrationHhi),
      primaryMineral: r.primaryMineral,
      recommendedAction,
    }
  })

  return results.sort((a, b) => b.poachIndex - a.poachIndex)
}

function buildRecommendedAction(
  tier: PoachRow['tier'],
  recencyDays: number,
  gap: number,
  diversity: number,
): string {
  if (tier === 'Unpoachable') return 'No action — supplier likely tied to buyer'
  if (tier === 'A') {
    if (recencyDays < 30) return 'Priority outreach — active, high gap, first mover advantage'
    return 'Immediate outreach — high vulnerability, significant volume available'
  }
  if (tier === 'B') {
    if (diversity > 3) return 'Nurture campaign — diversified supplier, build relationship over time'
    return 'Warm outreach — moderate opportunity, explore pricing advantage'
  }
  if (gap < 0.1) return 'Monitor only — already heavily reliant on Penfold'
  return 'Low priority — keep on radar, revisit quarterly'
}

// ─── Helpers ───────────────────────────────────────────────────────────────
interface RawStats {
  supplier: string
  totalTons: number
  totalUsd: number
  isLinked: boolean | number
  gap: number
  recencyDays: number
  shipmentCount: number
  frequencyMonths: number
  buyerDiversity: number
  buyerConcentrationHhi: number
  primaryMineral: string
  freqScore?: number
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const item of arr) {
    const k = String(item[key])
    if (!result[k]) result[k] = []
    result[k].push(item)
  }
  return result
}

function sum(arr: Record<string, unknown>[], key: string): number {
  return arr.reduce((acc, r) => acc + (Number(r[key]) || 0), 0)
}

function mode<T>(arr: T[]): T | undefined {
  if (!arr.length) return undefined
  const counts = new Map<T, number>()
  for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1)
  return [...counts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
}

function normalise01(values: number[]): number[] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return values.map(() => 0.5)
  return values.map((v) => (v - min) / (max - min))
}
