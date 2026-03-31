/**
 * Shared tooltip definitions for every metric in the dashboard.
 * Import what you need: import { G } from '@/lib/glossary'
 */
export const G = {

  // ── General market ───────────────────────────────────────────────────────
  totalShipments: {
    term: 'Total Shipments',
    what: 'Number of individual export records in the selected filter range. One row in the source data equals one shipment.',
  },
  totalUsd: {
    term: 'Total USD',
    what: 'Gross declared export value in US dollars for all shipments in the selected range.',
    calc: 'Sum of USD across all matching rows.',
  },
  totalTons: {
    term: 'Total Tonnage',
    what: 'Gross weight shipped in metric tons.',
    calc: 'Sum of tons across all matching rows.',
  },
  avgPriceKg: {
    term: 'Avg Price / kg',
    what: 'Volume-weighted average export price per kilogram across all shipments.',
    calc: 'Total USD ÷ Total KG',
  },
  penfoldShare: {
    term: 'Penfold Market Share',
    what: "Penfold's share of the total market export value in the filtered range. Shows how dominant your company is versus all other buyers.",
    calc: 'Penfold USD ÷ Total market USD × 100',
  },
  uniqueSuppliers: {
    term: 'Active Suppliers',
    what: 'Number of distinct suppliers who shipped at least once in the filtered range.',
  },
  uniqueBuyers: {
    term: 'Active Buyers',
    what: 'Number of distinct buyer/importer companies who received at least one shipment in the filtered range.',
  },
  avgShipment: {
    term: 'Avg Shipment Size',
    what: 'Typical size and value of a single shipment in the filtered range.',
    calc: 'Tons: Total Tons ÷ Shipment count. Value: Total USD ÷ Shipment count.',
  },

  // ── Rolling windows ──────────────────────────────────────────────────────
  rollingWindow: {
    term: 'Rolling Period',
    what: 'Activity in the last N days measured from the most recent date in the dataset (not today). Compared against the identical prior period to show trend direction.',
    calc: 'Change % = (current period − prior period) ÷ prior period × 100',
  },

  // ── YoY ─────────────────────────────────────────────────────────────────
  yoy: {
    term: 'Year-over-Year (YoY)',
    what: 'Compares the current calendar year to the same months of the prior year. If the current year is incomplete, only the matching months are used for the comparison.',
    calc: '(Current year − Prior year comparable) ÷ Prior year comparable × 100',
  },

  // ── Market health ────────────────────────────────────────────────────────
  hhi: {
    term: 'HHI — Herfindahl-Hirschman Index',
    what: 'Measures how concentrated the supplier side of the market is. A high HHI means a few suppliers control most of the volume.',
    calc: 'Sum of (each supplier\'s market share %)². Range 0–10,000. <1,500 = Competitive, 1,500–2,500 = Moderate, >2,500 = Concentrated.',
  },
  supplierCr4: {
    term: 'Supplier CR4',
    what: 'Combined market share of the top 4 suppliers by USD. A high CR4 means the market depends on very few sellers.',
    calc: 'Sum of market share % for the top 4 suppliers by export value.',
  },
  buyerCr4: {
    term: 'Buyer CR4',
    what: 'Combined market share of the top 4 buyers by USD. A high CR4 means a few large importers drive most demand.',
    calc: 'Sum of market share % for the top 4 buyers by export value.',
  },
  newEntrantRate: {
    term: 'New Entrant Rate',
    what: 'Share of suppliers active in the last 3 months who were not present in the prior 3 months. High rate = dynamic, competitive market with new sellers entering.',
    calc: 'New suppliers ÷ Total active suppliers (last 3 months) × 100',
  },
  priceVolatility: {
    term: 'Price Volatility',
    what: 'How much the average price per ton fluctuates month to month. High volatility = unstable pricing environment.',
    calc: 'Coefficient of variation = Standard deviation of monthly avg price ÷ Mean monthly avg price × 100',
  },

  // ── Supplier metrics ─────────────────────────────────────────────────────
  daysSinceLast: {
    term: 'Days Since Last Shipment',
    what: 'Days between this supplier\'s most recent shipment and the latest date in the dataset. Used to classify activity status.',
  },
  healthScore: {
    term: 'Health Score',
    what: 'Composite 0–100 score summarising how "healthy" this supplier relationship looks. Higher = more active, more diversified, higher volume.',
    calc: 'Recency score (40%) + Buyer diversity score (30%) + Log volume score (30%)',
  },
  momentum: {
    term: 'Momentum',
    what: 'Whether this supplier\'s USD value is accelerating or decelerating recently.',
    calc: '(Last 90 days USD − Prior 90 days USD) ÷ Prior 90 days USD × 100',
  },
  shareOfWallet: {
    term: 'Share of Wallet',
    what: "This supplier's sales to a specific buyer as a % of that buyer's total market purchases across ALL suppliers. High % = this supplier is critical to that buyer's supply chain.",
    calc: 'Supplier→Buyer USD ÷ Total market USD bought by that buyer × 100',
  },
  supplierStatus: {
    term: 'Supplier Status',
    what: 'Activity classification based on recency:\n• Active — last shipment < 90 days ago (and not new)\n• New — first shipment < 6 months ago AND last < 90 days ago\n• Declining — last shipment 90–180 days ago\n• Dormant — last shipment > 180 days ago',
  },
  premiumPct: {
    term: 'Price Premium %',
    what: 'How much above or below the market average this supplier\'s price is. Positive = supplier charges more than market; negative = below market.',
    calc: '(Supplier avg USD/kg − Market avg USD/kg) ÷ Market avg USD/kg × 100',
  },

  // ── Buyer / Trader metrics ───────────────────────────────────────────────
  marketSharePct: {
    term: 'Market Share',
    what: "This buyer's share of total market export value. Shows how large this importer is relative to all others.",
    calc: 'Buyer total USD ÷ All buyers total USD × 100',
  },
  marketShareRank: {
    term: 'Market Rank',
    what: 'Position of this buyer among all buyers in the dataset, ranked by total USD purchased.',
  },
  supplierRetentionRate: {
    term: 'Supplier Retention Rate',
    what: 'Share of last year\'s suppliers who also shipped to this buyer in the most recent year. High % = stable, loyal supply base.',
    calc: 'Suppliers present in both years ÷ Suppliers in prior year × 100',
  },
  concentrationRisk: {
    term: 'Concentration Risk',
    what: 'How dependent this buyer is on a small number of suppliers. High % = supply chain risk — if a top supplier stops, a large share of supply disappears.',
    calc: 'Top-N suppliers\' combined USD ÷ Buyer total USD × 100',
  },
  avgDaysBetweenShipments: {
    term: 'Avg Days Between Shipments',
    what: 'Mean gap in days between consecutive shipments. Lower = more active and frequent buying cadence.',
    calc: 'Total date span ÷ (Number of shipments − 1)',
  },
  buyerStatus: {
    term: 'Supplier Status (for this buyer)',
    what: 'Activity classification based on recency:\n• Active — last delivery < 90 days ago (age > 6 months)\n• New — first delivery < 6 months ago AND last < 90 days ago\n• At-risk — last delivery 90–180 days ago\n• Dormant — last delivery > 180 days ago',
  },

  // ── Poach index ──────────────────────────────────────────────────────────
  poachIndex: {
    term: 'Poach Index',
    what: 'Composite 0–1 score of how attractive a supplier is to win business from. Higher = better target to approach.',
    calc: 'Volume Gap (40%) + Recency score (30%) + Frequency score (20%) + Low concentration bonus (10%)',
  },
  poachTier: {
    term: 'Poach Tier',
    what: 'Classification based on Poach Index score:\n• A (≥0.65) — Immediate priority, high probability of conversion\n• B (0.40–0.65) — Nurture, worth a warm approach\n• C (<0.40) — Low priority, monitor only\n• Unpoachable — Supplier appears corporately linked to their primary buyer',
  },
  poachGap: {
    term: 'Volume Gap',
    what: 'Share of this supplier\'s total volume that does NOT go to Penfold. The larger the gap, the more volume is available to win.',
    calc: '1 − (Penfold KG ÷ Total supplier KG)',
  },
  recencyDays: {
    term: 'Recency (Days)',
    what: 'Days since this supplier\'s last shipment (from dataset reference date). Recent suppliers are easier to approach — they are actively trading.',
  },

  // ── Loyalty index ────────────────────────────────────────────────────────
  loyaltyIndex: {
    term: 'Loyalty Index',
    what: 'Measures how committed a supplier is to its primary buyer (0–100). High score = supplier is deeply tied to one buyer and unlikely to defect.',
    calc: 'Primary buyer concentration (30%) + Shipment consistency (30%) + Exclusivity / buyer count (30%) + Relationship duration (10%)',
  },
  loyaltyTrend: {
    term: 'Loyalty Trend',
    what: 'Direction of loyalty over the last 6 months, based on linear regression of the primary buyer\'s share of the supplier\'s monthly volume.\n• Rising — primary buyer is gaining share\n• Falling — supplier is diversifying away\n• Stable — no significant change',
  },
  atRisk: {
    term: 'At-Risk Flag',
    what: 'Set to true when loyalty is high (>60) but trending downward. These are high-loyalty suppliers who are beginning to explore alternatives — a window of opportunity.',
  },

  // ── Predator engine ──────────────────────────────────────────────────────
  predatorScore: {
    term: 'Predator Score',
    what: 'Composite 0–100 vulnerability score. Higher = supplier is under stress and more likely to switch buyers.',
    calc: 'New Entrant score (25%) + Loyalty Decay (30%) + Cash-flow Stress (20%) + Peer Performance Gap (15%) + Network Entropy (10%)',
  },
  loyaltyDecay: {
    term: 'Loyalty Decay',
    what: 'How strongly the supplier\'s primary buyer share is declining over time. Measured by linear regression slope × R². High = primary buyer is losing grip.',
  },
  cashStress: {
    term: 'Cash-flow Stress',
    what: 'Whether the gap between recent shipments and historical cadence suggests financial pressure. Long unexpected gaps = stress.',
    calc: 'Z-score of recent inter-shipment time vs historical mean, normalised 0–1.',
  },
  peerGap: {
    term: 'Peer Performance Gap',
    what: 'How much this supplier is underperforming the overall market for this mineral. If the market is growing but this supplier isn\'t, they are losing position.',
    calc: 'Market volume growth − Supplier volume growth (last 3 months vs prior 3 months)',
  },
  networkEntropy: {
    term: 'Network Entropy',
    what: 'How spread out the supplier\'s buyer network is. High entropy = chaotic, diversified — no single dominant buyer — which creates openings.',
    calc: 'Shannon entropy of buyer volume distribution, normalised 0–1.',
  },
  churnRisk: {
    term: 'Churn Risk',
    what: 'Probability this supplier has permanently stopped trading, modelled on their historical shipping frequency.',
    calc: 'Gamma CDF(days silent | shape, scale) where shape/scale are fitted to historical inter-shipment intervals.',
  },
  zombieGuard: {
    term: 'Zombie Guard',
    what: 'Suppliers inactive for more than 15 months automatically receive a Predator Score of 0 — they are considered out of the market.',
  },
} as const

export type GlossaryKey = keyof typeof G
