import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'operator', 'viewer']).optional(),
  password: z.string().min(6).optional(),
})

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    })
    res.json(user)
  } catch (error) {
    console.error('Get me error:', error)
    res.status(500).json({ error: 'Failed to get user' })
  }
})

// Get all users (admin only)
router.get('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json(users)
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Failed to get users' })
  }
})

// Update user (admin only, or self)
router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const isAdmin = req.user!.role === 'admin'
    const isSelf = req.user!.id === id

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    const data = updateUserSchema.parse(req.body)

    // Non-admins can't change roles
    if (data.role && !isAdmin) {
      delete data.role
    }

    const updateData: Record<string, unknown> = { ...data }
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10)
      delete updateData.password
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    })

    res.json(user)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Update user error:', error)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// Delete user (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string

    // Prevent deleting self
    if (req.user!.id === id) {
      return res.status(400).json({ error: 'Cannot delete yourself' })
    }

    await prisma.user.delete({ where: { id } })
    res.json({ success: true })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

export { router as usersRouter }
