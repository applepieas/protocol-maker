export type Call2SummaryRow = {
  label: string
  values: Array<number | string | null>
}

export type Call2Table = {
  id: string
  headers: string[]
  units?: string[]
  rows: Array<Array<number | string | null>>
  summary_rows?: Call2SummaryRow[]
}

export type FortuneSheetCell = {
  v: number | string | null
}

export type FortuneSheetData = {
  name: string
  celldata: Array<{
    r: number
    c: number
    v: FortuneSheetCell
  }>
}

export function tableDataToSheetData(tables: Call2Table[]): FortuneSheetData[] {
  return tables.map((table, tableIndex) => {
    const celldata: FortuneSheetData['celldata'] = []
    let rowIndex = 0

    table.headers.forEach((header, columnIndex) => {
      celldata.push({
        r: rowIndex,
        c: columnIndex,
        v: { v: header },
      })
    })

    rowIndex += 1

    for (const row of table.rows) {
      row.forEach((value, columnIndex) => {
        celldata.push({
          r: rowIndex,
          c: columnIndex,
          v: { v: value },
        })
      })

      rowIndex += 1
    }

    if (table.summary_rows && table.summary_rows.length > 0) {
      rowIndex += 1

      for (const summaryRow of table.summary_rows) {
        celldata.push({
          r: rowIndex,
          c: 0,
          v: { v: summaryRow.label },
        })

        summaryRow.values.forEach((value, columnIndex) => {
          celldata.push({
            r: rowIndex,
            c: columnIndex + 1,
            v: { v: value },
          })
        })

        rowIndex += 1
      }
    }

    return {
      name: table.id || `Table ${tableIndex + 1}`,
      celldata,
    }
  })
}