import { existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

/**
 * Directory where uploaded files (photos, attachments) are stored and served
 * from at /uploads.
 *
 * Resolution order:
 *   1. UPLOADS_DIR            explicit override
 *   2. DASH_DATA_DIR/uploads  the data directory the deploy/backup scripts use
 *   3. legacy cwd-relative lookup (./uploads, else ./server/uploads)
 *
 * The legacy fallback exists for installs that predate DASH_DATA_DIR. It is not
 * covered by the backup scripts, so production installs should set DASH_DATA_DIR.
 */
function resolveUploadsDir(): string {
  if (process.env.UPLOADS_DIR) {
    return resolve(process.env.UPLOADS_DIR)
  }
  if (process.env.DASH_DATA_DIR) {
    return join(resolve(process.env.DASH_DATA_DIR), 'uploads')
  }

  const cwdUploads = join(process.cwd(), 'uploads')
  const legacy = existsSync(cwdUploads) ? cwdUploads : join(process.cwd(), 'server', 'uploads')
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      `[Paths] DASH_DATA_DIR is not set; storing uploads in ${legacy}. ` +
        'This location is NOT included in backups. Set DASH_DATA_DIR in server/.env.'
    )
  }
  return legacy
}

export const uploadsDir = resolveUploadsDir()
mkdirSync(uploadsDir, { recursive: true })
console.log('Uploads directory:', uploadsDir)
