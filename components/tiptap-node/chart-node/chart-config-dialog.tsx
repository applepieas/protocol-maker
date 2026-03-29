"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { FortuneSheetData } from "@/lib/utils/sheet"
import { extractColumnHeaders, buildChartData } from "@/lib/utils/sheet"
import type { ChartNodeAttrs } from "@/lib/types/charts"

interface ChartConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  getSheetData: () => FortuneSheetData[]
  initialAttrs?: Partial<ChartNodeAttrs>
  onConfirm: (attrs: ChartNodeAttrs) => void
}

const CHART_TYPE_LABELS: Record<ChartNodeAttrs['chartType'], string> = {
  scatter_line: "Bodový + přímka",
  line: "Čárový",
  bar: "Sloupcový",
}

const POINT_SHAPE_LABELS: Record<ChartNodeAttrs['pointShape'], string> = {
  cross: "Kříž (+)",
  circle: "Kruh (•)",
  diamond: "Kosočtverec (◆)",
  square: "Čtverec (■)",
}

export function ChartConfigDialog({
  open,
  onOpenChange,
  getSheetData,
  initialAttrs,
  onConfirm,
}: ChartConfigDialogProps) {
  const [sheets, setSheets] = useState<FortuneSheetData[]>([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [chartType, setChartType] = useState<ChartNodeAttrs['chartType']>(
    initialAttrs?.chartType ?? "scatter_line"
  )
  const [pointShape, setPointShape] = useState<ChartNodeAttrs['pointShape']>(
    initialAttrs?.pointShape ?? "cross"
  )
  const [title, setTitle] = useState(initialAttrs?.title ?? "")
  const [xKey, setXKey] = useState(initialAttrs?.xKey ?? "")
  const [yKeys, setYKeys] = useState<string[]>(initialAttrs?.yKeys ?? [])

  // Load sheets when dialog opens
  useEffect(() => {
    if (!open) return
    const data = getSheetData()
    setSheets(data)

    // Pre-select sheet from initialAttrs if editing
    if (initialAttrs?.sheetName) {
      const idx = data.findIndex(s => s.name === initialAttrs.sheetName)
      if (idx !== -1) setSheetIndex(idx)
    }
  }, [open, getSheetData, initialAttrs?.sheetName])

  const headers = sheets[sheetIndex] ? extractColumnHeaders(sheets[sheetIndex]) : []

  // When headers change (different sheet selected), reset x/y if they no longer exist
  useEffect(() => {
    if (!headers.length) return
    if (xKey && !headers.includes(xKey)) setXKey("")
    if (yKeys.some(k => !headers.includes(k))) setYKeys(prev => prev.filter(k => headers.includes(k)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetIndex, sheets])

  const toggleYKey = (header: string) => {
    setYKeys(prev =>
      prev.includes(header) ? prev.filter(k => k !== header) : [...prev, header]
    )
  }

  const previewCount = (() => {
    if (!sheets[sheetIndex] || !xKey || yKeys.length === 0) return 0
    const data = buildChartData(sheets[sheetIndex], xKey, yKeys)
    return data.length
  })()

  const isValid = xKey !== "" && yKeys.length > 0

  const handleConfirm = () => {
    if (!isValid || !sheets[sheetIndex]) return
    const sheet = sheets[sheetIndex]
    const chartData = buildChartData(sheet, xKey, yKeys)
    onConfirm({
      chartType,
      pointShape,
      title,
      xKey,
      yKeys,
      sheetName: sheet.name,
      chartData,
      width: initialAttrs?.width ?? 600,
      height: initialAttrs?.height ?? 400,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initialAttrs?.xKey ? "Upravit graf" : "Vložit graf"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Chart type */}
          <div className="flex flex-col gap-1.5">
            <Label>Typ grafu</Label>
            <Select value={chartType} onValueChange={v => setChartType(v as ChartNodeAttrs['chartType'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CHART_TYPE_LABELS) as ChartNodeAttrs['chartType'][]).map(type => (
                  <SelectItem key={type} value={type}>
                    {CHART_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Point shape (only for scatter/line types) */}
          {chartType !== "bar" && (
            <div className="flex flex-col gap-1.5">
              <Label>Tvar bodu</Label>
              <Select value={pointShape} onValueChange={v => setPointShape(v as ChartNodeAttrs['pointShape'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(POINT_SHAPE_LABELS) as ChartNodeAttrs['pointShape'][]).map(shape => (
                    <SelectItem key={shape} value={shape}>
                      {POINT_SHAPE_LABELS[shape]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Sheet selector (only when multiple sheets) */}
          {sheets.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label>Tabulka</Label>
              <Select
                value={String(sheetIndex)}
                onValueChange={v => setSheetIndex(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sheets.map((s, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Label>Název grafu</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Voltampérová charakteristika"
            />
          </div>

          {/* X axis */}
          <div className="flex flex-col gap-1.5">
            <Label>Osa X (nezávislá proměnná)</Label>
            <Select value={xKey} onValueChange={setXKey} disabled={headers.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder="Vyberte sloupec…" />
              </SelectTrigger>
              <SelectContent>
                {headers.map(h => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Y axes (multi-select checkboxes) */}
          <div className="flex flex-col gap-1.5">
            <Label>Osa Y (závislá proměnná)</Label>
            {headers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nejdříve vyberte tabulku</p>
            ) : (
              <div className="flex flex-col gap-1 rounded-md border p-2 max-h-36 overflow-y-auto">
                {headers
                  .filter(h => h !== xKey)
                  .map(h => (
                    <label
                      key={h}
                      className="flex items-center gap-2 cursor-pointer select-none rounded px-2 py-1 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={yKeys.includes(h)}
                        onChange={() => toggleYKey(h)}
                        className="accent-primary"
                      />
                      {h}
                    </label>
                  ))}
              </div>
            )}
          </div>

          {/* Data point preview */}
          {isValid && (
            <p className="text-xs text-muted-foreground">
              {previewCount} datových bodů
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid}>
            {initialAttrs?.xKey ? "Uložit" : "Vložit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
