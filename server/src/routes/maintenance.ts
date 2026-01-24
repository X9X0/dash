import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authenticate, requireOperator, requireAdmin, AuthRequest } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

const createMaintenanceSchema = z.object({
  machineId: z.string().min(1),
  type: z.enum(['damage', 'repair', 'upgrade', 'checkout']),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  description: z.string().min(1),
  status: z.enum(['submitted', 'in_progress', 'resolved']).optional(),
})

const updateMaintenanceSchema = z.object({
  type: z.enum(['damage', 'repair', 'upgrade', 'checkout']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  description: z.string().optional(),
  status: z.enum(['submitted', 'in_progress', 'resolved']).optional(),
})

// Get all maintenance requests
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { machineId, status, priority } = req.query

    const where: Record<string, unknown> = {}
    if (machineId) where.machineId = machineId
    if (status) where.status = status
    if (priority) where.priority = priority

    const requests = await prisma.maintenanceRequest.findMany({
      where,
      include: {
        machine: { select: { id: true, name: true, location: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    res.json(requests)
  } catch (error) {
    console.error('Get maintenance requests error:', error)
    res.status(500).json({ error: 'Failed to get maintenance requests' })
  }
})

// Get maintenance request by ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const request = await prisma.maintenanceRequest.findUnique({
      where: { id },
      include: {
        machine: true,
        user: { select: { id: true, name: true, email: true } },
      },
    })

    if (!request) {
      return res.status(404).json({ error: 'Request not found' })
    }

    res.json(request)
  } catch (error) {
    console.error('Get maintenance request error:', error)
    res.status(500).json({ error: 'Failed to get maintenance request' })
  }
})

// Create maintenance request
router.post('/', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const data = createMaintenanceSchema.parse(req.body)

    const request = await prisma.maintenanceRequest.create({
      data: {
        machineId: data.machineId,
        userId: req.user!.id,
        type: data.type,
        priority: data.priority || 'medium',
        description: data.description,
        status: data.status || 'submitted',
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
        action: 'maintenance_requested',
        details: `${data.type} request: ${data.description.substring(0, 100)}`,
      },
    })

    // Notify admins of critical issues
    if (data.priority === 'critical') {
      const io = req.app.get('io')
      io.emit('notification', {
        type: 'critical_maintenance',
        title: 'Critical Maintenance Request',
        message: `Critical ${data.type} request for ${request.machine.name}`,
      })
    }

    res.status(201).json(request)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Create maintenance request error:', error)
    res.status(500).json({ error: 'Failed to create maintenance request' })
  }
})

// Update maintenance request (admin only for status changes)
router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const data = updateMaintenanceSchema.parse(req.body)

    const existing = await prisma.maintenanceRequest.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ error: 'Request not found' })
    }

    // Only admin can change status
    if (data.status && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change status' })
    }

    // Only owner or admin can update other fields
    if (existing.userId !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' })
    }

    const updateData: Record<string, unknown> = { ...data }
    if (data.status === 'resolved') {
      updateData.resolvedAt = new Date()
    }

    const request = await prisma.maintenanceRequest.update({
      where: { id },
      data: updateData,
      include: {
        machine: { select: { id: true, name: true, location: true } },
        user: { select: { id: true, name: true } },
      },
    })

    // Log status changes
    if (data.status) {
      await prisma.activityLog.create({
        data: {
          machineId: request.machineId,
          userId: req.user!.id,
          action: 'maintenance_status_changed',
          details: `Maintenance request status changed to ${data.status}`,
        },
      })
    }

    res.json(request)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Update maintenance request error:', error)
    res.status(500).json({ error: 'Failed to update maintenance request' })
  }
})

// Delete maintenance request (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    await prisma.maintenanceRequest.delete({ where: { id } })
    res.json({ success: true })
  } catch (error) {
    console.error('Delete maintenance request error:', error)
    res.status(500).json({ error: 'Failed to delete maintenance request' })
  }
})

export { router as maintenanceRouter }
