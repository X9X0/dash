import multer from 'multer'
import { randomUUID } from 'crypto'
import { extname } from 'path'
import { uploadsDir } from '../lib/paths.js'

export class UnsupportedFileTypeError extends Error {
  status = 400
  constructor(detail: string) {
    super(`File type not allowed: ${detail}`)
    this.name = 'UnsupportedFileTypeError'
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase()
    cb(null, `${randomUUID()}${ext}`)
  },
})

// Uploads are served from the same origin as the app, so a file the browser
// will render as HTML/SVG/script could run JavaScript with access to the
// logged-in user's session. index.ts additionally serves everything except
// raster images and PDFs as a download; this list is defence in depth and also
// keeps Windows executables out.
const BLOCKED_EXTENSIONS = new Set([
  '.html', '.htm', '.xhtml', '.shtml', '.svg', '.svgz',
  '.js', '.mjs', '.cjs', '.vbs', '.vbe', '.wsf', '.hta', '.swf',
  '.exe', '.dll', '.com', '.scr', '.msi', '.bat', '.cmd', '.ps1', '.jar',
  '.php', '.phtml', '.asp', '.aspx',
])

const BLOCKED_MIME_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/javascript',
  'text/javascript',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-shellscript',
  'application/x-sh',
])

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = extname(file.originalname).toLowerCase()
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return cb(new UnsupportedFileTypeError(ext))
  }
  if (BLOCKED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    return cb(new UnsupportedFileTypeError(file.mimetype))
  }
  cb(null, true)
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
})
