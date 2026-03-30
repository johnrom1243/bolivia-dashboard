/**
 * Excel export utility using ExcelJS.
 * Every table/chart in the dashboard has a corresponding export function here.
 */
import ExcelJS from 'exceljs'

export interface SheetDef {
  name: string
  columns: { header: string; key: string; width?: number; numFmt?: string }[]
  rows: Record<string, unknown>[]
  title?: string
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E3A5F' },
}
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
}

/**
 * Build a multi-sheet Excel workbook and return as Buffer.
 * Each SheetDef becomes one sheet with styled headers.
 */
export async function buildWorkbook(sheets: SheetDef[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Bolivia Intelligence Platform'
  wb.created = new Date()

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31))

    // Set column widths and keys — no header here, we add it manually below
    ws.columns = sheet.columns.map((c) => ({
      key: c.key,
      width: c.width ?? 18,
    }))

    // Optional title row
    if (sheet.title) {
      const titleRow = ws.addRow([sheet.title])
      titleRow.font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } }
      ws.mergeCells(`A1:${colLetter(sheet.columns.length)}1`)
      ws.addRow([])  // blank spacer
    }

    // Header row — always written manually so it lands at the right row
    const headerRowIdx = sheet.title ? 3 : 1
    const headerRow = ws.getRow(headerRowIdx)
    sheet.columns.forEach((col, idx) => {
      headerRow.getCell(idx + 1).value = col.header
    })
    headerRow.commit()
    headerRow.eachCell((cell) => {
      cell.fill = HEADER_FILL
      cell.font = HEADER_FONT
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF4472C4' } },
      }
    })

    // Data rows
    for (const row of sheet.rows) {
      const addedRow = ws.addRow(row)
      sheet.columns.forEach((col, idx) => {
        if (col.numFmt) {
          addedRow.getCell(idx + 1).numFmt = col.numFmt
        }
      })
    }

    // Auto-filter on header row
    ws.autoFilter = {
      from: { row: headerRowIdx, column: 1 },
      to: { row: headerRowIdx, column: sheet.columns.length },
    }

    // Freeze at header row
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRowIdx }]
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/** Single-sheet convenience wrapper */
export async function buildSingleSheet(def: SheetDef): Promise<Buffer> {
  return buildWorkbook([def])
}

// ─── Pre-built sheet definitions for each module ───────────────────────────

export function kpiSheet(data: Record<string, unknown>[]): SheetDef {
  return {
    name: 'KPIs',
    title: 'Bolivia Market KPI Summary',
    columns: [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ],
    rows: data,
  }
}

export function poachSheet(data: Record<string, unknown>[]): SheetDef {
  return {
    name: 'Poach Index',
    title: 'Supplier Poachability Rankings',
    columns: [
      { header: 'Supplier', key: 'supplier', width: 35 },
      { header: 'Total Tons', key: 'totalTons', width: 15, numFmt: '#,##0.00' },
      { header: 'Total USD', key: 'totalUsd', width: 18, numFmt: '$#,##0' },
      { header: 'Poach Index', key: 'poachIndex', width: 14, numFmt: '0.000' },
      { header: 'Tier', key: 'tier', width: 12 },
      { header: 'Status', key: 'poachStatus', width: 25 },
      { header: 'Gap', key: 'gap', width: 10, numFmt: '0.0%' },
      { header: 'Days Since Last', key: 'recencyDays', width: 16 },
      { header: 'Buyer Count', key: 'buyerDiversity', width: 14 },
      { header: 'HHI', key: 'buyerConcentrationHhi', width: 12 },
      { header: 'Primary Mineral', key: 'primaryMineral', width: 18 },
      { header: 'Recommended Action', key: 'recommendedAction', width: 50 },
    ],
    rows: data,
  }
}

export function loyaltySheet(data: Record<string, unknown>[]): SheetDef {
  return {
    name: 'Loyalty Analysis',
    title: 'Supplier Loyalty Index',
    columns: [
      { header: 'Supplier', key: 'supplier', width: 35 },
      { header: 'Primary Buyer', key: 'primaryBuyer', width: 35 },
      { header: 'Loyalty Index', key: 'loyaltyIndex', width: 16, numFmt: '0.0' },
      { header: 'Buyer Share %', key: 'primaryBuyerShare', width: 16, numFmt: '0.0"%"' },
      { header: 'Unique Buyers', key: 'uniqueBuyers', width: 14 },
      { header: 'Relationship Months', key: 'relationshipMonths', width: 22 },
      { header: 'Total Tons', key: 'totalVolumeTons', width: 14, numFmt: '#,##0.00' },
      { header: 'Total USD', key: 'totalUsd', width: 18, numFmt: '$#,##0' },
      { header: 'Trend', key: 'trend', width: 12 },
      { header: 'At Risk', key: 'atRisk', width: 10 },
      { header: 'First Shipment Year', key: 'cohortYear', width: 20 },
    ],
    rows: data,
  }
}

export function predatorSheet(data: Record<string, unknown>[]): SheetDef {
  return {
    name: 'Predator Targets',
    title: 'Predator Engine v4 — Commercial Targets',
    columns: [
      { header: 'Supplier', key: 'supplier', width: 35 },
      { header: 'Vulnerability Score', key: 'predatorScore', width: 22, numFmt: '0.0' },
      { header: 'Primary Weakness', key: 'primaryWeakness', width: 45 },
      { header: 'Total Volume', key: 'totalVol', width: 16, numFmt: '#,##0.00' },
      { header: 'Days Silent', key: 'daysSilent', width: 14 },
      { header: 'Stress Index', key: 'stressIndex', width: 15, numFmt: '0.000' },
      { header: 'Loyalty Decay', key: 'loyaltyDecay', width: 16, numFmt: '0.000' },
      { header: 'Entropy', key: 'entropy', width: 12, numFmt: '0.00' },
      { header: 'Peer Gap', key: 'peerPerformanceGap', width: 14, numFmt: '0.000' },
      { header: 'Churn Risk', key: 'churnRisk', width: 14, numFmt: '0.000' },
    ],
    rows: data,
  }
}

export function mineralHitListSheet(data: Record<string, unknown>[], mineral: string): SheetDef {
  return {
    name: 'Hit List',
    title: `Commercial Hit List — ${mineral}`,
    columns: [
      { header: 'Supplier', key: 'supplier', width: 35 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Lead Score', key: 'leadScore', width: 14, numFmt: '0' },
      { header: 'Latest Buyer', key: 'latestBuyer', width: 35 },
      { header: 'Days Inactive', key: 'daysInactive', width: 16 },
      { header: 'Total Tons', key: 'totalTons', width: 14, numFmt: '#,##0.00' },
      { header: 'Total USD', key: 'totalUsd', width: 18, numFmt: '$#,##0' },
      { header: 'Shipments', key: 'shipmentCount', width: 12 },
      { header: 'Price vs Market %', key: 'priceVsMarket', width: 20, numFmt: '0.0' },
      { header: 'Recommended Action', key: 'recommendedAction', width: 50 },
    ],
    rows: data,
  }
}

export function rawDataSheet(data: Record<string, unknown>[]): SheetDef {
  return {
    name: 'Raw Data',
    columns: [
      { header: 'Date', key: 'Date', width: 14 },
      { header: 'Supplier', key: 'supplier', width: 35 },
      { header: 'Buyer', key: 'buyer', width: 35 },
      { header: 'Mineral', key: 'mineral', width: 14 },
      { header: 'KG', key: 'kg', width: 14, numFmt: '#,##0' },
      { header: 'Tons', key: 'tons', width: 14, numFmt: '#,##0.000' },
      { header: 'USD', key: 'usd', width: 18, numFmt: '$#,##0' },
      { header: 'USD/KG', key: 'usd_per_kg', width: 12, numFmt: '$0.000' },
      { header: 'Aduana', key: 'aduana', width: 30 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Quarter', key: 'Quarter', width: 12 },
    ],
    rows: data,
  }
}

// ─── Util ──────────────────────────────────────────────────────────────────
function colLetter(n: number): string {
  let result = ''
  while (n > 0) {
    result = String.fromCharCode(((n - 1) % 26) + 65) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}
