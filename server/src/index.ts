import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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
import { setupSocket } from './socket/index.js'

dotenv.config()

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
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

// Socket.io setup
setupSocket(io)

const PORT = process.env.PORT || 3001

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export { io }
