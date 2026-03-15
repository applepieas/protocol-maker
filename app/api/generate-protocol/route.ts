import { type NextRequest, NextResponse } from 'next/server'

import { prepareStorageFiles } from '@/lib/ai/files'
import {
  CALL_1_SYSTEM_PROMPT,
  CALL_2_SYSTEM_PROMPT,
  CALL_3A_SYSTEM_PROMPT,
} from '@/lib/ai/prompts'
import { tableDataToSheetData, type Call2Table } from '@/lib/sheet'
import { createClient } from '@/lib/supabase/server'
import {
  saveProtocolOutput,
  updateProtocolStatus,
} from '@/lib/supabase/queries'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

type SSEEvent =
  | { type: 'progress'; step: 1 | 2 | 3; message: string }
  | { type: 'done'; tiptapDoc: object; sheetData: object[] }
  | { type: 'error'; message: string }

type GenerateProtocolRequestBody = {
  protocolId: string
  title: string
  zadani: string
  postup: string
  pomucky: string
  filePaths: string[]
}

type Call2Output = {
  tables: Call2Table[]
}

type OpenRouterJsonResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

const encoder = new TextEncoder()

const encodeEvent = (event: SSEEvent) =>
  encoder.encode(`data: ${JSON.stringify(event)}\n\n`)

function isValidBody(body: unknown): body is GenerateProtocolRequestBody {
  if (!body || typeof body !== 'object') {
    return false
  }

  const value = body as Partial<GenerateProtocolRequestBody>

  return Boolean(
    value.protocolId &&
    value.title &&
    value.zadani &&
    value.postup &&
    value.pomucky &&
    Array.isArray(value.filePaths)
  )
}

async function callOpenRouter(payload: Record<string, unknown>) {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured')
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`OpenRouter request failed with status ${response.status}`)
  }

  return response
}

function parseChoiceJsonPayload(responseJson: unknown): Record<string, unknown> {
  const typed = responseJson as OpenRouterJsonResponse
  const content = typed.choices?.[0]?.message?.content

  if (typeof content !== 'string') {
    throw new Error('AI response did not contain JSON content')
  }

  return JSON.parse(content) as Record<string, unknown>
}

function validateCall2Output(output: Call2Output) {
  if (!Array.isArray(output.tables)) {
    throw new Error('Call 2 output is missing tables array')
  }

  for (const table of output.tables) {
    if (!table.headers || !Array.isArray(table.rows)) {
      throw new Error(`Invalid table structure for ${table.id}`)
    }

    for (const row of table.rows) {
      if (row.length !== table.headers.length) {
        throw new Error(`Row length mismatch in ${table.id}`)
      }
    }
  }
}

function buildCommonContent(
  base64Images: string[],
  csvTexts: string[],
  notes: string[]
) {
  return [
    ...base64Images.map((img) => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${img}` },
    })),
    ...csvTexts.map((csv) => ({
      type: 'text',
      text: `CSV data:\n${csv}`,
    })),
    ...notes.map((note) => ({
      type: 'text',
      text: note,
    })),
  ]
}

export async function POST(request: NextRequest) {
  let protocolIdForErrorStatus: string | null = null

  try {
    const body = await request.json()

    if (!isValidBody(body)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    const { protocolId, title, zadani, postup, pomucky, filePaths } = body
    protocolIdForErrorStatus = protocolId

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: existingProtocol, error: protocolLookupError } = await supabase
      .from('protocols')
      .select('id')
      .eq('id', protocolId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (protocolLookupError) {
      throw new Error(protocolLookupError.message)
    }

    if (!existingProtocol) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await updateProtocolStatus(protocolId, 'generating')

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()

    void (async () => {
      try {
        await writer.write(
          encodeEvent({
            type: 'progress',
            step: 1,
            message: 'Analyzuji strukturu dat...',
          })
        )

        const { base64Images, csvTexts, notes } = await prepareStorageFiles(filePaths)
        const commonContent = buildCommonContent(base64Images, csvTexts, notes)

        const call1Response = await callOpenRouter({
          model: 'google/gemini-2.0-flash-001',
          messages: [
            { role: 'system', content: CALL_1_SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                ...commonContent,
                {
                  type: 'text',
                  text: 'Detect all separate tables and their column ranges.',
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
        })

        const call1Json = await call1Response.json()
        const tableLayout = parseChoiceJsonPayload(call1Json)

        await writer.write(
          encodeEvent({
            type: 'progress',
            step: 2,
            message: 'Extrahuji a normalizuji tabulky...',
          })
        )

        const runCall2 = async (validationError?: string): Promise<Call2Output> => {
          const call2Response = await callOpenRouter({
            model: 'google/gemini-2.0-flash-001',
            messages: [
              { role: 'system', content: CALL_2_SYSTEM_PROMPT },
              {
                role: 'user',
                content: [
                  ...commonContent,
                  {
                    type: 'text',
                    text: `Layout JSON:\n${JSON.stringify(tableLayout)}`,
                  },
                  ...(validationError
                    ? [
                      {
                        type: 'text',
                        text: `Validation failed: ${validationError}`,
                      },
                    ]
                    : []),
                ],
              },
            ],
            response_format: { type: 'json_object' },
          })

          const call2Json = await call2Response.json()
          const parsed = parseChoiceJsonPayload(call2Json)
          return parsed as unknown as Call2Output
        }

        let call2Output = await runCall2()

        try {
          validateCall2Output(call2Output)
        } catch (validationError) {
          const retryValidationMessage =
            validationError instanceof Error
              ? validationError.message
              : 'Unknown validation error'

          call2Output = await runCall2(retryValidationMessage)
          validateCall2Output(call2Output)
        }

        await writer.write(
          encodeEvent({
            type: 'progress',
            step: 3,
            message: 'Píšu protokol...',
          })
        )

        const call3AResponse = await callOpenRouter({
          model: 'google/gemini-2.0-flash-001',
          messages: [
            { role: 'system', content: CALL_3A_SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `title: ${title}\nzadani: ${zadani}\npostup: ${postup}\npomucky: ${pomucky}\nvalidated_table_data: ${JSON.stringify(
                    call2Output
                  )}`,
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
        })

        const call3AJson = await call3AResponse.json()
        const tiptapDoc = parseChoiceJsonPayload(call3AJson)
        const sheetData = tableDataToSheetData(call2Output.tables)

        await saveProtocolOutput(protocolId, tiptapDoc, sheetData)
        await updateProtocolStatus(protocolId, 'done')

        await writer.write(
          encodeEvent({
            type: 'done',
            tiptapDoc,
            sheetData,
          })
        )
      } catch (error) {
        if (protocolIdForErrorStatus) {
          try {
            await updateProtocolStatus(protocolIdForErrorStatus, 'error')
          } catch {
            // Ignore secondary status update errors.
          }
        }

        await writer.write(
          encodeEvent({
            type: 'error',
            message:
              error instanceof Error ? error.message : 'Generování protokolu selhalo.',
          })
        )
      } finally {
        await writer.close()
      }
    })()

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    if (protocolIdForErrorStatus) {
      try {
        await updateProtocolStatus(protocolIdForErrorStatus, 'error')
      } catch {
        // Ignore secondary failures while handling a primary error.
      }
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate protocol',
      },
      { status: 500 }
    )
  }
}