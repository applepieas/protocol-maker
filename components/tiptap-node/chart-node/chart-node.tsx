"use client"

import { useState } from "react"
import { NodeViewWrapper } from "@tiptap/react"
import type { NodeViewProps } from "@tiptap/react"
import {
  ComposedChart,
  Line,
  Scatter,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

import { ChartConfigDialog } from "@/components/tiptap-node/chart-node/chart-config-dialog"
import type { ChartNodeAttrs } from "@/lib/types/charts"
import { buildChartData } from "@/lib/utils/sheet"
import type { FortuneSheetData } from "@/lib/utils/sheet"
import { cn } from "@/lib/utils"

// Distinct colors for each series
const SERIES_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed"]

interface ChartNodeExtensionOptions {
  getSheetData?: () => FortuneSheetData[]
}

/** Convert "U (V)" → "U/V", "I_i (A)" → "I_i/A" */
function formatAxisLabel(key: string): string {
  return key.replace(/\s*\(([^)]+)\)$/, "/$1")
}

/** Custom scatter point shapes */
function makePointShape(pointShape: ChartNodeAttrs["pointShape"], color: string) {
  return function PointShape(props: { cx?: number; cy?: number }) {
    const cx = props.cx ?? 0
    const cy = props.cy ?? 0
    const s = 5
    if (pointShape === "circle") {
      return <circle cx={cx} cy={cy} r={s} fill={color} />
    }
    if (pointShape === "diamond") {
      return (
        <polygon
          points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`}
          fill={color}
        />
      )
    }
    if (pointShape === "square") {
      return <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2} fill={color} />
    }
    // cross (default)
    return (
      <g>
        <line x1={cx - s} y1={cy} x2={cx + s} y2={cy} stroke={color} strokeWidth={2} />
        <line x1={cx} y1={cy - s} x2={cx} y2={cy + s} stroke={color} strokeWidth={2} />
      </g>
    )
  }
}

export function ChartNodeComponent(props: NodeViewProps) {
  const attrs = props.node.attrs as ChartNodeAttrs
  const [hovered, setHovered] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const getSheetData = (props.extension.options as ChartNodeExtensionOptions).getSheetData

  const handleRefresh = () => {
    if (!getSheetData) return
    const sheets = getSheetData()
    const sheet = sheets.find(s => s.name === attrs.sheetName) ?? sheets[0]
    if (!sheet) return
    const freshData = buildChartData(sheet, attrs.xKey, attrs.yKeys)
    props.updateAttributes({ chartData: freshData })
  }

  const handleDelete = () => {
    const pos = props.getPos()
    if (typeof pos !== "number") return
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + props.node.nodeSize })
      .run()
  }

  const handleConfirm = (newAttrs: ChartNodeAttrs) => {
    props.updateAttributes(newAttrs)
    setDialogOpen(false)
  }

  const isEmpty = attrs.chartData.length === 0 || attrs.xKey === ""
  const pointShape = attrs.pointShape ?? "cross"

  // Y axis label: join all yKeys formatted, or just first
  const yAxisLabel = attrs.yKeys.map(formatAxisLabel).join(", ")
  const xAxisLabel = formatAxisLabel(attrs.xKey)

  return (
    <NodeViewWrapper
      className={cn(
        "chart-node-wrapper",
        hovered && "chart-node-wrapper--hovered"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-drag-handle
    >
      {/* Overlay toolbar */}
      {hovered && (
        <div className="chart-node-overlay">
          <button
            type="button"
            className="chart-node-overlay-btn"
            onClick={() => setDialogOpen(true)}
            title="Upravit graf"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
            Upravit
          </button>

          {getSheetData && (
            <button
              type="button"
              className="chart-node-overlay-btn"
              onClick={handleRefresh}
              title="Obnovit data z tabulky"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
              </svg>
              Obnovit
            </button>
          )}

          <button
            type="button"
            className="chart-node-overlay-btn chart-node-overlay-btn--danger"
            onClick={handleDelete}
            title="Smazat graf"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
            Smazat
          </button>
        </div>
      )}

      {/* Chart title */}
      {attrs.title && (
        <p className="chart-node-title">{attrs.title}</p>
      )}

      {/* Empty state */}
      {isEmpty ? (
        <div className="chart-node-empty">
          <p>Graf nemá žádná data. Klikněte na Upravit a vyberte sloupce.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={attrs.height}>
          <ComposedChart
            data={attrs.chartData}
            margin={{ top: 8, right: 24, bottom: 32, left: 16 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e5e7eb)" />
            <XAxis
              dataKey="x"
              type={attrs.chartType === "bar" ? "category" : "number"}
              name={attrs.xKey}
              label={{
                value: xAxisLabel,
                position: "insideBottom",
                offset: -16,
                fontSize: 12,
              }}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              width={52}
              label={{
                value: yAxisLabel,
                angle: -90,
                position: "insideLeft",
                offset: 12,
                style: { textAnchor: "middle", fontSize: 12 },
              }}
            />
            <Tooltip
              formatter={(value, name) => [value, name]}
              labelFormatter={label => `${xAxisLabel}: ${label}`}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

            {attrs.yKeys.map((yKey, i) => {
              const color = SERIES_COLORS[i % SERIES_COLORS.length]
              const formattedName = formatAxisLabel(yKey)

              if (attrs.chartType === "bar") {
                return (
                  <Bar key={yKey} dataKey={yKey} fill={color} name={formattedName} />
                )
              }
              if (attrs.chartType === "line") {
                return (
                  <Line
                    key={yKey}
                    type="linear"
                    dataKey={yKey}
                    stroke={color}
                    dot={{ r: 3, fill: color }}
                    name={formattedName}
                    connectNulls
                  />
                )
              }
              // scatter_line: scatter points + connecting line
              // Legend entry comes from Line (line icon), not Scatter (dot icon)
              return [
                <Scatter
                  key={`${yKey}-scatter`}
                  dataKey={yKey}
                  fill={color}
                  legendType="none"
                  name={formattedName}
                  shape={makePointShape(pointShape, color)}
                />,
                <Line
                  key={`${yKey}-line`}
                  type="linear"
                  dataKey={yKey}
                  stroke={color}
                  dot={false}
                  name={formattedName}
                  connectNulls
                />,
              ]
            })}
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Edit dialog */}
      {dialogOpen && (
        <ChartConfigDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          getSheetData={getSheetData ?? (() => [])}
          initialAttrs={attrs}
          onConfirm={handleConfirm}
        />
      )}
    </NodeViewWrapper>
  )
}
