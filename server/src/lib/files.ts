import { unlink } from 'fs/promises'
import { basename, join } from 'path'
import { uploadsDir } from './paths.js'

// Filenames we generate are `<uuid><ext>`; anything else is not ours.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** A stored reference to an uploaded file, as saved in the database. */
export const UPLOAD_REF = /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * Map a stored reference ('/uploads/<name>' or a bare '<name>') to its path
 * inside the uploads directory. Returns null for anything that does not look
 * like a file we created, so callers can never touch files outside uploadsDir.
 */
export function uploadedFilePath(ref: string | null | undefined): string | null {
  if (!ref) return null
  const name = basename(ref)
  if (!SAFE_NAME.test(name)) return null
  return join(uploadsDir, name)
}

/** Best-effort deletion of uploaded files. Missing files are ignored. */
export async function removeUploadedFiles(refs: Array<string | null | undefined>): Promise<void> {
  await Promise.all(
    refs.map(async (ref) => {
      const path = uploadedFilePath(ref)
      if (!path) return
      try {
        await unlink(path)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn(`[Files] Could not delete ${path}:`, (err as Error).message)
        }
      }
    })
  )
}

/** Parse a JSON column holding an array of upload references (photos). */
export function parseRefList(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

export interface StoredAttachment {
  filename: string
  originalName: string
  fileType: string
}

/** Parse a JSON column holding an array of attachment objects. */
export function parseAttachmentList(json: string | null | undefined): StoredAttachment[] {
  if (!json) return []
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed)
      ? parsed.filter((a): a is StoredAttachment => !!a && typeof a === 'object' && typeof (a as StoredAttachment).filename === 'string')
      : []
  } catch {
    return []
  }
}

/**
 * Filenames multer wrote for the current request, so a handler that then
 * rejects the request (validation error, missing machine) can delete them.
 */
export function requestUploads(req: { files?: unknown; file?: Express.Multer.File }): string[] {
  const names: string[] = []
  if (req.file) names.push(req.file.filename)
  if (Array.isArray(req.files)) {
    names.push(...(req.files as Express.Multer.File[]).map((f) => f.filename))
  } else if (req.files && typeof req.files === 'object') {
    for (const list of Object.values(req.files as Record<string, Express.Multer.File[]>)) {
      names.push(...list.map((f) => f.filename))
    }
  }
  return names
}
