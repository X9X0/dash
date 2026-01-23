import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate, AuthRequest } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

// Get all activity logs
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { machineId, userId, action, limit } = req.query

    const where: Record<string, unknown> = {}
    if (machineId) where.machineId = machineId
    if (userId) where.userId = userId
    if (action) where.action = action

    const logs = await prisma.activityLog.findMany({
      where,
      include: {
        machine: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { timestamp: 'desc' },
      take: limit ? parseInt(limit as string) : 100,
    })

    res.json(logs)
  } catch (error) {
    console.error('Get activity logs error:', error)
    res.status(500).json({ error: 'Failed to get activity logs' })
  }
})

// Get activity log by ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const log = await prisma.activityLog.findUnique({
      where: { id },
      include: {
        machine: true,
        user: { select: { id: true, name: true, email: true } },
      },
    })

    if (!log) {
      return res.status(404).json({ error: 'Activity log not found' })
    }

    res.json(log)
  } catch (error) {
    console.error('Get activity log error:', error)
    res.status(500).json({ error: 'Failed to get activity log' })
  }
})

export { router as activityLogsRouter }
