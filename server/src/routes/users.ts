import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js'
import { isNotFoundError, isUniqueViolation } from '../lib/errors.js'

const router = Router()

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'operator', 'viewer']),
  password: z.string().min(6),
})

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'operator', 'viewer']).optional(),
  password: z.string().min(6).optional(),
  // Required when a user changes their own password
  currentPassword: z.string().optional(),
})

const publicUserSelect = { id: true, email: true, name: true, role: true, createdAt: true } as const

// Create user (admin only)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const data = createUserSchema.parse(req.body)

    const passwordHash = await bcrypt.hash(data.password, 10)

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        passwordHash,
      },
      select: publicUserSelect,
    })

    res.status(201).json(user)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    if (isUniqueViolation(error)) {
      return res.status(400).json({ error: 'Email already in use' })
    }
    console.error('Create user error:', error)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: publicUserSelect,
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
      select: publicUserSelect,
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

    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Only admins can change roles, and the system must always keep one admin.
    const newRole = isAdmin ? data.role : undefined
    if (newRole && newRole !== 'admin' && target.role === 'admin') {
      const adminCount = await prisma.user.count({ where: { role: 'admin' } })
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last administrator' })
      }
    }

    // Build the update explicitly so nothing else from the body reaches the database.
    const updateData: { name?: string; email?: string; role?: string; passwordHash?: string } = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.email !== undefined) updateData.email = data.email
    if (newRole !== undefined) updateData.role = newRole

    if (data.password) {
      // Changing your own password needs the current one (a stolen session must
      // not be able to lock the real owner out). Admins resetting someone else's do not.
      if (isSelf) {
        if (!data.currentPassword) {
          return res.status(400).json({ error: 'Current password is required' })
        }
        const valid = await bcrypt.compare(data.currentPassword, target.passwordHash)
        if (!valid) {
          return res.status(400).json({ error: 'Current password is incorrect' })
        }
      }
      updateData.passwordHash = await bcrypt.hash(data.password, 10)
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: publicUserSelect,
    })

    res.json(user)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    if (isUniqueViolation(error)) {
      return res.status(400).json({ error: 'Email already in use' })
    }
    if (isNotFoundError(error)) {
      return res.status(404).json({ error: 'User not found' })
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
    if (isNotFoundError(error)) {
      return res.status(404).json({ error: 'User not found' })
    }
    console.error('Delete user error:', error)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

export { router as usersRouter }
