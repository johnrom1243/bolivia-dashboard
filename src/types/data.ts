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
  avgPricePerKg: number                        // NEW: weighted avg USD/kg
  penfoldSharePct: number                      // NEW: Penfold % of market USD
  dataDateRange: { min: string; max: string }  // NEW: freshness indicator
  yoyGrowthUsd: number | null
  yoyGrowthTons: number | null
  topSuppliers: { name: string; usd: number; tons: number; share: number; avgPriceKg: number }[]
  topBuyers: { name: string; usd: number; tons: number; share: number }[]
  quarterlyTrend: { quarter: string; usd: number; tons: number; shipments: number; avgPriceKg: number }[]
  topMovers: {
    name: string
    type: 'supplier' | 'buyer'
    currentUsd: number
    prevUsd: number
    change: number
    usdDelta: number                           // NEW: absolute $ delta
  }[]
  rollingMetrics: {
    period: '30d' | '90d' | '180d'
    tons: number
    usd: number
    shipments: number
    prevTons: number                           // NEW: previous equivalent period
    prevUsd: number
    prevShipments: number
    changeTons: number                         // NEW: % vs prev period
    changeUsd: number
    changeShipments: number
  }[]
  marketHealth: {
    hhi: number
    cr4: number
    newEntrantRate: number
    newEntrantCount: number                    // NEW: absolute count
    score: 'Healthy' | 'Moderate' | 'Concentrated'
    buyerCr4: number                           // NEW: buyer-side concentration
    priceVolatilityPct: number                 // NEW: std dev of monthly avg price
  }
  mineralBreakdown: {                          // NEW: per-mineral stats
    mineral: string
    usd: number
    tons: number
    share: number
    shipments: number
    avgPriceKg: number
  }[]
  monthlyTrend: {                              // NEW: month-by-month
    date: string
    usd: number
    tons: number
    shipments: number
  }[]
  priceByMineralQuarter: Record<string, number | string>[]  // NEW: { quarter, ZINC, TIN, ... }
  gainers: { name: string; currentUsd: number; change: number; usdDelta: number }[]   // NEW
  losers: { name: string; currentUsd: number; change: number; usdDelta: number }[]    // NEW
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
export interface BuyerMineralDetail {
  mineral: string
  tons: number
  usd: number
  kg: number
  shipmentCount: number
  firstDate: string
  lastDate: string
  avgUsdPerKg: number
}

export interface BuyerRelationship {
  buyer: string
  tons: number
  usd: number
  kg: number
  share: number           // % of this supplier's total USD
  shareOfWallet: number   // % of this buyer's total market purchases (all suppliers) that come from THIS supplier
  firstDate: string
  lastDate: string
  daysSinceLast: number
  shipmentCount: number
  status: 'Active' | 'New' | 'Declining' | 'Dormant'
  trend: 'growing' | 'stable' | 'declining'
  avgUsdPerKg: number
  minerals: BuyerMineralDetail[]
}

export interface SupplierProfile {
  name: string
  totalShipments: number
  totalTons: number
  totalUsd: number
  totalKg: number
  uniqueBuyers: number
  firstShipment: string
  lastShipment: string
  daysSinceLast: number
  avgDaysBetweenShipments: number
  healthScore: number
  momentumUsd: number
  peakQuarter: string
  // Buyer relationships (rich)
  buyerRelationships: BuyerRelationship[]
  // Keep buyerShares for backward compat with charts
  buyerShares: { buyer: string; tons: number; usd: number; share: number; firstDate: string }[]
  quarterlyTimeline: { quarter: string; buyer: string; value: number }[]
  monthlyTimeline: { date: string; usd: number; tons: number; shipments: number }[]
  mineralMix: {
    mineral: string
    tons: number
    usd: number
    kg: number
    share: number
    avgPriceKg: number
    marketAvgPriceKg: number
    premiumPct: number       // % above/below market (positive = above)
    buyers: string[]
    shipmentCount: number
  }[]
  priceVsMarket: { date: string; supplierPrice: number; marketPrice: number }[]
  priceVsMarketByMineral: {
    mineral: string
    data: { date: string; supplierPrice: number; marketPrice: number }[]
  }[]
  shipmentDistribution: { bucket: string; count: number }[]
  aduanaUsage: { aduana: string; count: number; share: number; tons: number }[]
  seasonalPattern: { month: string; avgTons: number; avgUsd: number; shipments: number }[]
  competitorPresence: { buyer: string; otherSuppliers: string[] }[]
  activityHeatmap: { year: number; month: number; count: number; tons: number }[]
  recentTransactions: {
    date: string
    buyer: string
    mineral: string
    tons: number
    usd: number
    usdPerKg: number
    aduana: string
  }[]
}

// ─── Trader deep dive ──────────────────────────────────────────────────────
export interface TraderProfile {
  name: string
  totalShipments: number
  totalTons: number
  totalUsd: number
  totalKg: number                      // NEW
  uniqueSuppliers: number
  firstShipment: string
  lastShipment: string
  daysSinceLast: number                // NEW
  avgDaysBetweenShipments: number      // NEW
  avgPriceKg: number                   // NEW: weighted avg price paid per kg
  marketSharePct: number
  marketShareTrend: 'growing' | 'declining' | 'stable'
  marketShareRank: number              // NEW: rank among all buyers by USD
  totalBuyersInMarket: number          // NEW
  supplierRetentionRate: number        // NEW: % of prev-year suppliers still active

  // Supplier status counts
  supplierStatusCounts: {             // NEW
    active: number
    new: number
    atRisk: number
    dormant: number
  }

  // Concentration risk
  concentrationRisk: {                // NEW
    top1Share: number
    top3Share: number
    top5Share: number
  }

  quarterlyVolume: { quarter: string; usd: number; tons: number; shipments: number }[]
  monthlyTimeline: { date: string; usd: number; tons: number; shipments: number }[]   // NEW
  yoyComparison: { year: number; usd: number; tons: number; shipments: number; suppliers: number }[]  // NEW

  mineralBreakdown: {                  // NEW: richer than old pricing power
    mineral: string
    usd: number
    tons: number
    kg: number
    share: number                      // % of total USD
    shipmentCount: number
    supplierCount: number
    avgPriceKg: number
    marketAvgPriceKg: number
    premiumPct: number                 // negative = pays below market (good for buyer)
  }[]

  seasonalPattern: { month: string; avgTons: number; avgUsd: number; avgShipments: number }[]  // NEW

  supplierAcquisitionTimeline: {      // NEW: when each supplier relationship started
    date: string
    supplier: string
    mineral: string
    firstUsd: number
  }[]

  supplierRoster: {
    supplier: string
    totalKg: number
    totalUsd: number
    shipmentCount: number
    firstShipment: string
    lastShipment: string
    daysSinceLast: number             // NEW
    status: 'Active' | 'New' | 'At-risk' | 'Dormant'  // NEW
    shareOfWallet: number
    avgUsdPerShipment: number
    avgPriceKg: number                // NEW
  }[]

  newAcquisitions: {
    supplier: string
    firstPurchaseDate: string
    totalUsdSince: number
    totalKgSince: number
    shipmentsSince: number
  }[]

  priceVsMarket: { mineral: string; date: string; traderPrice: number; marketPrice: number }[]
  pricingPower: { mineral: string; premiumPct: number }[]

  aduanaUsage: { aduana: string; count: number; share: number; tons: number }[]  // add tons
  lotSizeDistribution: { bucket: string; count: number }[]

  supplierMineralBreakdown: {
    supplier: string
    lastDelivery: string
    daysSinceLast: number
    totalUsd: number
    totalTons: number
    shipmentCount: number
    shareOfWallet: number
    status: 'Active' | 'New' | 'At-risk' | 'Dormant'  // NEW
    avgPriceKg: number               // NEW: overall avg price paid to this supplier
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
      trend: 'growing' | 'falling' | 'stable'
    }[]
  }[]

  recentTransactions: {               // NEW: last 50 shipments
    date: string
    supplier: string
    mineral: string
    tons: number
    usd: number
    usdPerKg: number
    aduana: string
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
