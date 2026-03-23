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
