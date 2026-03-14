"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Workbook, type WorkbookInstance } from "@fortune-sheet/react"
import "@fortune-sheet/react/dist/index.css"

import { SimpleEditor } from "@/components/tiptap-templates/simple/simple-editor"

const MIN_LEFT_PANE_PERCENT = 20
const MAX_LEFT_PANE_PERCENT = 80

const INITIAL_SHEETS = [{ name: "Sheet 1" }]

const clampPaneSize = (value: number) => {
  if (value < MIN_LEFT_PANE_PERCENT) return MIN_LEFT_PANE_PERCENT
  if (value > MAX_LEFT_PANE_PERCENT) return MAX_LEFT_PANE_PERCENT
  return value
}

/**
 * Replaces Czech decimal commas with dots in a plain-text string.
 * Handles:
 *   "1,23"        → "1.23"
 *   "1,23 4,56"   → "1.23 4.56"   (multiple values, e.g. pasted column)
 *   "=A1*1,5"     → "=A1*1.5"     (simple formulas without parens)
 *   "=SUM(1,2)"   → untouched      (function argument separator — leave alone)
 */
const czechToDecimalDot = (text: string): string => {
  if (text.startsWith("=")) {
    if (text.includes("(") || text.includes(")")) return text
    return text.replace(/(\d),(\d)/g, "$1.$2")
  }
  // Replace any digit,digit pattern (covers pasted tables with multiple cells)
  return text.replace(/(\d),(\d)/g, "$1.$2")
}

export default function TextEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const dataPaneRef = useRef<HTMLDivElement>(null)
  const workbookRef = useRef<WorkbookInstance | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [leftPanePercent, setLeftPanePercent] = useState(50)

  // ── Paste interception ───────────────────────────────────────────────────
  // fortune-sheet reads pasted text from the clipboard directly, so we
  // intercept the paste event on the sheet container, rewrite the clipboard
  // data before fortune-sheet sees it, then re-fire the event.
  useEffect(() => {
    const pane = dataPaneRef.current
    if (!pane) return

    const handlePaste = async (e: ClipboardEvent) => {
      const original = e.clipboardData?.getData("text/plain")
      if (!original) return

      const rewritten = czechToDecimalDot(original)
      if (rewritten === original) return

      // Stop fortune-sheet from reading the original clipboard
      e.stopImmediatePropagation()
      e.preventDefault()

      // Write the cleaned text into the clipboard, let fortune-sheet paste it
      try {
        await navigator.clipboard.writeText(rewritten)
        // Re-dispatch a paste event — fortune-sheet will now read the clean text
        const newPaste = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: e.clipboardData,
        })
        // Override clipboardData with rewritten text via DataTransfer
        const dt = new DataTransfer()
        dt.setData("text/plain", rewritten)
        Object.defineProperty(newPaste, "clipboardData", { value: dt })
        e.target?.dispatchEvent(newPaste)
      } catch {
        // Clipboard API blocked (e.g. no permission) — fall back to DataTransfer
        const dt = new DataTransfer()
        dt.setData("text/plain", rewritten)
        const newPaste = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
        })
        Object.defineProperty(newPaste, "clipboardData", { value: dt })
        e.target?.dispatchEvent(newPaste)
      }
    }

    // useCapture=true so we intercept before fortune-sheet's own listener
    pane.addEventListener("paste", handlePaste, true)
    return () => pane.removeEventListener("paste", handlePaste, true)
  }, [])

  // ── Cell input interception (typed input, not paste) ─────────────────────
  // fortune-sheet renders an <input> or contenteditable when editing a cell.
  // We watch for that element and fix commas on blur before the value commits.
  useEffect(() => {
    const pane = dataPaneRef.current
    if (!pane) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== "Tab") return
      const target = e.target as HTMLElement
      if (!target) return

      // fortune-sheet's cell input is a textarea or input inside the sheet
      if (
        target.tagName === "TEXTAREA" ||
        target.tagName === "INPUT" ||
        target.isContentEditable
      ) {
        const raw =
          target.tagName === "TEXTAREA" || target.tagName === "INPUT"
            ? (target as HTMLInputElement | HTMLTextAreaElement).value
            : (target as HTMLElement).innerText
        const fixed = czechToDecimalDot(raw)
        if (fixed !== raw) {
          if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
            (target as HTMLInputElement | HTMLTextAreaElement).value = fixed
          } else {
            (target as HTMLElement).innerText = fixed
          }
        }
      }
    }

    // Also intercept on the formula bar input that fortune-sheet uses
    const handleInput = (e: Event) => {
      const target = e.target as HTMLElement
      if (!target) return
      if (
        target.tagName !== "TEXTAREA" &&
        target.tagName !== "INPUT" &&
        !target.isContentEditable
      )
        return

      // Only rewrite while the user is mid-type if they typed a comma after a digit
      const raw =
        target.tagName === "TEXTAREA" || target.tagName === "INPUT"
          ? (target as HTMLInputElement | HTMLTextAreaElement).value
          : (target as HTMLElement).innerText
      // We only auto-replace when the pattern is unambiguous (digit,digit)
      // so we don't break formula argument commas
      if (!raw.startsWith("=") && /\d,\d/.test(raw)) {
        const fixed = czechToDecimalDot(raw)
        if (fixed !== raw) {
          const pos =
            target.tagName === "TEXTAREA" || target.tagName === "INPUT"
              ? (target as HTMLInputElement).selectionStart
              : null
          if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
            (target as HTMLInputElement | HTMLTextAreaElement).value = fixed
          } else {
            (target as HTMLElement).innerText = fixed
          }
          // Restore cursor position
          if (
            pos !== null &&
            (target.tagName === "TEXTAREA" || target.tagName === "INPUT")
          ) {
            (target as HTMLInputElement).setSelectionRange(pos, pos)
          }
        }
      }
    }

    pane.addEventListener("keydown", handleKeyDown, true)
    pane.addEventListener("input", handleInput, true)
    return () => {
      pane.removeEventListener("keydown", handleKeyDown, true)
      pane.removeEventListener("input", handleInput, true)
    }
  }, [])

  // ── Splitter logic ───────────────────────────────────────────────────────
  const resizeFromClientX = useCallback((clientX: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (rect.width <= 0) return
    const relativeX = clientX - rect.left
    const nextPercent = (relativeX / rect.width) * 100
    setLeftPanePercent(clampPaneSize(nextPercent))
  }, [])

  const handlePointerMove = useCallback(
    (event: PointerEvent) => resizeFromClientX(event.clientX),
    [resizeFromClientX]
  )

  const stopDragging = useCallback(() => setIsDragging(false), [])

  const startDragging = useCallback(
    (clientX: number) => {
      resizeFromClientX(clientX)
      setIsDragging(true)
    },
    [resizeFromClientX]
  )

  useEffect(() => {
    if (!isDragging) return
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", stopDragging)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopDragging)
    }
  }, [handlePointerMove, isDragging, stopDragging])

  useEffect(() => {
    const element = dataPaneRef.current
    if (!element) return
    const observer = new ResizeObserver(() =>
      window.dispatchEvent(new Event("resize"))
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="flex h-full min-h-0 min-w-0 flex-1">
      {/* ── Left pane: TipTap editor ── */}
      <section
        className="h-full min-h-0 min-w-0 overflow-hidden"
        style={{ width: `${leftPanePercent}%` }}
      >
        <SimpleEditor />
      </section>

      {/* ── Divider ── */}
      <div className="relative h-full w-px shrink-0 bg-border">
        <button
          type="button"
          role="separator"
          aria-label="Resize editor and data panels"
          aria-orientation="vertical"
          aria-valuenow={Math.round(leftPanePercent)}
          aria-valuemin={MIN_LEFT_PANE_PERCENT}
          aria-valuemax={MAX_LEFT_PANE_PERCENT}
          className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 cursor-col-resize bg-transparent outline-none focus-visible:bg-border/60"
          onPointerDown={(e) => {
            e.preventDefault()
            startDragging(e.clientX)
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault()
              setLeftPanePercent((prev) => clampPaneSize(prev - 2))
            }
            if (e.key === "ArrowRight") {
              e.preventDefault()
              setLeftPanePercent((prev) => clampPaneSize(prev + 2))
            }
          }}
        />
      </div>

      {/* ── Right pane: fortune-sheet ── */}
      <section
        ref={dataPaneRef}
        className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        style={{ width: `${100 - leftPanePercent}%` }}
      >
        <div className="flex h-11 shrink-0 items-center border-b px-4 text-sm font-medium text-foreground">
          Data
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
          <Workbook
            ref={workbookRef}
            data={INITIAL_SHEETS}
            lang="en"
          />
        </div>
      </section>
    </div>
  )
}
