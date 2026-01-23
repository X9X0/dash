import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/store/authStore'
import { useMachineStore } from '@/store/machineStore'
import { useNotificationStore } from '@/store/notificationStore'
import type { Machine, Notification } from '@/types'

let socket: Socket | null = null

export function initSocket() {
  if (socket) return socket

  const token = useAuthStore.getState().token

  socket = io('/', {
    auth: { token },
    transports: ['websocket', 'polling'],
  })

  socket.on('connect', () => {
    console.log('Socket connected')
  })

  socket.on('disconnect', () => {
    console.log('Socket disconnected')
  })

  socket.on('machine:status', (data: { machineId: string; status: Machine['status'] }) => {
    useMachineStore.getState().updateMachineStatus(data.machineId, data.status)
  })

  socket.on('machine:update', (machine: Machine) => {
    useMachineStore.getState().updateMachine(machine.id, machine)
  })

  socket.on('notification', (notification: Notification) => {
    useNotificationStore.getState().addNotification(notification)
  })

  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
