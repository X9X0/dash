import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authenticate, requireOperator, requireAdmin, AuthRequest } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'

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
        updates: {
          include: {
            user: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!request) {
      return res.status(404).json({ error: 'Request not found' })
    }

    // Parse photos JSON
    const parsedRequest = {
      ...request,
      photos: request.photos ? JSON.parse(request.photos) : [],
      updates: request.updates.map((u) => ({
        ...u,
        photos: u.photos ? JSON.parse(u.photos) : [],
      })),
    }

    res.json(parsedRequest)
  } catch (error) {
    console.error('Get maintenance request error:', error)
    res.status(500).json({ error: 'Failed to get maintenance request' })
  }
})

// Create maintenance request
router.post('/', authenticate, requireOperator, upload.array('photos', 5), async (req: AuthRequest, res) => {
  try {
    const data = createMaintenanceSchema.parse(req.body)

    // Handle file uploads
    const files = req.files as Express.Multer.File[] | undefined
    const photoPaths = files?.map((f) => `/uploads/${f.filename}`) || []

    const request = await prisma.maintenanceRequest.create({
      data: {
        machineId: data.machineId,
        userId: req.user!.id,
        type: data.type,
        priority: data.priority || 'medium',
        description: data.description,
        status: data.status || 'submitted',
        photos: photoPaths.length > 0 ? JSON.stringify(photoPaths) : null,
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

// Update maintenance request (operators can edit all fields on any ticket)
router.patch('/:id', authenticate, requireOperator, upload.array('photos', 5), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const data = updateMaintenanceSchema.parse(req.body)

    const existing = await prisma.maintenanceRequest.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ error: 'Request not found' })
    }

    const updateData: Record<string, unknown> = { ...data }
    if (data.status === 'resolved') {
      updateData.resolvedAt = new Date()
    }

    // Handle file uploads
    const files = req.files as Express.Multer.File[] | undefined
    if (files && files.length > 0) {
      const newPhotos = files.map((f) => `/uploads/${f.filename}`)
      const existingPhotos = existing.photos ? JSON.parse(existing.photos) : []
      updateData.photos = JSON.stringify([...existingPhotos, ...newPhotos])
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

    res.json({
      ...request,
      photos: request.photos ? JSON.parse(request.photos) : [],
    })
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

// Get updates for a maintenance request
router.get('/:id/updates', authenticate, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const updates = await prisma.maintenanceUpdate.findMany({
      where: { maintenanceRequestId: id },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Parse photos JSON
    const parsedUpdates = updates.map((u) => ({
      ...u,
      photos: u.photos ? JSON.parse(u.photos) : [],
    }))

    res.json(parsedUpdates)
  } catch (error) {
    console.error('Get maintenance updates error:', error)
    res.status(500).json({ error: 'Failed to get maintenance updates' })
  }
})

// Add update to a maintenance request (operator+)
router.post('/:id/updates', authenticate, requireOperator, upload.array('photos', 5), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const { content } = z.object({ content: z.string().min(1) }).parse(req.body)

    // Handle file uploads
    const files = req.files as Express.Multer.File[] | undefined
    const photoPaths = files?.map((f) => `/uploads/${f.filename}`) || []

    const update = await prisma.maintenanceUpdate.create({
      data: {
        maintenanceRequestId: id,
        userId: req.user!.id,
        content,
        photos: photoPaths.length > 0 ? JSON.stringify(photoPaths) : null,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    })

    res.status(201).json({
      ...update,
      photos: update.photos ? JSON.parse(update.photos) : [],
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Add maintenance update error:', error)
    res.status(500).json({ error: 'Failed to add maintenance update' })
  }
})

export { router as maintenanceRouter }
