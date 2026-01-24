import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authenticate, requireOperator, AuthRequest } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

const createReservationSchema = z.object({
  machineId: z.string().min(1),
  startTime: z.string(),
  endTime: z.string(),
  purpose: z.string().min(1),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
})

const updateReservationSchema = z.object({
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  purpose: z.string().optional(),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
})

// Get all reservations
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { machineId, startDate, endDate } = req.query

    const where: Record<string, unknown> = {}
    if (machineId) where.machineId = machineId

    if (startDate || endDate) {
      where.startTime = {}
      if (startDate) (where.startTime as Record<string, Date>).gte = new Date(startDate as string)
      if (endDate) (where.startTime as Record<string, Date>).lte = new Date(endDate as string)
    }

    const reservations = await prisma.reservation.findMany({
      where,
      include: {
        machine: { select: { id: true, name: true, location: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { startTime: 'asc' },
    })

    res.json(reservations)
  } catch (error) {
    console.error('Get reservations error:', error)
    res.status(500).json({ error: 'Failed to get reservations' })
  }
})

// Get reservation by ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        machine: true,
        user: { select: { id: true, name: true, email: true } },
      },
    })

    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found' })
    }

    res.json(reservation)
  } catch (error) {
    console.error('Get reservation error:', error)
    res.status(500).json({ error: 'Failed to get reservation' })
  }
})

// Create reservation
router.post('/', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const data = createReservationSchema.parse(req.body)
    const startTime = new Date(data.startTime)
    const endTime = new Date(data.endTime)

    // Check for conflicts
    const conflicting = await prisma.reservation.findFirst({
      where: {
        machineId: data.machineId,
        status: { notIn: ['cancelled'] },
        OR: [
          { startTime: { lt: endTime }, endTime: { gt: startTime } },
        ],
      },
    })

    if (conflicting) {
      return res.status(409).json({ error: 'Time slot conflicts with existing reservation' })
    }

    const reservation = await prisma.reservation.create({
      data: {
        machineId: data.machineId,
        userId: req.user!.id,
        startTime,
        endTime,
        purpose: data.purpose,
        status: data.status || 'pending',
      },
      include: {
        machine: { select: { id: true, name: true, location: true } },
        user: { select: { id: true, name: true } },
      },
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        machineId: data.machineId,
        userId: req.user!.id,
        action: 'reservation_created',
        details: `Reserved for: ${data.purpose}`,
      },
    })

    res.status(201).json(reservation)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Create reservation error:', error)
    res.status(500).json({ error: 'Failed to create reservation' })
  }
})

// Update reservation
router.patch('/:id', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const data = updateReservationSchema.parse(req.body)

    const existing = await prisma.reservation.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ error: 'Reservation not found' })
    }

    // Only owner or admin can update
    if (existing.userId !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' })
    }

    const updateData: Record<string, unknown> = {}
    if (data.startTime) updateData.startTime = new Date(data.startTime)
    if (data.endTime) updateData.endTime = new Date(data.endTime)
    if (data.purpose) updateData.purpose = data.purpose
    if (data.status) updateData.status = data.status

    // Check for conflicts if time is being changed
    if (data.startTime || data.endTime) {
      const startTime = data.startTime ? new Date(data.startTime) : existing.startTime
      const endTime = data.endTime ? new Date(data.endTime) : existing.endTime

      const conflicting = await prisma.reservation.findFirst({
        where: {
          id: { not: id },
          machineId: existing.machineId,
          status: { notIn: ['cancelled'] },
          OR: [
            { startTime: { lt: endTime }, endTime: { gt: startTime } },
          ],
        },
      })

      if (conflicting) {
        return res.status(409).json({ error: 'Time slot conflicts with existing reservation' })
      }
    }

    const reservation = await prisma.reservation.update({
      where: { id },
      data: updateData,
      include: {
        machine: { select: { id: true, name: true, location: true } },
        user: { select: { id: true, name: true } },
      },
    })

    res.json(reservation)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Update reservation error:', error)
    res.status(500).json({ error: 'Failed to update reservation' })
  }
})

// Delete reservation
router.delete('/:id', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string

    const existing = await prisma.reservation.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ error: 'Reservation not found' })
    }

    // Only owner or admin can delete
    if (existing.userId !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' })
    }

    await prisma.reservation.delete({ where: { id } })
    res.json({ success: true })
  } catch (error) {
    console.error('Delete reservation error:', error)
    res.status(500).json({ error: 'Failed to delete reservation' })
  }
})

export { router as reservationsRouter }
