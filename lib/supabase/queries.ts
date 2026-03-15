import 'server-only'

import {
  type Protocol,
  type ProtocolStatus,
  type ProtocolSummary,
} from '@/lib/types/database'

import { createClient } from './server'

type CreateProtocolInput = {
  title: string
  zadani: string
  postup: string
  pomucky: string
}

type CreateProtocolFilesInput = {
  protocolId: string
  storagePaths: string[]
}

async function getAuthenticatedContext() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Unauthorized')
  }

  return { supabase, userId: user.id }
}

export async function getProtocols(): Promise<ProtocolSummary[]> {
  const { supabase, userId } = await getAuthenticatedContext()

  const { data, error } = await supabase
    .from('protocols')
    .select('id,title,status,created_at,updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as ProtocolSummary[]
}

export async function getProtocol(id: string): Promise<Protocol | null> {
  const { supabase, userId } = await getAuthenticatedContext()

  const { data, error } = await supabase
    .from('protocols')
    .select(
      'id,user_id,title,zadani,postup,pomucky,tiptap_doc,sheet_data,status,created_at,updated_at'
    )
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as Protocol | null
}

export async function createProtocol(input: CreateProtocolInput): Promise<string> {
  const { supabase, userId } = await getAuthenticatedContext()

  const { data, error } = await supabase
    .from('protocols')
    .insert({
      user_id: userId,
      title: input.title,
      zadani: input.zadani,
      postup: input.postup,
      pomucky: input.pomucky,
      status: 'draft',
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data.id
}

export async function createProtocolFiles(
  input: CreateProtocolFilesInput
): Promise<void> {
  const { supabase } = await getAuthenticatedContext()

  if (input.storagePaths.length === 0) {
    return
  }

  const rows = input.storagePaths.map((storagePath) => ({
    protocol_id: input.protocolId,
    storage_path: storagePath,
    file_type: storagePath.split('.').pop() ?? null,
  }))

  const { error } = await supabase.from('protocol_files').insert(rows)

  if (error) {
    throw new Error(error.message)
  }
}

export async function saveProtocolOutput(
  id: string,
  tiptapDoc: Record<string, unknown>,
  sheetData: Record<string, unknown>[]
): Promise<void> {
  const { supabase, userId } = await getAuthenticatedContext()

  const { error } = await supabase
    .from('protocols')
    .update({
      tiptap_doc: tiptapDoc,
      sheet_data: sheetData,
      status: 'done',
    })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function updateProtocolStatus(
  id: string,
  status: ProtocolStatus
): Promise<void> {
  const { supabase, userId } = await getAuthenticatedContext()

  const { error } = await supabase
    .from('protocols')
    .update({ status })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    throw new Error(error.message)
  }
}