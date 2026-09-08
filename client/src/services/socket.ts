import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/store/authStore'
import { useMachineStore } from '@/store/machineStore'
import { useNotificationStore } from '@/store/notificationStore'
import type { Machine, Notification } from '@/types'

// Payloads emitted by the server (see server socket contract).
interface MachineStatusEvent {
  machineId: string
  status: Machine['status']
}

interface MachineClaimedEvent {
  machineId: string
  claimedById: string
  claimedBy: { id: string; name: string }
  claimedAt: string
  claimExpiresAt: string | null
  status: Machine['status']
}

interface MachineReleasedEvent {
  machineId: string
  status: Machine['status']
}

interface MachineUptimeEvent {
  machineId: string
  isOnline: boolean
  timestamp: string
}

const AUTH_ERROR_MESSAGES = new Set(['Invalid token', 'Authentication required'])

let socket: Socket | null = null

export function initSocket() {
  if (socket) return socket

  const s = io('/', {
    // Read the token at (re)connect time so a reconnect after re-login uses
    // the current session rather than the one captured at first connect.
    auth: (cb) => cb({ token: useAuthStore.getState().token }),
    transports: ['websocket', 'polling'],
  })
  socket = s

  s.on('connect', () => {
    console.log('Socket connected')
  })

  s.on('disconnect', () => {
    console.log('Socket disconnected')
  })

  s.on('connect_error', (err: Error) => {
    if (AUTH_ERROR_MESSAGES.has(err.message)) {
      // The persisted token is dead; stop retrying with it and end the session.
      disconnectSocket()
      useAuthStore.getState().logout()
    }
  })

  s.on('machine:status', (data: MachineStatusEvent) => {
    useMachineStore.getState().updateMachineStatus(data.machineId, data.status)
  })

  s.on('machine:update', (machine: Machine) => {
    useMachineStore.getState().updateMachine(machine.id, machine)
  })

  s.on('machine:claimed', (data: MachineClaimedEvent) => {
    useMachineStore.getState().updateMachine(data.machineId, {
      claimedById: data.claimedById,
      claimedBy: data.claimedBy,
      claimedAt: data.claimedAt,
      claimExpiresAt: data.claimExpiresAt,
      status: data.status,
    })
  })

  s.on('machine:released', (data: MachineReleasedEvent) => {
    useMachineStore.getState().updateMachine(data.machineId, {
      claimedById: null,
      claimedBy: null,
      claimedAt: null,
      claimExpiresAt: null,
      status: data.status,
    })
  })

  s.on('machine:uptime', (data: MachineUptimeEvent) => {
    useMachineStore.getState().updateMachine(data.machineId, {
      isOnline: data.isOnline,
      ...(data.isOnline ? { lastOnlineAt: data.timestamp } : { lastOfflineAt: data.timestamp }),
    })
  })

  s.on('notification', (notification: Notification) => {
    useNotificationStore.getState().addNotification(notification)
  })

  return s
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  if (socket) {
    // Drop listeners and the singleton so the next login creates a fresh socket.
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}
