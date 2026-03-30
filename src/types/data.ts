// ─── Raw data row as stored in parquet/JSON ───────────────────────────────
export interface DataRow {
  Date: string          // ISO date string
  supplier: string
  buyer: string
  kg: number
  tons: number
  usd: number
  usd_per_kg: number
  mineral: string
  year: number
  month_num: number
  month_name: string
  Quarter: string       // e.g. "2024Q1"
  aduana?: string       // customs post
}

// ─── Filter parameters (shared by all API routes) ─────────────────────────
export interface FilterParams {
  yearMin?: number
  yearMax?: number
  months?: number[]           // 1-12
  minerals?: string[]
  supplierSearch?: string
  buyerSearch?: string
  excludePenfold?: boolean
  onlyPenfold?: boolean
  topN?: number
}

// ─── KPI response ──────────────────────────────────────────────────────────
export interface KpiData {
  totalShipments: number
  totalTons: number
  totalUsd: number
  uniqueSuppliers: number
  uniqueBuyers: number
  avgShipmentTons: number
  avgShipmentUsd: number
  yoyGrowthUsd: number | null
  yoyGrowthTons: number | null
  topSuppliers: { name: string; usd: number; tons: number; share: number }[]
  topBuyers: { name: string; usd: number; tons: number; share: number }[]
  quarterlyTrend: { quarter: string; usd: number; tons: number; shipments: number }[]
  topMovers: {
    name: string
    type: 'supplier' | 'buyer'
    currentUsd: number
    prevUsd: number
    change: number
  }[]
  rollingMetrics: {
    period: '30d' | '90d' | '180d'
    tons: number
    usd: number
    shipments: number
  }[]
  marketHealth: {
    hhi: number           // 0-10000, lower = more competitive
    cr4: number           // top-4 concentration %
    newEntrantRate: number // new suppliers last quarter %
    score: 'Healthy' | 'Moderate' | 'Concentrated'
  }
}

// ─── Loyalty analytics ─────────────────────────────────────────────────────
export interface LoyaltyRow {
  supplier: string
  primaryBuyer: string
  loyaltyIndex: number
  primaryBuyerShare: number
  uniqueBuyers: number
  relationshipMonths: number
  totalVolumeTons: number
  totalUsd: number
  trend: 'rising' | 'falling' | 'stable'   // 6-month trajectory
  atRisk: boolean                           // loyal but declining
  cohortYear: number                        // year of first shipment
}

// ─── Poach index ───────────────────────────────────────────────────────────
export interface PoachRow {
  supplier: string
  totalTons: number
  totalUsd: number
  poachIndex: number
  poachStatus: 'Potentially Poachable' | 'Unpoachable (Linked)'
  tier: 'A' | 'B' | 'C' | 'Unpoachable'   // NEW: A=top priority
  gap: number
  recencyDays: number
  frequencyScore: number
  concentrationNorm: number
  buyerDiversity: number
  buyerConcentrationHhi: number
  primaryMineral: string
  recommendedAction: string                 // NEW
}

// ─── Predator model ────────────────────────────────────────────────────────
export interface PredatorRow {
  supplier: string
  predatorScore: number
  primaryWeakness: string
  totalVol: number
  newScore: number
  entropy: number
  stressIndex: number
  loyaltyDecay: number
  peerPerformanceGap: number
  daysSilent: number
  churnRisk: number
  scoreHistory?: { date: string; score: number }[]  // NEW
}

// ─── Supplier deep dive ────────────────────────────────────────────────────
export interface SupplierProfile {
  name: string
  totalShipments: number
  totalTons: number
  totalUsd: number
  uniqueBuyers: number
  firstShipment: string
  lastShipment: string
  healthScore: number                       // NEW: 0-100 composite
  momentumUsd: number                       // NEW: last 90d vs prev 90d %
  peakQuarter: string                       // NEW
  buyerShares: { buyer: string; tons: number; usd: number; share: number; firstDate: string }[]
  quarterlyTimeline: { quarter: string; buyer: string; value: number }[]
  mineralMix: { mineral: string; tons: number; usd: number; share: number }[]
  priceVsMarket: { date: string; supplierPrice: number; marketPrice: number }[]
  shipmentDistribution: { bucket: string; count: number }[]
  aduanaUsage: { aduana: string; count: number; share: number }[]
  seasonalPattern: { month: string; avgTons: number }[]  // NEW
  competitorPresence: { buyer: string; otherSuppliers: string[] }[]  // NEW
}

// ─── Trader deep dive ──────────────────────────────────────────────────────
export interface TraderProfile {
  name: string
  totalShipments: number
  totalTons: number
  totalUsd: number
  uniqueSuppliers: number
  firstShipment: string
  lastShipment: string
  marketSharePct: number                    // NEW: % of total market
  marketShareTrend: 'growing' | 'declining' | 'stable'  // NEW
  quarterlyVolume: { quarter: string; usd: number; tons: number }[]
  supplierRoster: {
    supplier: string
    totalKg: number
    totalUsd: number
    shipmentCount: number
    firstShipment: string
    lastShipment: string
    shareOfWallet: number                   // NEW: % of supplier's total
    avgUsdPerShipment: number
  }[]
  newAcquisitions: {
    supplier: string
    firstPurchaseDate: string
    totalUsdSince: number
    totalKgSince: number
    shipmentsSince: number
  }[]
  priceVsMarket: { mineral: string; date: string; traderPrice: number; marketPrice: number }[]
  pricingPower: { mineral: string; premiumPct: number }[]  // NEW: pays above/below market?
  aduanaUsage: { aduana: string; count: number; share: number }[]
  lotSizeDistribution: { bucket: string; count: number }[]
  supplierMineralBreakdown: {
    supplier: string
    lastDelivery: string         // most recent date across all minerals
    daysSinceLast: number
    totalUsd: number
    totalTons: number
    shipmentCount: number
    shareOfWallet: number        // % of supplier's total volume going to this buyer
    minerals: {
      mineral: string
      totalUsd: number
      totalTons: number
      shipmentCount: number
      firstDelivery: string
      lastDelivery: string
      daysSinceLast: number
      avgTonsPerShipment: number
      avgUsdPerKg: number
      trend: 'growing' | 'falling' | 'stable'  // last 90d vs prev 90d volume
    }[]
  }[]
}

// ─── Market evolution ──────────────────────────────────────────────────────
export interface MarketEvolutionData {
  quarterlyOverview: { quarter: string; usd: number; tons: number; shipments: number }[]
  monthlyTonnage: { date: string; tons: number; ma3: number | null; ma6: number | null }[]
  yearlyComparison: { year: number; tons: number; usd: number; yoyTons: number | null; yoyUsd: number | null }[]
  topSuppliersByTons: { supplier: string; tons: number; share: number }[]
  topBuyersByTons: { buyer: string; tons: number; share: number }[]
  mineralEvolution: { quarter: string; mineral: string; tons: number }[]
  priceEvolution: { date: string; mineral: string; avgPrice: number }[]
  priceForecast: { date: string; mineral: string; forecast: number; lower: number; upper: number }[]  // NEW
  competitionMetrics: { quarter: string; hhi: number; cr4: number; supplierCount: number }[]
  marketDynamics: { quarter: string; newSuppliers: number; exitedSuppliers: number; newBuyers: number }[]
  tradeFlows: { source: string; target: string; value: number; mineral: string }[]
  seasonalDecomposition: { month: number; monthName: string; avgTons: number; seasonalIndex: number }[]  // NEW
}

// ─── Forensic detective ────────────────────────────────────────────────────
export interface ForensicResult {
  directSuspects: {
    buyer: string
    avgMonthlyVol: number
    maxMonthlyVol: number
    activeMonths: number
    firstSeen: string
    lastSeen: string
  }[]
  splitSuspects: {
    buyer: string
    avgMonthlyVol: number
    activeMonths: number
    firstSeen: string
    lastSeen: string
  }[]
  anomalies: {            // NEW: price/volume anomalies
    buyer: string
    type: 'price_spike' | 'volume_spike' | 'frequency_change'
    date: string
    value: number
    zscore: number
  }[]
}

export interface SuspectInvestigation {
  buyer: string
  totalVolume: number
  uniqueSuppliers: number
  supplierBreakdown: {
    supplier: string
    firstPurchase: string
    lastPurchase: string
    totalQty: number
    shipmentCount: number
    avgShipmentSize: number
    shareOfWallet: number
  }[]
  monthlyTimeline: { date: string; supplier: string; qty: number }[]
  rawTransactions: {
    date: string
    supplier: string
    kg: number
    tons: number
    usd: number
    aduana: string
  }[]
}

// ─── Mineral deep dive / hit list ─────────────────────────────────────────
export interface MineralHitListRow {
  supplier: string
  status: 'NEW ENTRY' | 'HOT LEAD' | 'WARM' | 'LUKEWARM' | 'DORMANT'
  leadScore: number                         // NEW: 0-100
  latestBuyer: string
  daysInactive: number
  totalTons: number
  totalUsd: number
  shipmentCount: number
  firstSeen: string
  lastSeen: string
  priceVsMarket: number | null              // NEW: % above/below market
  recommendedAction: string                 // NEW
}

// ─── New supplier analysis ─────────────────────────────────────────────────
export interface NewSupplierRow {
  supplier: string
  firstShipmentDate: string
  totalTons: number
  totalUsd: number
  shipmentCount: number
  uniqueBuyers: number
  primaryBuyer: string
  primaryMineral: string
  growthVelocity: number    // NEW: monthly volume growth rate
  survivalMonths: number    // NEW: how many months active
  stillActive: boolean      // NEW
  aduanaEntry: string
}

// ─── Matrix ────────────────────────────────────────────────────────────────
export interface MatrixData {
  suppliers: string[]
  buyers: string[]
  values: Record<string, Record<string, number>>  // [supplier][buyer] = value
  rowTotals: Record<string, number>
  colTotals: Record<string, number>
  grandTotal: number
  deltaVsPrev?: Record<string, Record<string, number>>  // NEW: vs previous period
}

// ─── Search ────────────────────────────────────────────────────────────────
export interface SearchResult {
  name: string
  type: 'Supplier' | 'Buyer' | 'Mineral'
  totalUsd: number
  totalTons: number
  lastActivity: string
  shipmentCount: number
}

// ─── Logistics ─────────────────────────────────────────────────────────────
export interface LogisticsData {
  lotSizeByMineral: { mineral: string; p25: number; median: number; p75: number; mean: number; max: number }[]
  shipmentValueDist: { bucket: string; count: number; totalUsd: number }[]
  avgLotMatrix: { supplier: string; buyer: string; avgTons: number }[]
  customsPostComparison: { aduana: string; shipments: number; avgTons: number; minerals: string[] }[]  // NEW
  monthlyFrequencyHeatmap: { supplier: string; month: string; count: number }[]  // NEW
  routeEfficiency: { aduana: string; mineral: string; avgTons: number; shipmentCount: number }[]  // NEW
}
