import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'
import { authenticate, requireAdmin, requireOperator, AuthRequest } from '../middleware/auth.js'

const execAsync = promisify(exec)
const router = Router()
const prisma = new PrismaClient()

const addIPSchema = z.object({
  label: z.string().min(1),
  ipAddress: z.string().min(1),
})

const createMachineSchema = z.object({
  name: z.string().min(1),
  typeId: z.string().min(1),
  model: z.string().min(1),
  location: z.string().min(1),
  status: z.enum(['available', 'in_use', 'maintenance', 'offline', 'error']).optional(),
  hourMeter: z.number().min(0).optional(),
  buildDate: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  autoHourTracking: z.boolean().optional(),
})

const updateMachineSchema = createMachineSchema.partial()

const updateStatusSchema = z.object({
  status: z.enum(['available', 'in_use', 'maintenance', 'offline', 'error']),
  source: z.enum(['manual', 'api']).optional(),
})

const addHoursSchema = z.object({
  hours: z.number().positive(),
  date: z.string().optional(),
  notes: z.string().nullable().optional(),
})

// Get all machines (public - for kiosk mode)
router.get('/public', async (req, res) => {
  try {
    const machines = await prisma.machine.findMany({
      include: {
        type: true,
        ips: true,
      },
      orderBy: { name: 'asc' },
    })
    res.json(machines)
  } catch (error) {
    console.error('Get public machines error:', error)
    res.status(500).json({ error: 'Failed to get machines' })
  }
})

// Get all machines
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const machines = await prisma.machine.findMany({
      include: {
        type: true,
        ips: true,
        customFields: true,
      },
      orderBy: { name: 'asc' },
    })
    res.json(machines)
  } catch (error) {
    console.error('Get machines error:', error)
    res.status(500).json({ error: 'Failed to get machines' })
  }
})

// Get machine by ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const machine = await prisma.machine.findUnique({
      where: { id },
      include: {
        type: true,
        ips: true,
        customFields: true,
        statusLogs: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
      },
    })

    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' })
    }

    res.json(machine)
  } catch (error) {
    console.error('Get machine error:', error)
    res.status(500).json({ error: 'Failed to get machine' })
  }
})

// Create machine (admin only)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const data = createMachineSchema.parse(req.body)

    const machine = await prisma.machine.create({
      data: {
        name: data.name,
        typeId: data.typeId,
        model: data.model,
        location: data.location,
        status: data.status || 'available',
        hourMeter: data.hourMeter || 0,
        buildDate: data.buildDate ? new Date(data.buildDate) : null,
        icon: data.icon || null,
        notes: data.notes || null,
      },
      include: {
        type: true,
        ips: true,
        customFields: true,
      },
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        machineId: machine.id,
        userId: req.user!.id,
        action: 'machine_created',
        details: `Created machine: ${machine.name}`,
      },
    })

    res.status(201).json(machine)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Create machine error:', error)
    res.status(500).json({ error: 'Failed to create machine' })
  }
})

// Update machine (admin only)
router.patch('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const data = updateMachineSchema.parse(req.body)

    const updateData: Record<string, unknown> = { ...data }
    if (data.buildDate !== undefined) {
      updateData.buildDate = data.buildDate ? new Date(data.buildDate) : null
    }

    const machine = await prisma.machine.update({
      where: { id },
      data: updateData,
      include: {
        type: true,
        ips: true,
        customFields: true,
      },
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        machineId: machine.id,
        userId: req.user!.id,
        action: 'machine_updated',
        details: `Updated machine: ${machine.name}`,
      },
    })

    // Emit socket event
    const io = req.app.get('io')
    io.emit('machine:update', machine)

    res.json(machine)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Update machine error:', error)
    res.status(500).json({ error: 'Failed to update machine' })
  }
})

// Update machine status
router.patch('/:id/status', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const { status, source } = updateStatusSchema.parse(req.body)

    const machine = await prisma.machine.update({
      where: { id },
      data: { status },
      include: { type: true },
    })

    // Log status change
    await prisma.machineStatusLog.create({
      data: {
        machineId: id,
        status,
        source: source || 'manual',
      },
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        machineId: id,
        userId: req.user!.id,
        action: 'status_changed',
        details: `Status changed to: ${status}`,
      },
    })

    // Emit socket event
    const io = req.app.get('io')
    io.emit('machine:status', { machineId: id, status })

    res.json(machine)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Update status error:', error)
    res.status(500).json({ error: 'Failed to update status' })
  }
})

// Add hours to machine
router.post('/:id/hours', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const { hours, date, notes } = addHoursSchema.parse(req.body)

    // Create hour entry
    const hourEntry = await prisma.hourEntry.create({
      data: {
        machineId: id,
        userId: req.user!.id,
        hours,
        date: date ? new Date(date) : new Date(),
        notes: notes || null,
      },
    })

    // Update machine hour meter
    await prisma.machine.update({
      where: { id },
      data: { hourMeter: { increment: hours } },
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        machineId: id,
        userId: req.user!.id,
        action: 'hours_logged',
        details: `Logged ${hours} hours`,
      },
    })

    res.status(201).json(hourEntry)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Add hours error:', error)
    res.status(500).json({ error: 'Failed to add hours' })
  }
})

// Delete machine (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    await prisma.machine.delete({ where: { id } })
    res.json({ success: true })
  } catch (error) {
    console.error('Delete machine error:', error)
    res.status(500).json({ error: 'Failed to delete machine' })
  }
})

// Get service history for machine
router.get('/:id/service-history', authenticate, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const records = await prisma.serviceRecord.findMany({
      where: { machineId: id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { performedAt: 'desc' },
    })
    res.json(records)
  } catch (error) {
    console.error('Get service history error:', error)
    res.status(500).json({ error: 'Failed to get service history' })
  }
})

// Add service record
router.post('/:id/service-history', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const data = req.body

    const record = await prisma.serviceRecord.create({
      data: {
        machineId: id,
        userId: req.user!.id,
        type: data.type,
        description: data.description,
        partsUsed: data.partsUsed || null,
        cost: data.cost || null,
        performedBy: data.performedBy,
        performedAt: new Date(data.performedAt),
        notes: data.notes || null,
        photos: data.photos ? JSON.stringify(data.photos) : null,
      },
      include: { user: { select: { id: true, name: true } } },
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        machineId: id,
        userId: req.user!.id,
        action: 'service_recorded',
        details: `Logged ${data.type}: ${data.description}`,
      },
    })

    res.status(201).json(record)
  } catch (error) {
    console.error('Add service record error:', error)
    res.status(500).json({ error: 'Failed to add service record' })
  }
})

// Add IP address to machine
router.post('/:id/ips', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const { label, ipAddress } = addIPSchema.parse(req.body)

    const ip = await prisma.machineIP.create({
      data: {
        machineId: id,
        label,
        ipAddress,
      },
    })

    res.status(201).json(ip)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Add IP error:', error)
    res.status(500).json({ error: 'Failed to add IP address' })
  }
})

// Update IP address
router.patch('/:id/ips/:ipId', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const ipId = req.params.ipId as string
    const { label, ipAddress } = addIPSchema.partial().parse(req.body)

    const ip = await prisma.machineIP.update({
      where: { id: ipId },
      data: { label, ipAddress },
    })

    res.json(ip)
  } catch (error) {
    console.error('Update IP error:', error)
    res.status(500).json({ error: 'Failed to update IP address' })
  }
})

// Delete IP address
router.delete('/:id/ips/:ipId', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const ipId = req.params.ipId as string
    await prisma.machineIP.delete({ where: { id: ipId } })
    res.json({ success: true })
  } catch (error) {
    console.error('Delete IP error:', error)
    res.status(500).json({ error: 'Failed to delete IP address' })
  }
})

// Ping machine to check reachability
router.get('/:id/ping', authenticate, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const machine = await prisma.machine.findUnique({
      where: { id },
      include: { ips: true },
    })

    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' })
    }

    if (!machine.ips || machine.ips.length === 0) {
      return res.json({ reachable: false, reason: 'No IP addresses configured' })
    }

    // Ping each IP and return results
    const pingResults = await Promise.all(
      machine.ips.map(async (ip: { id: string; label: string; ipAddress: string }) => {
        try {
          // Use platform-appropriate ping command
          const isWindows = process.platform === 'win32'
          const pingCmd = isWindows
            ? `ping -n 1 -w 2000 ${ip.ipAddress}`
            : `ping -c 1 -W 2 ${ip.ipAddress}`

          await execAsync(pingCmd, { timeout: 5000 })
          return { id: ip.id, label: ip.label, ipAddress: ip.ipAddress, reachable: true, latency: null }
        } catch {
          return { id: ip.id, label: ip.label, ipAddress: ip.ipAddress, reachable: false, latency: null }
        }
      })
    )

    const anyReachable = pingResults.some((r: { reachable: boolean }) => r.reachable)

    res.json({
      reachable: anyReachable,
      ips: pingResults,
    })
  } catch (error) {
    console.error('Ping error:', error)
    res.status(500).json({ error: 'Failed to ping machine' })
  }
})

// Ping all machines (batch)
router.get('/ping/all', authenticate, async (req: AuthRequest, res) => {
  try {
    const machines = await prisma.machine.findMany({
      include: { ips: true },
    })

    const results = await Promise.all(
      machines.map(async (machine) => {
        if (!machine.ips || machine.ips.length === 0) {
          return { machineId: machine.id, reachable: null }
        }

        // Ping first IP only for batch check
        const ip = machine.ips[0]
        try {
          const isWindows = process.platform === 'win32'
          const pingCmd = isWindows
            ? `ping -n 1 -w 1000 ${ip.ipAddress}`
            : `ping -c 1 -W 1 ${ip.ipAddress}`

          await execAsync(pingCmd, { timeout: 3000 })
          return { machineId: machine.id, reachable: true }
        } catch {
          return { machineId: machine.id, reachable: false }
        }
      })
    )

    res.json(results)
  } catch (error) {
    console.error('Batch ping error:', error)
    res.status(500).json({ error: 'Failed to ping machines' })
  }
})

// Ping all machines (public - for kiosk mode)
router.get('/ping/all/public', async (req, res) => {
  try {
    const machines = await prisma.machine.findMany({
      include: { ips: true },
    })

    const results = await Promise.all(
      machines.map(async (machine) => {
        if (!machine.ips || machine.ips.length === 0) {
          return { machineId: machine.id, reachable: null }
        }

        const ip = machine.ips[0]
        try {
          const isWindows = process.platform === 'win32'
          const pingCmd = isWindows
            ? `ping -n 1 -w 1000 ${ip.ipAddress}`
            : `ping -c 1 -W 1 ${ip.ipAddress}`

          await execAsync(pingCmd, { timeout: 3000 })
          return { machineId: machine.id, reachable: true }
        } catch {
          return { machineId: machine.id, reachable: false }
        }
      })
    )

    res.json(results)
  } catch (error) {
    console.error('Public batch ping error:', error)
    res.status(500).json({ error: 'Failed to ping machines' })
  }
})

export { router as machinesRouter }
