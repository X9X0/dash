import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'

interface AuthenticatedSocket extends Socket {
  userId?: string
}

export function setupSocket(io: Server) {
  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token

    if (!token) {
      return next(new Error('Authentication required'))
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'fallback-secret'
      ) as { userId: string }
      socket.userId = decoded.userId
      next()
    } catch (error) {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User connected: ${socket.userId}`)

    // Join user-specific room for targeted notifications
    if (socket.userId) {
      socket.join(`user:${socket.userId}`)
    }

    // Handle machine status updates from machines themselves
    socket.on('machine:heartbeat', (data: { machineId: string; metrics?: Record<string, unknown> }) => {
      // Broadcast to all connected clients
      io.emit('machine:heartbeat', data)
    })

    // Handle manual status update requests
    socket.on('machine:setStatus', (data: { machineId: string; status: string }) => {
      io.emit('machine:status', data)
    })

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`)
    })
  })

  // Helper function to send notification to specific user
  io.sendNotification = (userId: string, notification: { type: string; title: string; message: string }) => {
    io.to(`user:${userId}`).emit('notification', notification)
  }

  // Helper function to broadcast machine status
  io.broadcastMachineStatus = (machineId: string, status: string) => {
    io.emit('machine:status', { machineId, status })
  }

  return io
}

// Extend Socket.io Server type
declare module 'socket.io' {
  interface Server {
    sendNotification: (userId: string, notification: { type: string; title: string; message: string }) => void
    broadcastMachineStatus: (machineId: string, status: string) => void
  }
}
