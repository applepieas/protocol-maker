'use client'

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { LogoIcon } from '@/components/logo'
import { PageWrapper } from '@/components/page-wrapper'
import TextEditor from '@/components/text-editor'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type PageState = 'generating' | 'done' | 'error'

type GeneratePayload = {
  protocolId: string
  title: string
  zadani: string
  postup: string
  pomucky: string
  filePaths: string[]
}

type ProtocolRow = {
  id: string
  user_id: string
  title: string
  zadani: string | null
  postup: string | null
  pomucky: string | null
  tiptap_doc: Record<string, unknown> | null
  sheet_data: Record<string, unknown>[] | null
  status: 'draft' | 'generating' | 'done' | 'error'
}

type SSEEvent =
  | { type: 'progress'; step: 1 | 2 | 3; message: string }
  | { type: 'done'; tiptapDoc: object; sheetData: object[] }
  | { type: 'error'; message: string }

type EditorSheetData = Array<{ name: string;[key: string]: unknown }>

const STEPS = [
  { step: 1 as const, label: 'Analyzuji strukturu dat' },
  { step: 2 as const, label: 'Extrahuji a normalizuji tabulky' },
  { step: 3 as const, label: 'Píšu protokol' },
]

function parseFilePaths(value: string | null): string[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

export default function EditorProtocolPage() {
  const params = useParams<{ protocolId: string }>()
  const protocolId = params.protocolId
  const router = useRouter()
  const searchParams = useSearchParams()

  const [state, setState] = useState<PageState>('generating')
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [tiptapDoc, setTiptapDoc] = useState<object | undefined>(undefined)
  const [sheetData, setSheetData] = useState<EditorSheetData | undefined>(undefined)
  const [generationPayload, setGenerationPayload] =
    useState<GeneratePayload | null>(null)

  const searchPayload = useMemo(
    () => ({
      title: searchParams.get('title') ?? '',
      zadani: searchParams.get('zadani') ?? '',
      postup: searchParams.get('postup') ?? '',
      pomucky: searchParams.get('pomucky') ?? '',
      filePaths: parseFilePaths(searchParams.get('filePaths')),
    }),
    [searchParams]
  )

  const hasReadyData = useMemo(
    () => Boolean(tiptapDoc) && Boolean(sheetData && sheetData.length > 0),
    [sheetData, tiptapDoc]
  )

  const startGeneration = useCallback(async (payload: GeneratePayload) => {
    setErrorMessage(null)
    setState('generating')
    setActiveStep(1)

    const response = await fetch('/api/generate-protocol', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null)
      const errorText =
        errorBody && typeof errorBody.error === 'string'
          ? errorBody.error
          : 'Generování protokolu selhalo.'
      throw new Error(errorText)
    }

    if (!response.body) {
      throw new Error('Server nevrátil stream odpovědi.')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let completed = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      if (!value) {
        continue
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue
        }

        const event = JSON.parse(line.slice(6)) as SSEEvent

        if (event.type === 'progress') {
          setActiveStep(event.step)
        }

        if (event.type === 'done') {
          const nextDoc = event.tiptapDoc
          const nextSheetData = event.sheetData as EditorSheetData

          if (!nextDoc || !Array.isArray(nextSheetData) || nextSheetData.length === 0) {
            throw new Error('Generování skončilo bez kompletních dat pro editor.')
          }

          setTiptapDoc(nextDoc)
          setSheetData(nextSheetData)
          setState('done')
          completed = true
        }

        if (event.type === 'error') {
          setErrorMessage(event.message)
          setState('error')
          completed = true
        }
      }
    }

    if (!completed) {
      throw new Error('Stream byl ukončen bez výsledku.')
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    const bootstrap = async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

        if (isCancelled) {
          return
        }

        if (authError || !user) {
          router.push('/login')
          return
        }

        const { data, error } = await supabase
          .from('protocols')
          .select(
            'id,user_id,title,zadani,postup,pomucky,tiptap_doc,sheet_data,status'
          )
          .eq('id', protocolId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (error || !data) {
          throw new Error(error?.message || 'Protokol nebyl nalezen.')
        }

        const protocol = data as ProtocolRow

        if (protocol.status === 'done') {
          const hydratedDoc = protocol.tiptap_doc ?? undefined
          const hydratedSheetData =
            (protocol.sheet_data as EditorSheetData | null) ?? undefined

          if (hydratedDoc && hydratedSheetData && hydratedSheetData.length > 0) {
            setTiptapDoc(hydratedDoc)
            setSheetData(hydratedSheetData)
            setState('done')
            return
          }
        }

        const fallbackFiles =
          searchPayload.filePaths.length > 0
            ? searchPayload.filePaths
            : (
              await supabase
                .from('protocol_files')
                .select('storage_path')
                .eq('protocol_id', protocolId)
            ).data?.map((row) => row.storage_path) ?? []

        const payload: GeneratePayload = {
          protocolId,
          title: searchPayload.title || protocol.title,
          zadani: searchPayload.zadani || protocol.zadani || '',
          postup: searchPayload.postup || protocol.postup || '',
          pomucky: searchPayload.pomucky || protocol.pomucky || '',
          filePaths: fallbackFiles,
        }

        setGenerationPayload(payload)

        if (protocol.status === 'error') {
          setErrorMessage('Při generování došlo k chybě')
          setState('error')
          return
        }

        await startGeneration(payload)
      } catch (error) {
        if (isCancelled) {
          return
        }

        setErrorMessage(
          error instanceof Error ? error.message : 'Při načítání protokolu došlo k chybě.'
        )
        setState('error')
      }
    }

    void bootstrap()

    return () => {
      isCancelled = true
    }
  }, [protocolId, router, searchPayload, startGeneration])

  const retryGeneration = async () => {
    if (!generationPayload) {
      setErrorMessage('Chybí data pro opětovné spuštění generování.')
      return
    }

    try {
      await startGeneration(generationPayload)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Opětovné generování selhalo.'
      )
      setState('error')
    }
  }

  return (
    <PageWrapper
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Editor', href: `/editor/${protocolId}` },
      ]}
    >
      {state === 'done' && hasReadyData ? (
        <div className="flex min-h-0 min-w-0 flex-1">
          <TextEditor initialContent={tiptapDoc} initialSheetData={sheetData} />
        </div>
      ) : null}

      {state === 'generating' ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="flex w-full max-w-lg flex-col items-center gap-8 rounded-xl border bg-card p-8 text-card-foreground">
            <div className="flex flex-col items-center gap-2">
              <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/40">
                <LogoIcon uniColor className="size-7" />
              </div>
              <h1 className="text-xl font-semibold">Protocol Maker</h1>
            </div>

            <div className="flex w-full flex-col gap-4">
              {STEPS.map(({ step, label }) => {
                const isDone = activeStep > step
                const isActive = activeStep === step

                return (
                  <div key={step} className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full border text-sm font-semibold',
                        isDone && 'border-emerald-600 bg-emerald-600 text-white',
                        isActive && 'active-step border-primary bg-primary text-primary-foreground',
                        !isDone && !isActive && 'border-muted-foreground/30 bg-muted text-muted-foreground'
                      )}
                    >
                      {isDone ? '✓' : step}
                    </div>
                    <p
                      className={cn(
                        'text-sm',
                        isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
                      )}
                    >
                      {label}
                    </p>
                  </div>
                )
              })}
            </div>

            <p className="text-center text-sm text-muted-foreground">
              Tento proces trvá přibližně 20–40 sekund
            </p>
          </div>
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
            <h2 className="text-lg font-semibold">Při generování došlo k chybě</h2>
            {errorMessage ? (
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
            ) : null}
            <div className="flex w-full flex-col gap-2">
              <Button variant="outline" onClick={retryGeneration}>
                Zkusit znovu
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/dashboard">Zpět na dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        @keyframes stepPulse {
          0% {
            box-shadow: 0 0 0 0 hsl(var(--primary) / 0.4);
          }

          70% {
            box-shadow: 0 0 0 10px hsl(var(--primary) / 0);
          }

          100% {
            box-shadow: 0 0 0 0 hsl(var(--primary) / 0);
          }
        }

        .active-step {
          animation: stepPulse 1.8s ease-in-out infinite;
        }
      `}</style>
    </PageWrapper>
  )
}