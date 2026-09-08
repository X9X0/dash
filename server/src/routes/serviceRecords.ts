import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireOperator, AuthRequest } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'
import { isNotFoundError, parseDate } from '../lib/errors.js'
import { UPLOAD_REF, parseAttachmentList, parseRefList, removeUploadedFiles, requestUploads } from '../lib/files.js'

const router = Router()

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
  // The remaining photo list after the user removed some; only our own upload refs are allowed
  photos: z.array(z.string().regex(UPLOAD_REF, 'Invalid photo reference')).optional(),
})

function parseRecord<T extends { photos: string | null; attachments: string | null }>(record: T) {
  return {
    ...record,
    photos: parseRefList(record.photos),
    attachments: parseAttachmentList(record.attachments),
  }
}

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

    res.json(records.map(parseRecord))
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

    res.json(parseRecord(record))
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
      await removeUploadedFiles(requestUploads(req))
      return res.status(404).json({ error: 'Service record not found' })
    }

    const { photos: requestedPhotos, ...fields } = data
    const updateData: Record<string, unknown> = { ...fields }
    if (data.performedAt) {
      const performedAt = parseDate(data.performedAt)
      if (!performedAt) {
        await removeUploadedFiles(requestUploads(req))
        return res.status(400).json({ error: 'Invalid performedAt date' })
      }
      updateData.performedAt = performedAt
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
    const existingPhotos = parseRefList(existing.photos)
    let removedPhotos: string[] = []

    // Photos: new uploads are appended; otherwise an explicit list replaces the
    // current one and any photo dropped from it is deleted from disk.
    if (files?.photos && files.photos.length > 0) {
      const newPhotos = files.photos.map((f) => `/uploads/${f.filename}`)
      updateData.photos = JSON.stringify([...existingPhotos, ...newPhotos])
    } else if (requestedPhotos !== undefined) {
      const keep = new Set(requestedPhotos)
      removedPhotos = existingPhotos.filter((p) => !keep.has(p))
      updateData.photos = requestedPhotos.length > 0 ? JSON.stringify(requestedPhotos) : null
    }

    // Attachments: merge with existing
    if (files?.attachments && files.attachments.length > 0) {
      const newAttachments = files.attachments.map((f) => ({
        filename: `/uploads/${f.filename}`,
        originalName: f.originalname,
        fileType: f.mimetype,
      }))
      updateData.attachments = JSON.stringify([...parseAttachmentList(existing.attachments), ...newAttachments])
    }

    const record = await prisma.serviceRecord.update({
      where: { id },
      data: updateData,
      include: {
        machine: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    })

    await removeUploadedFiles(removedPhotos)

    res.json(parseRecord(record))
  } catch (error) {
    await removeUploadedFiles(requestUploads(req))
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message })
    }
    console.error('Update service record error:', error)
    res.status(500).json({ error: 'Failed to update service record' })
  }
})

// Delete service record
router.delete('/:id', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string

    const existing = await prisma.serviceRecord.findUnique({
      where: { id },
      select: { photos: true, attachments: true },
    })
    if (!existing) {
      return res.status(404).json({ error: 'Service record not found' })
    }

    await prisma.serviceRecord.delete({ where: { id } })

    await removeUploadedFiles([
      ...parseRefList(existing.photos),
      ...parseAttachmentList(existing.attachments).map((a) => a.filename),
    ])

    res.json({ success: true })
  } catch (error) {
    if (isNotFoundError(error)) {
      return res.status(404).json({ error: 'Service record not found' })
    }
    console.error('Delete service record error:', error)
    res.status(500).json({ error: 'Failed to delete service record' })
  }
})

export { router as serviceRecordsRouter }
