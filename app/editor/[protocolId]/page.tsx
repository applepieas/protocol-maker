'use client'

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import TextEditor from '@/components/text-editor'
import { PageWrapper } from '@/components/page-wrapper'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

type PageState = 'generating' | 'done' | 'error'

type EditorSheetData = Array<{ name: string; [key: string]: unknown }>

type SSEEvent =
  | { type: 'log'; message: string }
  | { type: 'done'; tiptapDoc: object; sheetData: EditorSheetData }
  | { type: 'error'; message: string; detail?: string }

type ProtocolRow = {
  id: string
  user_id: string
  title: string
  zadani: string | null
  postup: string | null
  pomucky: string | null
  tiptap_doc: object | null
  sheet_data: EditorSheetData | null
  status: 'draft' | 'generating' | 'done' | 'error'
}

type GenerationPayload = {
  protocolId: string
  title: string
  zadani: string
  postup: string
  pomucky: string
  filePaths: string[]
}

const FALLBACK_TIPTAP_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

function isValidTiptapDoc(value: unknown): value is object {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const maybeDoc = value as { type?: unknown; content?: unknown }
  return maybeDoc.type === 'doc' && Array.isArray(maybeDoc.content)
}

function parseFilePaths(value: string | null): string[] | null {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

async function getProtocol(protocolId: string, userId: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('protocols')
    .select('id,user_id,title,zadani,postup,pomucky,tiptap_doc,sheet_data,status')
    .eq('id', protocolId)
    .eq('user_id', userId)
    .maybeSingle<ProtocolRow>()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('Protokol nebyl nalezen.')
  }

  return data
}

function TerminalPanel({
  lines,
  errorDetail,
  showCursor,
}: {
  lines: string[]
  errorDetail?: string | null
  showCursor?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [errorDetail, lines])

  const renderedLines = errorDetail ? errorDetail.split('\n') : lines

  return (
    <div
      ref={scrollRef}
      className="max-h-[28rem] min-h-[20rem] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300"
    >
      <div className="flex flex-col gap-2">
        {renderedLines.length > 0 ? (
          renderedLines.map((line, index) => {
            const isLast = index === renderedLines.length - 1
            return (
              <div key={`${index}-${line}`} className="break-words whitespace-pre-wrap">
                <span className="mr-2 text-zinc-500">{'>'}</span>
                <span>{line || ' '}</span>
                {showCursor && isLast ? <span className="ml-1 inline-block animate-pulse">_</span> : null}
              </div>
            )
          })
        ) : (
          <div className="break-words whitespace-pre-wrap">
            <span className="mr-2 text-zinc-500">{'>'}</span>
            <span>Čekám na logy...</span>
            {showCursor ? <span className="ml-1 inline-block animate-pulse">_</span> : null}
          </div>
        )}
      </div>
    </div>
  )
}

export default function EditorProtocolPage() {
  const params = useParams<{ protocolId: string }>()
  const protocolId = params.protocolId
  const router = useRouter()
  const searchParams = useSearchParams()

  const [state, setState] = useState<PageState>('generating')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [tiptapDoc, setTiptapDoc] = useState<object | undefined>(undefined)
  const [sheetData, setSheetData] = useState<EditorSheetData | undefined>(undefined)
  const [logs, setLogs] = useState<string[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  const generationPayload = useMemo<GenerationPayload | null>(() => {
    const title = searchParams.get('title')
    const zadani = searchParams.get('zadani')
    const postup = searchParams.get('postup')
    const pomucky = searchParams.get('pomucky')
    const filePaths = parseFilePaths(searchParams.get('filePaths'))

    if (!title || !zadani || !postup || !pomucky || filePaths === null) {
      return null
    }

    return {
      protocolId,
      title,
      zadani,
      postup,
      pomucky,
      filePaths,
    }
  }, [protocolId, searchParams])

  useEffect(() => {
    let isCancelled = false

    const startGeneration = async (payload: GenerationPayload) => {
      setLogs([])
      setErrorMessage(null)
      setErrorDetail(null)
      setState('generating')

      const response = await fetch('/api/generate-protocol', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.body) {
        throw new Error('SSE response body is missing.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          const dataLines = chunk
            .split('\n')
            .filter((line) => line.startsWith('data: '))

          for (const line of dataLines) {
            const event = JSON.parse(line.slice(6)) as SSEEvent

            if (isCancelled) {
              return
            }

            if (event.type === 'log') {
              setLogs((previous) => [...previous, event.message])
            }

            if (event.type === 'done') {
              setTiptapDoc(event.tiptapDoc)
              setSheetData(event.sheetData)
              setState('done')
            }

            if (event.type === 'error') {
              setErrorMessage(event.message)
              setErrorDetail(event.detail ?? event.message)
              setState('error')
            }
          }
        }
      }

      if (buffer.trim()) {
        const line = buffer
          .split('\n')
          .find((entry) => entry.startsWith('data: '))

        if (line) {
          const event = JSON.parse(line.slice(6)) as SSEEvent
          if (event.type === 'error') {
            setErrorMessage(event.message)
            setErrorDetail(event.detail ?? event.message)
            setState('error')
          }
        }
      }
    }

    const bootstrap = async () => {
      try {
        setState('generating')
        setErrorMessage(null)
        setErrorDetail(null)
        setWarningMessage(null)

        const supabase = createClient()
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

        if (isCancelled) return

        if (authError || !user) {
          router.push('/login')
          return
        }

        const data = await getProtocol(protocolId, user.id)

        if (isCancelled) return

        const hydratedDoc = data.tiptap_doc ?? undefined
        const hydratedSheetData = data.sheet_data ?? undefined

        if (isValidTiptapDoc(hydratedDoc)) {
          setTiptapDoc(hydratedDoc)
          setSheetData(hydratedSheetData)
          setState('done')
          return
        }

        if (hydratedDoc) {
          setWarningMessage(
            'Historická verze textu není validní. Tabulky jsou načteny a text můžete upravit ručně.'
          )
          setTiptapDoc(FALLBACK_TIPTAP_DOC)
          setSheetData(hydratedSheetData)
          setState('done')
          return
        }

        if (data.status === 'error' && reloadKey === 0) {
          setErrorMessage('Předchozí generování selhalo.')
          setErrorDetail('Klikněte na "Zkusit znovu" pro nové spuštění generování s aktuálními vstupy.')
          setState('error')
          return
        }

        if (!generationPayload) {
          setErrorMessage('Chybí vstupní data pro generování protokolu.')
          setErrorDetail(
            data.status === 'error'
              ? 'Předchozí generování selhalo a v URL chybí vstupní data pro nový pokus.'
              : 'V URL nejsou dostupné povinné parametry title, zadani, postup, pomucky nebo filePaths.'
          )
          setState('error')
          return
        }

        await startGeneration(generationPayload)
      } catch (error) {
        if (isCancelled) return
        setErrorMessage(error instanceof Error ? error.message : 'Při načítání protokolu došlo k chybě.')
        setErrorDetail(error instanceof Error ? error.stack ?? error.message : 'Unknown editor error.')
        setState('error')
      }
    }

    void bootstrap()

    return () => {
      isCancelled = true
    }
  }, [generationPayload, protocolId, reloadKey, router])

  return (
    <PageWrapper
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Editor', href: `/editor/${protocolId}` },
      ]}
    >
      {state === 'done' ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {warningMessage ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {warningMessage}
            </div>
          ) : null}
          <div className="flex min-h-0 min-w-0 flex-1">
            <TextEditor initialContent={tiptapDoc} initialSheetData={sheetData} />
          </div>
        </div>
      ) : null}

      {state === 'generating' ? (
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold">Generuji protokol...</h2>
          <TerminalPanel lines={logs} showCursor />
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold text-red-600">Generování selhalo</h2>
          <TerminalPanel lines={[]} errorDetail={errorDetail ?? errorMessage} />
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="w-full" onClick={() => setReloadKey((value) => value + 1)}>
              Zkusit znovu
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/dashboard">Zpět na dashboard</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </PageWrapper>
  )
}
