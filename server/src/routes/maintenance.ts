import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireOperator, requireAdmin, AuthRequest } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'
import { isForeignKeyError, isNotFoundError } from '../lib/errors.js'
import { parseRefList, removeUploadedFiles, requestUploads } from '../lib/files.js'
import { notifyAdmins } from '../lib/notify.js'

const router = Router()

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

// Priority is stored as text; sorting it alphabetically puts "medium" first
// and "critical" last, so rank explicitly.
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const priorityRank = (p: string) => PRIORITY_RANK[p] ?? 99

function uploadedPhotoPaths(req: AuthRequest): string[] {
  const files = req.files as Express.Multer.File[] | undefined
  return files?.map((f) => `/uploads/${f.filename}`) || []
}

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
      orderBy: { createdAt: 'desc' },
    })

    // Most urgent first, newest first within the same priority
    requests.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.createdAt.getTime() - a.createdAt.getTime())

    // Parse photos JSON for each request
    const parsedRequests = requests.map((r) => ({
      ...r,
      photos: parseRefList(r.photos),
    }))

    res.json(parsedRequests)
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
      photos: parseRefList(request.photos),
      updates: request.updates.map((u) => ({
        ...u,
        photos: parseRefList(u.photos),
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
    const photoPaths = uploadedPhotoPaths(req)

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

    // Notify admins of critical issues (persisted + pushed to their sockets)
    if (data.priority === 'critical') {
      await notifyAdmins({
        type: 'critical_maintenance',
        title: 'Critical Maintenance Request',
        message: `Critical ${data.type} request for ${request.machine.name}: ${data.description.substring(0, 100)}`,
      })
    }

    res.status(201).json({ ...request, photos: photoPaths })
  } catch (error) {
    // The request was rejected, so the photos multer already saved are orphans.
    await removeUploadedFiles(requestUploads(req))
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    if (isForeignKeyError(error)) {
      return res.status(404).json({ error: 'Machine not found' })
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
      await removeUploadedFiles(requestUploads(req))
      return res.status(404).json({ error: 'Request not found' })
    }

    const updateData: Record<string, unknown> = { ...data }
    if (data.status === 'resolved') {
      updateData.resolvedAt = new Date()
    }

    // Handle file uploads
    const newPhotos = uploadedPhotoPaths(req)
    if (newPhotos.length > 0) {
      updateData.photos = JSON.stringify([...parseRefList(existing.photos), ...newPhotos])
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
      photos: parseRefList(request.photos),
    })
  } catch (error) {
    await removeUploadedFiles(requestUploads(req))
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

    const existing = await prisma.maintenanceRequest.findUnique({
      where: { id },
      select: { photos: true, updates: { select: { photos: true } } },
    })
    if (!existing) {
      return res.status(404).json({ error: 'Request not found' })
    }

    await prisma.maintenanceRequest.delete({ where: { id } })

    // Photos on the request and its updates are no longer referenced anywhere.
    await removeUploadedFiles([
      ...parseRefList(existing.photos),
      ...existing.updates.flatMap((u) => parseRefList(u.photos)),
    ])

    res.json({ success: true })
  } catch (error) {
    if (isNotFoundError(error)) {
      return res.status(404).json({ error: 'Request not found' })
    }
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
      photos: parseRefList(u.photos),
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
    const photoPaths = uploadedPhotoPaths(req)

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

    res.status(201).json({ ...update, photos: photoPaths })
  } catch (error) {
    await removeUploadedFiles(requestUploads(req))
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    if (isForeignKeyError(error)) {
      return res.status(404).json({ error: 'Request not found' })
    }
    console.error('Add maintenance update error:', error)
    res.status(500).json({ error: 'Failed to add maintenance update' })
  }
})

export { router as maintenanceRouter }
