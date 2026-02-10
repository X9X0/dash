import multer from 'multer'
import { randomUUID } from 'crypto'
import { extname, join } from 'path'
import { mkdirSync, existsSync } from 'fs'

// Handle both running from server/ or project root
let uploadsDir = join(process.cwd(), 'uploads')
// If running from project root (e.g., dash/), use server/uploads
if (!existsSync(uploadsDir)) {
  uploadsDir = join(process.cwd(), 'server', 'uploads')
}
console.log('Upload directory:', uploadsDir)

// Ensure uploads directory exists
try {
  mkdirSync(uploadsDir, { recursive: true })
} catch {
  // directory already exists
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

const blockedMimeTypes = [
  'application/x-msdownload', // .exe
  'application/x-msdos-program',
  'application/x-shellscript',
]

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (blockedMimeTypes.includes(file.mimetype)) {
    cb(new Error(`File type not allowed: ${file.mimetype}`))
  } else {
    cb(null, true)
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
})
