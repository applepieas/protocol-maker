'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { PageWrapper } from '@/components/page-wrapper'
import TextEditor from '@/components/text-editor'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { Loader2Icon } from 'lucide-react'

type PageState = 'generating' | 'done' | 'error'

type EditorSheetData = Array<{ name: string;[key: string]: unknown }>

const FALLBACK_TIPTAP_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

function isValidTiptapDoc(value: unknown): value is object {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const maybeDoc = value as { type?: unknown; content?: unknown }
  return maybeDoc.type === 'doc' && Array.isArray(maybeDoc.content)
}

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

export default function EditorProtocolPage() {
  const params = useParams<{ protocolId: string }>()
  const protocolId = params.protocolId
  const router = useRouter()

  const [state, setState] = useState<PageState>('generating')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [tiptapDoc, setTiptapDoc] = useState<object | undefined>(undefined)
  const [sheetData, setSheetData] = useState<EditorSheetData | undefined>(undefined)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let isCancelled = false

    const bootstrap = async () => {
      try {
        setState('generating')
        setErrorMessage(null)
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

        // If previously errored, show error state immediately — do NOT auto-retry
        if (data.status === 'error') {
          setErrorMessage('Při předchozím generování došlo k chybě. Vytvořte nový protokol.')
          setState('error')
          return
        }

        const hydratedDoc = data.tiptap_doc ?? undefined
        const hydratedSheetData = data.sheet_data ?? undefined

        if (isValidTiptapDoc(hydratedDoc)) {
          setTiptapDoc(hydratedDoc)
        } else if (hydratedDoc) {
          setWarningMessage(
            'Historická verze textu není validní. Tabulky jsou načteny a text můžete upravit ručně.'
          )
          setTiptapDoc(FALLBACK_TIPTAP_DOC)
        } else {
          setTiptapDoc(undefined)
        }

        setSheetData(hydratedSheetData)
        setState('done')
      } catch (error) {
        if (isCancelled) return
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
  }, [protocolId, reloadKey, router])

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
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-card-foreground">
            <Loader2Icon className="size-7 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Načítám protokol...</p>
          </div>
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
            <h2 className="text-lg font-semibold">Generování selhalo</h2>
            {errorMessage ? (
              <p className="rounded-md bg-muted px-4 py-3 text-left font-mono text-sm text-muted-foreground break-all">
                {errorMessage}
              </p>
            ) : null}
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="w-full" onClick={() => setReloadKey((value) => value + 1)}>
                Zkusit znovu
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/dashboard">Zpět na dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageWrapper>
  )
}