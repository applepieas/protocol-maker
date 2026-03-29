export interface ChartDataPoint {
  x: number | string
  [yKey: string]: number | string | null
}

export interface ChartNodeAttrs {
  chartType: 'scatter_line' | 'line' | 'bar'
  pointShape: 'cross' | 'circle' | 'diamond' | 'square'
  title: string
  xKey: string
  yKeys: string[]
  sheetName: string
  chartData: ChartDataPoint[]
  width: number
  height: number
}

export interface ChartSuggestion {
  table_id: string
  chart_type: 'scatter_line' | 'line' | 'bar'
  x_header: string
  y_headers: string[]
  title: string
}
