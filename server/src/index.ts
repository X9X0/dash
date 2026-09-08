// Must stay the first import: populates process.env before other modules load.
import './lib/env.js'

import express, { type ErrorRequestHandler } from 'express'
import cors from 'cors'
import multer from 'multer'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, extname, join } from 'path'

import { uploadsDir } from './lib/paths.js'
import { authRouter } from './routes/auth.js'
import { usersRouter } from './routes/users.js'
import { machinesRouter } from './routes/machines.js'
import { machineTypesRouter } from './routes/machineTypes.js'
import { reservationsRouter } from './routes/reservations.js'
import { jobsRouter } from './routes/jobs.js'
import { maintenanceRouter } from './routes/maintenance.js'
import { serviceRecordsRouter } from './routes/serviceRecords.js'
import { activityLogsRouter } from './routes/activityLogs.js'
import { notificationsRouter } from './routes/notifications.js'
import { bambuddyRouter, startBamBuddySync } from './routes/bambuddy.js'
import { setupSocket } from './socket/index.js'
import { startAutoHourTracking } from './jobs/autoHourTracking.js'
import { startClaimExpiry } from './jobs/claimExpiry.js'
import { startUptimeMonitoring } from './jobs/uptimeMonitoring.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
})

// Middleware
app.use(cors())
app.use(express.json())

// Serve uploaded files. Only raster images and PDFs may render inline; anything
// else is forced to download so an uploaded file can never execute as a page on
// this origin. nosniff stops browsers second-guessing the declared type.
const INLINE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.pdf'])
console.log('Serving uploads from:', uploadsDir)
app.use(
  '/uploads',
  express.static(uploadsDir, {
    index: false,
    dotfiles: 'deny',
    fallthrough: false,
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      if (!INLINE_EXTENSIONS.has(extname(filePath).toLowerCase())) {
        res.setHeader('Content-Disposition', 'attachment')
      }
    },
  })
)

// Make io accessible to routes
app.set('io', io)

// Routes
app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/machines', machinesRouter)
app.use('/api/machine-types', machineTypesRouter)
app.use('/api/reservations', reservationsRouter)
app.use('/api/jobs', jobsRouter)
app.use('/api/maintenance', maintenanceRouter)
app.use('/api/service-records', serviceRecordsRouter)
app.use('/api/activity-logs', activityLogsRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/bambuddy', bambuddyRouter)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Unknown API routes get a JSON 404 rather than the SPA's index.html
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  const clientDistPath = join(__dirname, '../../client/dist')
  app.use(express.static(clientDistPath))

  // Handle React routing - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(join(clientDistPath, 'index.html'))
  })
}

// Central error handler: turns upload/body-parse errors into JSON 4xx responses
// instead of Express's default HTML page, and never leaks stack traces.
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err)

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message })
  }
  const status = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : 500
  if (status >= 400 && status < 500) {
    const message = status === 404 ? 'Not found' : err.message || 'Bad request'
    return res.status(status).json({ error: message })
  }

  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
}
app.use(errorHandler)

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})

// Socket.io setup
setupSocket(io)

const PORT = process.env.PORT || 3001

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)

  // Start background jobs
  startAutoHourTracking()
  startClaimExpiry(io)
  startUptimeMonitoring(io)
  startBamBuddySync()
})

export { io }
