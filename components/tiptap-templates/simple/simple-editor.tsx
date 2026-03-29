"use client"

import { useEffect, useRef, useState } from "react"
import { EditorContent, EditorContext, useEditor, type Editor } from "@tiptap/react"

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit"
import { Image } from "@tiptap/extension-image"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Selection } from "@tiptap/extensions"
import { Mathematics } from "@tiptap/extension-mathematics"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

// --- Tiptap Node ---
import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension"
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension"
import { ChartNode } from "@/components/tiptap-node/chart-node/chart-node-extension"
import "@/components/tiptap-node/chart-node/chart-node.scss"
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/image-node/image-node.scss"
import "@/components/tiptap-node/heading-node/heading-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"

// --- Tiptap UI ---
import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu"
import { ImageUploadButton } from "@/components/tiptap-ui/image-upload-button"
import { InsertChartButton } from "@/components/tiptap-ui/insert-chart-button/insert-chart-button"
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu"
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button"
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "@/components/tiptap-ui/color-highlight-popover"
import {
  LinkPopover,
  LinkContent,
  LinkButton,
} from "@/components/tiptap-ui/link-popover"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { TextAlignButton } from "@/components/tiptap-ui/text-align-button"
import { UndoRedoButton } from "@/components/tiptap-ui/undo-redo-button"

// --- Icons ---
import { ArrowLeftIcon } from "@/components/tiptap-icons/arrow-left-icon"
import { HighlighterIcon } from "@/components/tiptap-icons/highlighter-icon"
import { LinkIcon } from "@/components/tiptap-icons/link-icon"

// --- Hooks ---
import { useIsBreakpoint } from "@/hooks/use-is-breakpoint"
import { useWindowSize } from "@/hooks/use-window-size"
import { useCursorVisibility } from "@/hooks/use-cursor-visibility"

// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from "@/lib/tiptap-utils"
import type { FortuneSheetData } from "@/lib/utils/sheet"
import type { ChartSuggestion } from "@/lib/types/charts"
import { buildChartData } from "@/lib/utils/sheet"

// --- Styles ---
import "@/components/tiptap-templates/simple/simple-editor.scss"
import "katex/dist/katex.min.css"

import content from "@/components/tiptap-templates/simple/data/content.json"

type SimpleEditorProps = {
  initialContent?: object
  getSheetData?: () => FortuneSheetData[]
  autoInsertCharts?: Array<{ suggestion: ChartSuggestion; sheets: FortuneSheetData[] }>
}

const MainToolbarContent = ({
  onHighlighterClick,
  onLinkClick,
  isMobile,
  editor,
  getSheetData,
}: {
  onHighlighterClick: () => void
  onLinkClick: () => void
  isMobile: boolean
  editor: Editor | null
  getSheetData?: () => FortuneSheetData[]
}) => {
  const handleInsertInlineMath = () => {
    if (!editor?.isEditable) return

    const latex = window.prompt("Insert LaTeX formula", "E=mc^2")
    if (latex === null) return

    const value = latex.trim()
    if (!value) return

    editor.chain().focus().insertInlineMath({ latex: value }).run()
  }

  return (
    <>
      <Spacer />

      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu modal={false} levels={[1, 2, 3, 4]} />
        <ListDropdownMenu
          modal={false}
          types={["bulletList", "orderedList", "taskList"]}
        />
        <BlockquoteButton />
        <CodeBlockButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <Button
          type="button"
          variant="ghost"
          tooltip="Insert formula"
          onClick={handleInsertInlineMath}
          disabled={!editor?.isEditable}
          tabIndex={-1}
        >
          <span className="tiptap-button-text">f(x)</span>
        </Button>
        <MarkButton type="underline" />
        {!isMobile ? (
          <ColorHighlightPopover />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )}
        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="superscript" />
        <MarkButton type="subscript" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ImageUploadButton text="Add" />
        {getSheetData && <InsertChartButton getSheetData={getSheetData} />}
      </ToolbarGroup>

      <Spacer />

      {isMobile && <ToolbarSeparator />}
    </>
  )
}

const MobileToolbarContent = ({
  type,
  onBack,
}: {
  type: "highlighter" | "link"
  onBack: () => void
}) => (
  <>
    <ToolbarGroup>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeftIcon className="tiptap-button-icon" />
        {type === "highlighter" ? (
          <HighlighterIcon className="tiptap-button-icon" />
        ) : (
          <LinkIcon className="tiptap-button-icon" />
        )}
      </Button>
    </ToolbarGroup>

    <ToolbarSeparator />

    {type === "highlighter" ? (
      <ColorHighlightPopoverContent />
    ) : (
      <LinkContent />
    )}
  </>
)

export function SimpleEditor({ initialContent, getSheetData, autoInsertCharts }: SimpleEditorProps) {
  const isMobile = useIsBreakpoint()
  const { height } = useWindowSize()
  const lastAppliedInitialContentRef = useRef<string | null>(null)
  const didAutoInsertChartsRef = useRef(false)
  const [overlayHeight, setOverlayHeight] = useState(0)
  const [mobileView, setMobileView] = useState<"main" | "highlighter" | "link">(
    "main"
  )
  const toolbarRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": "Main content area, start typing to enter text.",
        class: "simple-editor",
      },
    },
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
        link: {
          openOnClick: false,
          enableClickSelection: true,
        },
      }),
      HorizontalRule,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image,
      Typography,
      Superscript,
      Subscript,
      Selection,
      Mathematics.configure({
        katexOptions: {
          throwOnError: false,
        },
      }),
      ImageUploadNode.configure({
        accept: "image/*",
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        onError: (error) => console.error("Upload failed:", error),
      }),
      ChartNode.configure({
        getSheetData,
      }),
    ],
    content: initialContent ?? content,
  })

  // Auto-insert AI-suggested charts once when editor and sheets are ready
  useEffect(() => {
    if (!editor || !autoInsertCharts?.length || didAutoInsertChartsRef.current) return
    didAutoInsertChartsRef.current = true
    for (const { suggestion, sheets } of autoInsertCharts) {
      const tableNum = parseInt(suggestion.table_id.replace("table_", ""), 10)
      const sheet = sheets[isNaN(tableNum) ? 0 : tableNum - 1] ?? sheets[0]
      if (!sheet) continue
      const chartData = buildChartData(sheet, suggestion.x_header, suggestion.y_headers)
      editor.chain().insertChartNode({
        chartType: suggestion.chart_type,
        title: suggestion.title,
        xKey: suggestion.x_header,
        yKeys: suggestion.y_headers,
        sheetName: sheet.name,
        chartData,
        width: 600,
        height: 400,
      }).run()
    }
  }, [editor, autoInsertCharts])

  useEffect(() => {
    if (!editor || !initialContent) {
      return
    }

    let serialized: string
    try {
      serialized = JSON.stringify(initialContent)
    } catch (error) {
      console.error("[simple-editor] Failed to serialize initial content", error)
      return
    }

    if (lastAppliedInitialContentRef.current === serialized) {
      return
    }

    try {
      editor.commands.setContent(initialContent, { emitUpdate: false })
      lastAppliedInitialContentRef.current = serialized
      console.info("[simple-editor] Applied initial content")
    } catch (error) {
      console.error("[simple-editor] Failed to apply initial content", error)
    }
  }, [editor, initialContent])

  useEffect(() => {
    const toolbar = toolbarRef.current
    if (!toolbar) {
      return
    }

    const updateHeight = () => {
      setOverlayHeight(toolbar.getBoundingClientRect().height)
    }

    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(toolbar)

    return () => {
      observer.disconnect()
    }
  }, [])

  const rect = useCursorVisibility({
    editor,
    overlayHeight,
  })
  const activeMobileView = isMobile ? mobileView : "main"

  return (
    <div className="simple-editor-wrapper">
      <EditorContext.Provider value={{ editor }}>
        <Toolbar
          ref={toolbarRef}
          style={{
            ...(isMobile
              ? {
                bottom: `calc(100% - ${height - rect.y}px)`,
              }
              : {}),
          }}
        >
          {activeMobileView === "main" ? (
            <MainToolbarContent
              onHighlighterClick={() => setMobileView("highlighter")}
              onLinkClick={() => setMobileView("link")}
              isMobile={isMobile}
              editor={editor}
              getSheetData={getSheetData}
            />
          ) : (
            <MobileToolbarContent
              type={activeMobileView === "highlighter" ? "highlighter" : "link"}
              onBack={() => setMobileView("main")}
            />
          )}
        </Toolbar>

        <EditorContent
          editor={editor}
          role="presentation"
          className="simple-editor-content"
        />
      </EditorContext.Provider>
    </div>
  )
}
