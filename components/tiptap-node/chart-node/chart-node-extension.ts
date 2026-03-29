import { mergeAttributes, Node } from "@tiptap/react"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { ChartNodeComponent } from "@/components/tiptap-node/chart-node/chart-node"
import type { FortuneSheetData } from "@/lib/utils/sheet"
import type { ChartNodeAttrs } from "@/lib/types/charts"

export interface ChartNodeOptions {
  getSheetData?: () => FortuneSheetData[]
}

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    chartNode: {
      insertChartNode: (attrs: ChartNodeAttrs) => ReturnType
      updateChartNode: (attrs: Partial<ChartNodeAttrs>) => ReturnType
    }
  }
}

export const ChartNode = Node.create<ChartNodeOptions>({
  name: "chartNode",

  group: "block",

  draggable: true,

  selectable: true,

  atom: true,

  addOptions() {
    return {
      getSheetData: undefined,
    }
  },

  addAttributes() {
    return {
      chartType: { default: "scatter_line" },
      pointShape: { default: "cross" },
      title: { default: "" },
      xKey: { default: "" },
      yKeys: { default: [] },
      sheetName: { default: "" },
      chartData: { default: [] },
      width: { default: 600 },
      height: { default: 400 },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="chart-node"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-type": "chart-node" },
        {
          "data-chart-type": HTMLAttributes.chartType,
          "data-title": HTMLAttributes.title,
        }
      ),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartNodeComponent)
  },

  addCommands() {
    return {
      insertChartNode:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),

      updateChartNode:
        (attrs) =>
        ({ tr, state, dispatch }) => {
          const { selection } = state
          const node = selection instanceof Object && "node" in selection
            ? (selection as { node: { type: { name: string }; attrs: ChartNodeAttrs } }).node
            : null
          if (!node || node.type.name !== this.name) return false
          const from = (selection as { from: number }).from
          if (dispatch) {
            tr.setNodeMarkup(from, undefined, { ...node.attrs, ...attrs })
          }
          return true
        },
    }
  },
})

export default ChartNode
