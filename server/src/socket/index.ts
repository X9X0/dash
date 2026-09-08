import { Server, Socket } from 'socket.io'
import { verifyToken } from '../lib/jwt.js'

interface AuthenticatedSocket extends Socket {
  userId?: string
}

export function setupSocket(io: Server) {
  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token

    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication required'))
    }

    try {
      const decoded = verifyToken(token)
      if (decoded.scope === 'media') {
        return next(new Error('Invalid token'))
      }
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

    // Clients only listen. Every machine/notification event originates from the
    // server (routes and background jobs); nothing a client sends is rebroadcast,
    // so a connected user cannot spoof machine state for everyone else.

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`)
    })
  })

  return io
}
