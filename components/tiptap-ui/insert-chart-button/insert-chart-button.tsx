"use client"

import { useState } from "react"

import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { BarChartIcon } from "@/components/tiptap-icons/bar-chart-icon"
import { ChartConfigDialog } from "@/components/tiptap-node/chart-node/chart-config-dialog"
import type { FortuneSheetData } from "@/lib/utils/sheet"
import type { ChartNodeAttrs } from "@/lib/types/charts"

interface InsertChartButtonProps {
  getSheetData: () => FortuneSheetData[]
}

export function InsertChartButton({ getSheetData }: InsertChartButtonProps) {
  const { editor } = useTiptapEditor()
  const [dialogOpen, setDialogOpen] = useState(false)

  const canInsert = Boolean(editor?.isEditable)

  const handleConfirm = (attrs: ChartNodeAttrs) => {
    editor?.chain().focus().insertChartNode(attrs).run()
    setDialogOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        tooltip="Vložit graf"
        disabled={!canInsert}
        data-disabled={!canInsert}
        tabIndex={-1}
        onClick={() => setDialogOpen(true)}
      >
        <BarChartIcon className="tiptap-button-icon" />
        <span className="tiptap-button-text">Graf</span>
      </Button>

      {dialogOpen && (
        <ChartConfigDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          getSheetData={getSheetData}
          onConfirm={handleConfirm}
        />
      )}
    </>
  )
}
