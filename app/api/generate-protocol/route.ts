import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

import { saveProtocolOutput, updateProtocolStatus } from '@/lib/supabase/queries'
import { createClient } from '@/lib/supabase/server'
import {
  tableDataToSheetData,
  type ExtractedTable,
  type FortuneSheetData,
} from '@/lib/utils/sheet'

type GenerateProtocolRequest = {
  protocolId: string
  title: string
  zadani: string
  postup: string
  pomucky: string
  filePaths: string[]
}

type SSEEvent =
  | { type: 'log'; message: string }
  | { type: 'done'; tiptapDoc: object; sheetData: object[] }
  | { type: 'error'; message: string; detail?: string }

type ProcessedFile =
  | { kind: 'spreadsheet'; name: string; text: string }
  | { kind: 'image'; name: string; base64: string; mimeType: string }
  | { kind: 'document'; name: string; text: string }

const encoder = new TextEncoder()

const SYSTEM_PROMPT = `You are a Czech high school lab protocol writer and scientific data extraction engine. You receive experiment inputs and raw data files, and output a complete structured JSON object containing both the protocol document and the extracted table data.

============================================================
CRITICAL — MULTI-TABLE DETECTION IN SPREADSHEETS
============================================================
Lab spreadsheets almost always contain MULTIPLE SEPARATE TABLES placed side by side in the same rows, separated by one or more empty columns. This is the most common and most important thing to get right.

How to detect separate tables in tab-separated spreadsheet text:
- Each row is a line, each cell is separated by a tab character
- Count consecutive tab characters between data — two or more tabs in a row with no data between them = an empty column gap = a TABLE BOUNDARY
- Everything to the left of the gap is one table, everything to the right is a NEW separate table
- Each separate table has its own independent header row
- NEVER merge tables that have an empty column gap between them into one table

Example — this row contains THREE separate tables:
"I/mA\tIi/A\tU/V\tR/ohm\t\t\tčíslo měření\th/cm\tUi/V\t\t\ti\tl/cm\tUi/V"
 ← table_1: cols 1-4 →  ←gap→  ←── table_2: cols 7-9 ──→  ←gap→  ←table_3→

============================================================
NORMALIZATION RULES — apply to ALL headers
============================================================
- "ohm" or "Ohm" → Ω
- "delta" → Δ
- "micro" or "u" prefix in units → μ
- "degree" → °
- Subscripts: Ii → Iᵢ, Ui → Uᵢ, U1 → U₁, R1 → R₁
- Header format "quantity/unit" → "quantity (unit)": "I/mA" → "I (mA)", "R/ohm" → "R (Ω)"
- Czech decimal comma: all numbers use "," as decimal — parse as float by replacing "," with "."

============================================================
SUMMARY ROW DETECTION
============================================================
Rows labeled VG, průměr, avg, x̄, or any row where the first cell is a non-numeric label
and remaining cells are averages — mark as summary_rows, exclude from data rows array.

============================================================
PROTOCOL STRUCTURE — TipTap JSON
============================================================
Write a complete formal Czech lab protocol as a TipTap JSON document.
Use exactly these node structures — no deviation:

Heading:      {"type":"heading","attrs":{"level":2,"textAlign":"left"},"content":[{"type":"text","text":"..."}]}
Paragraph:    {"type":"paragraph","attrs":{"textAlign":"left"},"content":[{"type":"text","text":"..."}]}
Bold inline:  {"type":"text","marks":[{"type":"bold"}],"text":"Téma:"}
Italic:       {"type":"text","marks":[{"type":"italic"}],"text":"Protokol č.1"}
OrderedList:  {"type":"orderedList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"..."}]}]}]}
BulletList:   {"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"..."}]}]}]}

Document sections in order:
1. heading level 1 center italic: "Protokol č.1"
2. paragraph left: bold "Téma:" + regular " {title}"
3. paragraph left: bold "Datum:" + regular " {today DD. MM. YYYY}"
4. heading level 2 left: "Úkoly" → orderedList of tasks from zadání
5. heading level 2 left: "Teorie" → paragraphs with theory, formulas as plain text (R = U / I), expected results, bullet points allowed
6. heading level 2 left: "Pomůcky" → bulletList from pomůcky
7. heading level 2 left: "Postup" → orderedList of steps from postup
8. heading level 2 left: "Výsledky" → single paragraph: "Naměřené hodnoty jsou zaznamenány v tabulkách a grafech níže."
9. heading level 2 left: "Závěr" → summary vs theory, absolutní odchylka + relativní odchylka if summary_rows exist, zdroje chyb

Czech typography: decimal comma, spaces around operators, correct diacritics.
Never write placeholder text.

============================================================
OUTPUT FORMAT — respond with ONLY this JSON, nothing else
============================================================
{
  "tiptap": {
    "type": "doc",
    "content": [ ...nodes... ]
  },
  "tables": [
    {
      "id": "table_1",
      "headers": ["I (mA)", "Iᵢ (A)", "U (V)", "R (Ω)"],
      "units": ["mA", "A", "V", "Ω"],
      "rows": [
        [2.8, 0.0028, 0.007, 2.5],
        [11.1, 0.0111, 0.169, 15.225]
      ],
      "summary_rows": [
        { "label": "VG", "values": [null, null, null, 15.589] }
      ]
    }
  ]
}

No markdown fences, no explanation, no preamble. The response must be parseable by JSON.parse().`

function emit(controller: ReadableStreamDefaultController, event: SSEEvent) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
}

function createSSEErrorResponse(status: number, event: SSEEvent) {
  const stream = new ReadableStream({
    start(controller) {
      emit(controller, event)
      controller.close()
    },
  })

  return new Response(stream, {
    status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, '')}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')}MB`
}

function getFileName(path: string): string {
  return path.split('/').pop() ?? path
}

function endsWithOneOf(fileName: string, extensions: string[]) {
  const lower = fileName.toLowerCase()
  return extensions.some((extension) => lower.endsWith(extension))
}

async function preprocessFile(
  buffer: ArrayBuffer,
  fileType: string,
  fileName: string
): Promise<ProcessedFile> {
  if (fileType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')) {
    throw new Error(`PDF is not supported yet: ${fileName}`)
  }

  if (fileName.toLowerCase().endsWith('.doc')) {
    throw new Error(`Legacy .doc is not supported yet: ${fileName}`)
  }

  if (
    fileType.includes('spreadsheet') ||
    fileType.includes('excel') ||
    endsWithOneOf(fileName, ['.xlsx', '.xls'])
  ) {
    const workbook = XLSX.read(buffer, { type: 'array' })
    let text = ''

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) continue

      text += `=== Sheet: ${sheetName} ===\n`
      text += XLSX.utils.sheet_to_csv(sheet, { FS: '\t', blankrows: true })
      text += '\n\n'
    }

    return { kind: 'spreadsheet', name: fileName, text }
  }

  if (fileType.includes('csv') || fileName.toLowerCase().endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(buffer)
    return { kind: 'spreadsheet', name: fileName, text }
  }

  if (endsWithOneOf(fileName, ['.docx'])) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
    return {
      kind: 'document',
      name: fileName,
      text: result.value.trim(),
    }
  }

  if (fileType.startsWith('image/')) {
    return {
      kind: 'image',
      name: fileName,
      base64: Buffer.from(buffer).toString('base64'),
      mimeType: fileType,
    }
  }

  throw new Error(`Unsupported file type: ${fileType || 'unknown'} (${fileName})`)
}

function isValidGenerateRequest(body: unknown): body is GenerateProtocolRequest {
  if (!body || typeof body !== 'object') return false

  const value = body as Partial<GenerateProtocolRequest>
  return (
    typeof value.protocolId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.zadani === 'string' &&
    typeof value.postup === 'string' &&
    typeof value.pomucky === 'string' &&
    Array.isArray(value.filePaths) &&
    value.filePaths.every((path) => typeof path === 'string')
  )
}

function getCurrentCzechDate() {
  return new Intl.DateTimeFormat('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Prague',
  }).format(new Date())
}

function normalizeModelJson(raw: string): string {
  const trimmed = raw.trim()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) {
    const unfenced = fencedMatch[1]
      .split('\n')
      .map((line) => line.replace(/^\s*>\s?/, ''))
      .join('\n')
      .trim()

    if (unfenced.startsWith('{') || unfenced.startsWith('[')) {
      return unfenced
    }
  }

  const start = trimmed.search(/[\[{]/)
  if (start === -1) {
    return trimmed
  }

  const candidate = trimmed
    .slice(start)
    .split('\n')
    .map((line) => line.replace(/^\s*>\s?/, ''))
    .join('\n')
    .trim()

  return candidate
}

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch (error) {
    return createSSEErrorResponse(400, {
      type: 'error',
      message: 'Invalid JSON body',
      detail: error instanceof Error ? error.message : 'Request body is not valid JSON.',
    })
  }

  if (!isValidGenerateRequest(body)) {
    return createSSEErrorResponse(400, {
      type: 'error',
      message: 'Missing or invalid required fields.',
    })
  }

  const { protocolId, title, zadani, postup, pomucky, filePaths } = body

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return createSSEErrorResponse(401, {
      type: 'error',
      message: 'Unauthorized',
      detail: authError?.message,
    })
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return createSSEErrorResponse(500, {
      type: 'error',
      message: 'OPENROUTER_API_KEY is not configured.',
    })
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await updateProtocolStatus(protocolId, 'generating')

        emit(controller, { type: 'log', message: `Fetching ${filePaths.length} files from Supabase Storage...` })

        const processedFiles: ProcessedFile[] = []

        for (const path of filePaths) {
          const fileName = getFileName(path)
          const { data, error } = await supabase.storage.from('protocol-uploads').download(path)

          if (error || !data) {
            throw new Error(`Failed to download ${fileName}: ${error?.message ?? 'Missing file data'}`)
          }

          const buffer = await data.arrayBuffer()
          const mimeType = data.type || ''
          const fileSize = formatBytes(buffer.byteLength)

          if (
            mimeType.includes('spreadsheet') ||
            mimeType.includes('excel') ||
            endsWithOneOf(fileName, ['.xlsx', '.xls', '.csv'])
          ) {
            emit(controller, {
              type: 'log',
              message: `File ${fileName} (${fileSize}) — detected as spreadsheet, converting to text...`,
            })
          } else if (endsWithOneOf(fileName, ['.docx'])) {
            emit(controller, {
              type: 'log',
              message: `File ${fileName} (${fileSize}) — detected as Word document, extracting text...`,
            })
          } else if (mimeType.startsWith('image/')) {
            emit(controller, {
              type: 'log',
              message: `File ${fileName} (${fileSize}) — detected as image, converting to base64...`,
            })
          } else {
            emit(controller, {
              type: 'log',
              message: `File ${fileName} (${fileSize}) — checking for supported format...`,
            })
          }

          processedFiles.push(await preprocessFile(buffer, mimeType, fileName))
        }

        const userContent: object[] = []

        for (const file of processedFiles.filter((value): value is Extract<ProcessedFile, { kind: 'spreadsheet' }> => value.kind === 'spreadsheet')) {
          userContent.push({
            type: 'text',
            text: `SPREADSHEET FILE "${file.name}" (tab-separated, empty cells = empty tabs, empty columns = table boundaries):\n\n${file.text}`,
          })
        }

        for (const file of processedFiles.filter((value): value is Extract<ProcessedFile, { kind: 'document' }> => value.kind === 'document')) {
          userContent.push({
            type: 'text',
            text: `DOCUMENT FILE "${file.name}" (extracted raw text):\n\n${file.text}`,
          })
        }

        for (const file of processedFiles.filter((value): value is Extract<ProcessedFile, { kind: 'image' }> => value.kind === 'image')) {
          userContent.push({
            type: 'image_url',
            image_url: { url: `data:${file.mimeType};base64,${file.base64}` },
          })
        }

        userContent.push({
          type: 'text',
          text: `EXPERIMENT INPUTS:
Title: ${title}
Zadání: ${zadani}
Postup: ${postup}
Pomůcky: ${pomucky}
Today: ${getCurrentCzechDate()}

Extract all tables (remember: empty column gaps = separate tables), normalize headers, and write the full protocol.`,
        })

        emit(controller, {
          type: 'log',
          message: `Sending to Claude Sonnet 4.5 — input: ${processedFiles.length} files, 4 text fields...`,
        })
        emit(controller, { type: 'log', message: 'Odesílám data do Claude Sonnet 4.5...' })

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? '',
          },
          body: JSON.stringify({
            model: 'anthropic/claude-sonnet-4-5',
            max_tokens: 16000,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userContent },
            ],
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`OpenRouter error ${response.status}: ${errorText}`)
        }

        const completion = await response.json()
        const raw = completion.choices?.[0]?.message?.content
        if (!raw || typeof raw !== 'string') {
          throw new Error('Empty response from Claude')
        }

        emit(controller, { type: 'log', message: 'Claude responded — validating JSON structure...' })

        const normalizedRaw = normalizeModelJson(raw)

        let parsed: { tiptap: object; tables: ExtractedTable[] }
        try {
          parsed = JSON.parse(normalizedRaw)
        } catch {
          throw new Error(
            `JSON.parse failed. Raw response (first 500 chars): ${raw.slice(0, 500)}`
          )
        }

        const tiptap = parsed.tiptap as { type?: unknown; content?: unknown }
        if (!tiptap || tiptap.type !== 'doc' || !Array.isArray(tiptap.content)) {
          throw new Error(`Invalid TipTap structure. Got: ${JSON.stringify(parsed.tiptap).slice(0, 300)}`)
        }

        emit(controller, {
          type: 'log',
          message: `TipTap JSON valid — ${tiptap.content.length} top-level nodes`,
        })

        const tables = parsed.tables
        if (!Array.isArray(tables) || tables.length === 0) {
          throw new Error('No tables detected in response')
        }

        for (const table of tables) {
          if (!table.headers || !Array.isArray(table.rows)) {
            throw new Error(`Invalid table structure: ${table.id}`)
          }

          for (const row of table.rows) {
            if (row.length !== table.headers.length) {
              throw new Error(
                `Row length mismatch in ${table.id}: headers=${table.headers.length} row=${row.length} — row data: ${JSON.stringify(row)}`
              )
            }
          }
        }

        emit(controller, {
          type: 'log',
          message: `Detected ${tables.length} table(s): ${tables
            .map((table) => `${table.id} (${table.headers.length} cols, ${table.rows.length} rows)`)
            .join(', ')}`,
        })

        emit(controller, { type: 'log', message: 'Converting tables to fortune-sheet format...' })
        const sheetData: FortuneSheetData[] = tableDataToSheetData(tables)

        emit(controller, { type: 'log', message: 'Ukládám do databáze...' })
        await saveProtocolOutput(protocolId, parsed.tiptap as Record<string, unknown>, sheetData)
        await updateProtocolStatus(protocolId, 'done')

        emit(controller, { type: 'log', message: 'Done.' })
        emit(controller, {
          type: 'done',
          tiptapDoc: parsed.tiptap,
          sheetData,
        })
      } catch (error) {
        await updateProtocolStatus(protocolId, 'error').catch(() => undefined)

        const detail =
          error instanceof Error ? error.stack ?? error.message : 'Unknown error during generation.'

        emit(controller, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Protocol generation failed.',
          detail,
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
