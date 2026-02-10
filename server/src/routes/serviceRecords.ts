import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authenticate, requireOperator, AuthRequest } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'

const router = Router()
const prisma = new PrismaClient()

const updateServiceRecordSchema = z.object({
  type: z.enum(['repair', 'upgrade', 'modification', 'calibration']).optional(),
  description: z.string().optional(),
  partsUsed: z.string().nullable().optional(),
  cost: z.union([z.number(), z.string()]).nullable().optional().transform((val) => {
    if (val === null || val === undefined || val === '') return null
    const num = typeof val === 'string' ? parseFloat(val) : val
    return isNaN(num) ? null : num
  }),
  performedBy: z.string().optional(),
  performedAt: z.string().optional(),
  notes: z.string().nullable().optional(),
  photos: z.array(z.string()).optional(),
})

// Get all service records
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { machineId, type } = req.query

    const where: Record<string, unknown> = {}
    if (machineId) where.machineId = machineId
    if (type) where.type = type

    const records = await prisma.serviceRecord.findMany({
      where,
      include: {
        machine: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { performedAt: 'desc' },
    })

    // Parse photos and attachments JSON
    const parsedRecords = records.map((record) => ({
      ...record,
      photos: record.photos ? JSON.parse(record.photos) : [],
      attachments: record.attachments ? JSON.parse(record.attachments) : [],
    }))

    res.json(parsedRecords)
  } catch (error) {
    console.error('Get service records error:', error)
    res.status(500).json({ error: 'Failed to get service records' })
  }
})

// Get service record by ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const record = await prisma.serviceRecord.findUnique({
      where: { id },
      include: {
        machine: true,
        user: { select: { id: true, name: true, email: true } },
      },
    })

    if (!record) {
      return res.status(404).json({ error: 'Service record not found' })
    }

    res.json({
      ...record,
      photos: record.photos ? JSON.parse(record.photos) : [],
      attachments: record.attachments ? JSON.parse(record.attachments) : [],
    })
  } catch (error) {
    console.error('Get service record error:', error)
    res.status(500).json({ error: 'Failed to get service record' })
  }
})

// Update service record
router.patch('/:id', authenticate, requireOperator, upload.fields([{ name: 'photos', maxCount: 5 }, { name: 'attachments', maxCount: 10 }]), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const data = updateServiceRecordSchema.parse(req.body)

    const existing = await prisma.serviceRecord.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ error: 'Service record not found' })
    }

    const updateData: Record<string, unknown> = { ...data }
    if (data.performedAt) {
      updateData.performedAt = new Date(data.performedAt)
    }

    // Handle photo uploads - merge with existing photos
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
    if (files?.photos && files.photos.length > 0) {
      const newPhotos = files.photos.map((f) => `/uploads/${f.filename}`)
      const existingPhotos = existing.photos ? JSON.parse(existing.photos) : []
      updateData.photos = JSON.stringify([...existingPhotos, ...newPhotos])
    } else if (data.photos !== undefined) {
      updateData.photos = data.photos ? JSON.stringify(data.photos) : null
    }

    // Handle general file attachments - merge with existing attachments
    if (files?.attachments && files.attachments.length > 0) {
      const newAttachments = files.attachments.map((f) => ({
        filename: `/uploads/${f.filename}`,
        originalName: f.originalname,
        fileType: f.mimetype,
      }))
      const existingAttachments = existing.attachments ? JSON.parse(existing.attachments) : []
      updateData.attachments = JSON.stringify([...existingAttachments, ...newAttachments])
    }

    const record = await prisma.serviceRecord.update({
      where: { id },
      data: updateData,
      include: {
        machine: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    })

    res.json({
      ...record,
      photos: record.photos ? JSON.parse(record.photos) : [],
      attachments: record.attachments ? JSON.parse(record.attachments) : [],
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Update service record error:', error)
    res.status(500).json({ error: 'Failed to update service record' })
  }
})

// Delete service record
router.delete('/:id', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    await prisma.serviceRecord.delete({ where: { id } })
    res.json({ success: true })
  } catch (error) {
    console.error('Delete service record error:', error)
    res.status(500).json({ error: 'Failed to delete service record' })
  }
})

export { router as serviceRecordsRouter }
