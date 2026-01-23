import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

const createTypeSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['robot', 'printer']),
  icon: z.string().optional(),
  fieldsSchema: z.record(z.any()).optional(),
})

// Get all machine types
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const types = await prisma.machineType.findMany({
      orderBy: { name: 'asc' },
    })

    // Parse fieldsSchema from JSON string
    const parsedTypes = types.map((type) => ({
      ...type,
      fieldsSchema: type.fieldsSchema ? JSON.parse(type.fieldsSchema) : {},
    }))

    res.json(parsedTypes)
  } catch (error) {
    console.error('Get machine types error:', error)
    res.status(500).json({ error: 'Failed to get machine types' })
  }
})

// Create machine type (admin only)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const data = createTypeSchema.parse(req.body)

    const type = await prisma.machineType.create({
      data: {
        name: data.name,
        category: data.category,
        icon: data.icon || null,
        fieldsSchema: data.fieldsSchema ? JSON.stringify(data.fieldsSchema) : null,
      },
    })

    res.status(201).json({
      ...type,
      fieldsSchema: type.fieldsSchema ? JSON.parse(type.fieldsSchema) : {},
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Create machine type error:', error)
    res.status(500).json({ error: 'Failed to create machine type' })
  }
})

// Update machine type (admin only)
router.patch('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const data = createTypeSchema.partial().parse(req.body)

    const updateData: Record<string, unknown> = { ...data }
    if (data.fieldsSchema !== undefined) {
      updateData.fieldsSchema = data.fieldsSchema ? JSON.stringify(data.fieldsSchema) : null
    }

    const type = await prisma.machineType.update({
      where: { id },
      data: updateData,
    })

    res.json({
      ...type,
      fieldsSchema: type.fieldsSchema ? JSON.parse(type.fieldsSchema) : {},
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Update machine type error:', error)
    res.status(500).json({ error: 'Failed to update machine type' })
  }
})

// Delete machine type (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    // Check if any machines use this type
    const machineCount = await prisma.machine.count({ where: { typeId: id } })
    if (machineCount > 0) {
      return res.status(400).json({
        error: `Cannot delete type: ${machineCount} machines are using it`,
      })
    }

    await prisma.machineType.delete({ where: { id } })
    res.json({ success: true })
  } catch (error) {
    console.error('Delete machine type error:', error)
    res.status(500).json({ error: 'Failed to delete machine type' })
  }
})

export { router as machineTypesRouter }
