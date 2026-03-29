export interface ExtractedTable {
  id: string
  headers: string[]
  units: string[]
  rows: (number | string | null)[][]
  summary_rows: { label: string; values: (number | null)[] }[]
}

export interface SheetCellValue {
  v: number | string | null
  m: string
  t: 'n' | 's'
  bl?: 1
}

export interface SheetCell {
  r: number
  c: number
  v: SheetCellValue
}

export interface FortuneSheetData extends Record<string, unknown> {
  name: string
  celldata: SheetCell[]
  row: number
  column: number
}

// ---------------------------------------------------------------------------
// Chart utilities
// ---------------------------------------------------------------------------

import type { ChartDataPoint } from '@/lib/types/charts'

// ---------------------------------------------------------------------------
// Internal helpers — handle both storage formats returned by FortuneSheet
//
// Initialization format (our own, from tableDataToSheetData):
//   sheet.celldata = [{ r, c, v: { v, m, t, bl } }]
//
// Live format (returned by workbookRef.current?.getAllSheets() after mount):
//   sheet.data = CellValue[][]  — dense 2-D array, each cell is { v, m, ct, bl }
//   The `t` field we set is gone; numeric cells have ct: { t: 'n', fa: '...' }
//   or we can simply check typeof v === 'number'.
// ---------------------------------------------------------------------------

type RawCell = Record<string, unknown> | null | undefined

function rawCellToString(cell: RawCell, colIndex: number): string {
  if (!cell) return `Sloupec ${colIndex + 1}`
  const v = cell.v ?? cell.m
  const s = v != null ? String(v) : ''
  return s.trim() || `Sloupec ${colIndex + 1}`
}

function rawCellToNumber(cell: RawCell): number | null {
  if (!cell) return null
  const v = cell.v
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v !== '') {
    const n = parseFloat(v.replace(',', '.'))
    return isNaN(n) ? null : n
  }
  return null
}

/**
 * Returns the column header strings from row 0 of a sheet, sorted by column index.
 * Works with both the sparse `celldata` format and the dense `data` 2-D array.
 */
export function extractColumnHeaders(sheet: FortuneSheetData): string[] {
  // Sparse celldata format (our own initialization format)
  if (Array.isArray(sheet?.celldata) && sheet.celldata.length > 0) {
    return sheet.celldata
      .filter(cell => cell.r === 0)
      .sort((a, b) => a.c - b.c)
      .map((cell, i) => String(cell.v.v ?? cell.v.m ?? `Sloupec ${i + 1}`))
  }

  // Dense data 2-D array (FortuneSheet internal format after mount)
  const data = (sheet as Record<string, unknown>).data
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return (data[0] as RawCell[])
      .map((cell, i) => rawCellToString(cell, i))
      .filter(h => !h.startsWith('Sloupec ') || h === 'Sloupec 1') // keep explicit empty-string headers out
  }

  return []
}

/**
 * Returns all numeric values in `colIndex` for rows r ≥ 1, in row order.
 * Works with both the sparse `celldata` format and the dense `data` 2-D array.
 */
export function extractColumnData(sheet: FortuneSheetData, colIndex: number): (number | null)[] {
  // Sparse celldata format
  if (Array.isArray(sheet?.celldata) && sheet.celldata.length > 0) {
    const maxRow = sheet.celldata.reduce((max, c) => Math.max(max, c.r), 0)
    const result: (number | null)[] = []
    for (let r = 1; r <= maxRow; r++) {
      const cell = sheet.celldata.find(c => c.r === r && c.c === colIndex)
      // accept our own t:'n' flag OR simply a numeric v value
      const v = cell?.v?.v
      const isNum = cell?.v?.t === 'n' || typeof v === 'number'
      result.push((isNum && v != null) ? (v as number) : null)
    }
    return result
  }

  // Dense data 2-D array
  const data = (sheet as Record<string, unknown>).data
  if (!Array.isArray(data)) return []
  const result: (number | null)[] = []
  for (let r = 1; r < data.length; r++) {
    const row = data[r]
    const cell: RawCell = Array.isArray(row) ? (row as RawCell[])[colIndex] : null
    result.push(rawCellToNumber(cell))
  }
  return result
}

/**
 * Zips the xHeader column and one or more yHeaders columns into a ChartDataPoint array.
 * Rows where x is null are excluded. Each point has shape { x, [yKey]: value }.
 */
export function buildChartData(
  sheet: FortuneSheetData,
  xHeader: string,
  yHeaders: string[]
): ChartDataPoint[] {
  const headers = extractColumnHeaders(sheet)
  const xIndex = headers.indexOf(xHeader)
  if (xIndex === -1) return []

  const yIndices = yHeaders.map(h => headers.indexOf(h)).filter(i => i !== -1)
  if (yIndices.length === 0) return []

  const xValues = extractColumnData(sheet, xIndex)
  const yColumns = yIndices.map(i => extractColumnData(sheet, i))

  const points: ChartDataPoint[] = []
  for (let i = 0; i < xValues.length; i++) {
    const x = xValues[i]
    if (x === null) continue
    const point: ChartDataPoint = { x }
    yIndices.forEach((_, j) => {
      point[yHeaders[j]] = yColumns[j][i]
    })
    points.push(point)
  }
  return points
}

// ---------------------------------------------------------------------------

export function tableDataToSheetData(tables: ExtractedTable[]): FortuneSheetData[] {
  return tables.map((table, sheetIndex) => {
    const celldata: SheetCell[] = []

    table.headers.forEach((header, col) => {
      celldata.push({
        r: 0,
        c: col,
        v: { v: header, m: header, t: 's', bl: 1 },
      })
    })

    table.rows.forEach((row, rowIndex) => {
      row.forEach((value, col) => {
        const isNumber = typeof value === 'number'
        celldata.push({
          r: rowIndex + 1,
          c: col,
          v: {
            v: value,
            m: isNumber ? String(value).replace('.', ',') : String(value ?? ''),
            t: isNumber ? 'n' : 's',
          },
        })
      })
    })

    const summaryStart = table.rows.length + 2
    table.summary_rows.forEach((summaryRow, index) => {
      const r = summaryStart + index
      celldata.push({
        r,
        c: 0,
        v: { v: summaryRow.label, m: summaryRow.label, t: 's', bl: 1 },
      })

      summaryRow.values.forEach((value, col) => {
        if (value === null) {
          return
        }

        celldata.push({
          r,
          c: col + 1,
          v: {
            v: value,
            m: String(value).replace('.', ','),
            t: 'n',
          },
        })
      })
    })

    return {
      name: `Tabulka ${sheetIndex + 1}`,
      celldata,
      row: Math.max(20, table.rows.length + table.summary_rows.length + 5),
      column: Math.max(10, table.headers.length + 2),
    }
  })
}
