import type { Server } from 'socket.io'
import { prisma } from './prisma.js'

let io: Server | null = null

/** Called once at startup so background jobs can push notifications too. */
export function setNotificationServer(server: Server): void {
  io = server
}

export interface NotificationInput {
  type: string
  title: string
  message: string
}

/**
 * Persist a notification for each user and push the stored row to that user's
 * live sockets (room `user:<id>`). Everything a client receives on the
 * `notification` event is therefore a real Notification record.
 */
export async function notifyUsers(userIds: Array<string | null | undefined>, input: NotificationInput): Promise<void> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))]
  if (ids.length === 0) return

  try {
    const rows = await prisma.$transaction(
      ids.map((userId) => prisma.notification.create({ data: { userId, ...input } }))
    )
    for (const row of rows) {
      io?.to(`user:${row.userId}`).emit('notification', row)
    }
  } catch (error) {
    console.error('[Notify] Failed to create notifications:', error)
  }
}

export async function notifyAdmins(input: NotificationInput): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } })
  await notifyUsers(admins.map((a) => a.id), input)
}
