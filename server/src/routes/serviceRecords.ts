import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authenticate, requireOperator, AuthRequest } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

const updateServiceRecordSchema = z.object({
  type: z.enum(['repair', 'upgrade', 'modification', 'calibration']).optional(),
  description: z.string().optional(),
  partsUsed: z.string().nullable().optional(),
  cost: z.number().nullable().optional(),
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

    // Parse photos JSON
    const parsedRecords = records.map((record) => ({
      ...record,
      photos: record.photos ? JSON.parse(record.photos) : [],
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
    })
  } catch (error) {
    console.error('Get service record error:', error)
    res.status(500).json({ error: 'Failed to get service record' })
  }
})

// Update service record
router.patch('/:id', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const data = updateServiceRecordSchema.parse(req.body)

    const updateData: Record<string, unknown> = { ...data }
    if (data.performedAt) {
      updateData.performedAt = new Date(data.performedAt)
    }
    if (data.photos !== undefined) {
      updateData.photos = data.photos ? JSON.stringify(data.photos) : null
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
