import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export type PreparedFileContext = {
  base64Images: string[]
  csvTexts: string[]
  notes: string[]
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp'])
const XLSX_EXTENSIONS = new Set(['xlsx', 'xls'])

function getExtension(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? ''
}

function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(path))
}

function isCsvPath(path: string): boolean {
  return getExtension(path) === 'csv'
}

function isSpreadsheetPath(path: string): boolean {
  return XLSX_EXTENSIONS.has(getExtension(path))
}

export async function prepareStorageFiles(
  filePaths: string[]
): Promise<PreparedFileContext> {
  const supabase = await createClient()

  const base64Images: string[] = []
  const csvTexts: string[] = []
  const notes: string[] = []

  for (const path of filePaths) {
    const { data, error } = await supabase.storage
      .from('protocol-uploads')
      .download(path)

    if (error || !data) {
      throw new Error(`Failed to download file from storage: ${path}`)
    }

    const arrayBuffer = await data.arrayBuffer()

    if (isImagePath(path)) {
      const buffer = Buffer.from(arrayBuffer)
      base64Images.push(buffer.toString('base64'))
      continue
    }

    if (isCsvPath(path)) {
      csvTexts.push(Buffer.from(arrayBuffer).toString('utf-8'))
      continue
    }

    if (isSpreadsheetPath(path)) {
      const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' })

      const nonEmptySheetNames = workbook.SheetNames.filter((sheetName) => {
        const sheet = workbook.Sheets[sheetName]
        if (!sheet) {
          return false
        }

        const csv = XLSX.utils.sheet_to_csv(sheet)
        return csv.trim().length > 0
      })

      if (nonEmptySheetNames.length === 0) {
        notes.push(`Spreadsheet appears empty: ${path}`)
        continue
      }

      for (const sheetName of nonEmptySheetNames) {
        const sheet = workbook.Sheets[sheetName]
        if (!sheet) {
          continue
        }

        const csv = XLSX.utils.sheet_to_csv(sheet)
        if (!csv.trim()) {
          continue
        }

        csvTexts.push(`Source file: ${path}\nSheet: ${sheetName}\n${csv}`)
      }

      continue
    }

    notes.push(`Unsupported file type provided in storage path: ${path}`)
  }

  return {
    base64Images,
    csvTexts,
    notes,
  }
}