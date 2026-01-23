import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate, AuthRequest } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

// Get notifications for current user
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { unread, limit } = req.query

    const where: Record<string, unknown> = { userId: req.user!.id }
    if (unread === 'true') where.read = false

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit as string) : 50,
    })

    res.json(notifications)
  } catch (error) {
    console.error('Get notifications error:', error)
    res.status(500).json({ error: 'Failed to get notifications' })
  }
})

// Get unread count
router.get('/unread-count', authenticate, async (req: AuthRequest, res) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user!.id, read: false },
    })
    res.json({ count })
  } catch (error) {
    console.error('Get unread count error:', error)
    res.status(500).json({ error: 'Failed to get unread count' })
  }
})

// Mark notification as read
router.patch('/:id/read', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const notification = await prisma.notification.findUnique({ where: { id } })
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    if (notification.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    })

    res.json(updated)
  } catch (error) {
    console.error('Mark notification read error:', error)
    res.status(500).json({ error: 'Failed to mark notification as read' })
  }
})

// Mark all notifications as read
router.patch('/mark-all-read', authenticate, async (req: AuthRequest, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, read: false },
      data: { read: true },
    })
    res.json({ success: true })
  } catch (error) {
    console.error('Mark all notifications read error:', error)
    res.status(500).json({ error: 'Failed to mark notifications as read' })
  }
})

// Delete notification
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const notification = await prisma.notification.findUnique({ where: { id } })
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    if (notification.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    await prisma.notification.delete({ where: { id } })
    res.json({ success: true })
  } catch (error) {
    console.error('Delete notification error:', error)
    res.status(500).json({ error: 'Failed to delete notification' })
  }
})

export { router as notificationsRouter }
