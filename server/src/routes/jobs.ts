import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authenticate, requireOperator, AuthRequest } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

const createJobSchema = z.object({
  machineId: z.string().min(1),
  name: z.string().min(1),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']).optional(),
  notes: z.string().optional(),
})

const updateJobSchema = createJobSchema.partial()

// Get all jobs
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { machineId, status, limit } = req.query

    const where: Record<string, unknown> = {}
    if (machineId) where.machineId = machineId
    if (status) where.status = status

    const jobs = await prisma.job.findMany({
      where,
      include: {
        machine: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { startTime: 'desc' },
      take: limit ? parseInt(limit as string) : 100,
    })

    res.json(jobs)
  } catch (error) {
    console.error('Get jobs error:', error)
    res.status(500).json({ error: 'Failed to get jobs' })
  }
})

// Get job by ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        machine: true,
        user: { select: { id: true, name: true, email: true } },
      },
    })

    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    res.json(job)
  } catch (error) {
    console.error('Get job error:', error)
    res.status(500).json({ error: 'Failed to get job' })
  }
})

// Create job
router.post('/', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const data = createJobSchema.parse(req.body)

    const job = await prisma.job.create({
      data: {
        machineId: data.machineId,
        userId: req.user!.id,
        name: data.name,
        startTime: data.startTime ? new Date(data.startTime) : null,
        endTime: data.endTime ? new Date(data.endTime) : null,
        status: data.status || 'queued',
        notes: data.notes || null,
      },
      include: {
        machine: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        machineId: data.machineId,
        userId: req.user!.id,
        action: 'job_created',
        details: `Created job: ${data.name}`,
      },
    })

    res.status(201).json(job)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Create job error:', error)
    res.status(500).json({ error: 'Failed to create job' })
  }
})

// Update job
router.patch('/:id', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const data = updateJobSchema.parse(req.body)

    const updateData: Record<string, unknown> = {}
    if (data.name) updateData.name = data.name
    if (data.status) updateData.status = data.status
    if (data.notes !== undefined) updateData.notes = data.notes
    if (data.startTime) updateData.startTime = new Date(data.startTime)
    if (data.endTime) updateData.endTime = new Date(data.endTime)

    const job = await prisma.job.update({
      where: { id },
      data: updateData,
      include: {
        machine: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    })

    // Log status changes
    if (data.status) {
      await prisma.activityLog.create({
        data: {
          machineId: job.machineId,
          userId: req.user!.id,
          action: 'job_status_changed',
          details: `Job "${job.name}" status changed to ${data.status}`,
        },
      })

      // Emit notification if job completed or failed
      if (data.status === 'completed' || data.status === 'failed') {
        const io = req.app.get('io')
        io.emit('notification', {
          type: 'job_complete',
          title: `Job ${data.status}`,
          message: `Job "${job.name}" has ${data.status}`,
        })
      }
    }

    res.json(job)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Update job error:', error)
    res.status(500).json({ error: 'Failed to update job' })
  }
})

// Delete job
router.delete('/:id', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    await prisma.job.delete({ where: { id } })
    res.json({ success: true })
  } catch (error) {
    console.error('Delete job error:', error)
    res.status(500).json({ error: 'Failed to delete job' })
  }
})

export { router as jobsRouter }
