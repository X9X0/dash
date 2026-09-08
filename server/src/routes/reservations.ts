import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireOperator, AuthRequest } from '../middleware/auth.js'
import { isForeignKeyError, isNotFoundError, parseDate } from '../lib/errors.js'

const router = Router()

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

/** Validate a start/end pair; returns an error message or null. */
function validateWindow(startTime: Date | null, endTime: Date | null): string | null {
  if (!startTime || !endTime) return 'Invalid start or end time'
  if (endTime <= startTime) return 'End time must be after start time'
  return null
}

async function hasConflict(machineId: string, startTime: Date, endTime: Date, excludeId?: string): Promise<boolean> {
  const conflicting = await prisma.reservation.findFirst({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      machineId,
      status: { notIn: ['cancelled'] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true },
  })
  return conflicting !== null
}

// Get all reservations
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { machineId, startDate, endDate } = req.query

    const where: Record<string, unknown> = {}
    if (machineId) where.machineId = machineId

    if (startDate || endDate) {
      const range: Record<string, Date> = {}
      const from = parseDate(startDate as string | undefined)
      const to = parseDate(endDate as string | undefined)
      if ((startDate && !from) || (endDate && !to)) {
        return res.status(400).json({ error: 'Invalid date range' })
      }
      if (from) range.gte = from
      if (to) range.lte = to
      where.startTime = range
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
    const startTime = parseDate(data.startTime)
    const endTime = parseDate(data.endTime)
    const windowError = validateWindow(startTime, endTime)
    if (windowError || !startTime || !endTime) {
      return res.status(400).json({ error: windowError })
    }

    if (await hasConflict(data.machineId, startTime, endTime)) {
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
    if (isForeignKeyError(error)) {
      return res.status(404).json({ error: 'Machine not found' })
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
    if (data.purpose) updateData.purpose = data.purpose
    if (data.status) updateData.status = data.status

    // Check for conflicts if time is being changed
    if (data.startTime || data.endTime) {
      const startTime = data.startTime ? parseDate(data.startTime) : existing.startTime
      const endTime = data.endTime ? parseDate(data.endTime) : existing.endTime
      const windowError = validateWindow(startTime, endTime)
      if (windowError || !startTime || !endTime) {
        return res.status(400).json({ error: windowError })
      }

      if (await hasConflict(existing.machineId, startTime, endTime, id)) {
        return res.status(409).json({ error: 'Time slot conflicts with existing reservation' })
      }
      updateData.startTime = startTime
      updateData.endTime = endTime
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
    if (isNotFoundError(error)) {
      return res.status(404).json({ error: 'Reservation not found' })
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
