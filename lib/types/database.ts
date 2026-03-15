export type ProtocolStatus = 'draft' | 'generating' | 'done' | 'error'

export type Profile = {
  id: string
  display_name: string | null
  created_at: string
}

export type Protocol = {
  id: string
  user_id: string
  title: string
  zadani: string | null
  postup: string | null
  pomucky: string | null
  tiptap_doc: Record<string, unknown> | null
  sheet_data: Record<string, unknown>[] | null
  status: ProtocolStatus
  created_at: string
  updated_at: string
}

export type ProtocolFile = {
  id: string
  protocol_id: string
  storage_path: string
  file_type: string | null
  created_at: string
}

export type ProtocolSummary = Pick<
  Protocol,
  'id' | 'title' | 'status' | 'created_at' | 'updated_at'
>