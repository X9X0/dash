import multer from 'multer'
import { randomUUID } from 'crypto'
import { extname, join } from 'path'
import { mkdirSync } from 'fs'

// Use process.cwd() for reliable path resolution across dev/prod
const uploadsDir = join(process.cwd(), 'uploads')
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

const allowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/zip',
]

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`))
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
})
