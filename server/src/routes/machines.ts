import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'
import dns from 'dns'
import net from 'net'
import { authenticate, requireAdmin, requireOperator, AuthRequest } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'

const execAsync = promisify(exec)
const dnsLookup = promisify(dns.lookup)
const dnsReverse = promisify(dns.reverse)

// --- DNS Resolution Cache ---
interface DnsCacheEntry {
  resolvedIP: string | null
  resolvedHostname: string | null
  timestamp: number
}
const dnsCache = new Map<string, DnsCacheEntry>()
const DNS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const DNS_TIMEOUT = 2000 // 2 seconds max for any DNS operation

// --- Ping Result Cache ---
interface PingCacheEntry {
  reachable: boolean
  resolvedIP: string | null
  resolvedHostname: string | null
  timestamp: number
}
const pingCache = new Map<string, PingCacheEntry>()
const PING_CACHE_TTL = 10 * 1000 // 10 seconds

// Clean expired cache entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of dnsCache) {
    if (now - entry.timestamp > DNS_CACHE_TTL) dnsCache.delete(key)
  }
  for (const [key, entry] of pingCache) {
    if (now - entry.timestamp > PING_CACHE_TTL) pingCache.delete(key)
  }
}, 60 * 1000) // Clean every minute

// Check if a string is an IP address using Node's built-in net module
function isIPAddress(str: string): boolean {
  return net.isIP(str) !== 0
}

// Wrap a promise with a timeout
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

// Try to resolve hostname from IP using platform commands (nbtstat, ping -a)
// This works on Windows LANs where DNS PTR records don't exist
async function resolveHostnameViaSystem(ip: string): Promise<string | null> {
  const isWindows = process.platform === 'win32'
  try {
    if (isWindows) {
      // Try nbtstat first (NetBIOS name resolution - works on most Windows LANs)
      try {
        const { stdout } = await execAsync(`nbtstat -A ${ip}`, { timeout: 3000 })
        const match = stdout.match(/<00>\s+UNIQUE\s+Registered\s+(\S+)/i) ||
                      stdout.match(/^\s*(\S+)\s+<00>/m)
        if (match?.[1] && match[1] !== ip) {
          return match[1].trim().toLowerCase()
        }
      } catch {
        // nbtstat failed, try ping -a
      }

      // Try ping -a (asks Windows to resolve the name)
      try {
        const { stdout } = await execAsync(`ping -a -n 1 -w 1000 ${ip}`, { timeout: 3000 })
        const match = stdout.match(/Pinging\s+(\S+)\s+\[/)
        if (match?.[1] && match[1] !== ip) {
          return match[1].trim().toLowerCase()
        }
      } catch {
        // ping -a also failed
      }
    } else {
      // On Linux/Mac, try multiple reverse resolution strategies

      // Strategy 1: host command (standard reverse DNS)
      try {
        const { stdout } = await execAsync(`host ${ip}`, { timeout: 3000 })
        const match = stdout.match(/domain name pointer\s+(\S+)/i)
        if (match?.[1]) {
          return match[1].replace(/\.$/, '').replace(/\.local$/, '').toLowerCase()
        }
      } catch {
        // host command failed
      }

      // Strategy 2: nmblookup (Samba NetBIOS - equivalent of Windows nbtstat)
      try {
        const { stdout } = await execAsync(`nmblookup -A ${ip}`, { timeout: 3000 })
        const match = stdout.match(/^\s+(\S+)\s+<00>\s+-\s+.*<ACTIVE>/mi)
        if (match?.[1] && match[1] !== ip) {
          return match[1].trim().toLowerCase()
        }
      } catch {
        // nmblookup not installed or failed
      }

      // Strategy 3: avahi-resolve-address (mDNS/Bonjour)
      try {
        const { stdout } = await execAsync(`avahi-resolve-address ${ip}`, { timeout: 3000 })
        const match = stdout.match(/\s+(\S+)\s*$/)
        if (match?.[1] && match[1] !== ip) {
          return match[1].replace(/\.$/, '').replace(/\.local$/, '').trim().toLowerCase()
        }
      } catch {
        // avahi-resolve not installed or failed
      }
    }
  } catch {
    // All system resolution attempts failed
  }
  return null
}

// Try to resolve IP from hostname using platform commands
async function resolveIPViaSystem(hostname: string): Promise<string | null> {
  const isWindows = process.platform === 'win32'
  try {
    if (isWindows) {
      // Try nslookup first
      try {
        const { stdout } = await execAsync(`nslookup ${hostname}`, { timeout: 3000 })
        // nslookup output: look for the address after the "Name:" line
        const lines = stdout.split('\n')
        let foundName = false
        for (const line of lines) {
          if (foundName && line.match(/Address/i)) {
            const match = line.match(/Address\S*:\s*(\S+)/)
            if (match?.[1] && net.isIP(match[1])) {
              return match[1]
            }
          }
          if (line.match(/Name/i)) foundName = true
        }
      } catch {
        // nslookup failed
      }

      // Try ping -a (uses LLMNR/mDNS which works on LANs where DNS doesn't)
      // Output: "Pinging hostname.domain [192.168.1.1] with 32 bytes of data:"
      try {
        const { stdout } = await execAsync(`ping -a -n 1 -w 1000 ${hostname}`, { timeout: 3000 })
        const match = stdout.match(/Pinging\s+\S+\s+\[(\S+)\]/)
        if (match?.[1] && net.isIP(match[1])) {
          return match[1]
        }
      } catch {
        // ping -a failed
      }
    } else {
      // Strategy 1: getent hosts
      try {
        const { stdout } = await execAsync(`getent hosts ${hostname}`, { timeout: 3000 })
        const match = stdout.match(/^(\S+)/)
        if (match?.[1] && net.isIP(match[1])) {
          return match[1]
        }
      } catch {
        // getent failed
      }

      // Strategy 2: nmblookup (NetBIOS forward lookup)
      try {
        const { stdout } = await execAsync(`nmblookup ${hostname}`, { timeout: 3000 })
        const match = stdout.match(/^(\S+)\s+\S+<00>/m)
        if (match?.[1] && net.isIP(match[1])) {
          return match[1]
        }
      } catch {
        // nmblookup not installed or failed
      }

      // Strategy 3: ping with .local suffix (mDNS - common on Linux LANs)
      // Linux ping output: "PING hostname.local (192.168.1.1) ..."
      if (!hostname.endsWith('.local')) {
        try {
          const { stdout } = await execAsync(`ping -c 1 -W 1 ${hostname}.local`, { timeout: 3000 })
          const match = stdout.match(/PING\s+\S+\s+\((\S+)\)/)
          if (match?.[1] && net.isIP(match[1])) {
            return match[1]
          }
        } catch {
          // ping with .local failed
        }
      }

      // Strategy 4: ping without .local (system resolver)
      try {
        const { stdout } = await execAsync(`ping -c 1 -W 1 ${hostname}`, { timeout: 3000 })
        const match = stdout.match(/PING\s+\S+\s+\((\S+)\)/)
        if (match?.[1] && net.isIP(match[1])) {
          return match[1]
        }
      } catch {
        // ping failed
      }
    }
  } catch {
    // All system resolution attempts failed
  }
  return null
}

// Resolve hostname to IP or do reverse lookup, with caching and fallbacks
// machineNameHint: optional machine name to try as hostname when reverse DNS fails
async function resolveAddress(address: string, machineNameHint?: string): Promise<{ resolvedIP: string | null; resolvedHostname: string | null }> {
  // Check cache first
  const cached = dnsCache.get(address)
  if (cached && Date.now() - cached.timestamp < DNS_CACHE_TTL) {
    return { resolvedIP: cached.resolvedIP, resolvedHostname: cached.resolvedHostname }
  }

  let resolvedIP: string | null = null
  let resolvedHostname: string | null = null

  try {
    if (isIPAddress(address)) {
      resolvedIP = address

      // Strategy 1: Try dns.reverse() with timeout
      try {
        const hostnames = await withTimeout(
          dnsReverse(address),
          DNS_TIMEOUT,
          [] as string[]
        )
        if (hostnames.length > 0 && hostnames[0]) {
          resolvedHostname = hostnames[0].replace(/\.local$/, '').toLowerCase()
        }
      } catch {
        // dns.reverse() failed (common - many networks lack PTR records)
      }

      // Strategy 2: If dns.reverse() failed, try system-level resolution
      if (!resolvedHostname) {
        resolvedHostname = await resolveHostnameViaSystem(address)
      }

      // Strategy 3: If all reverse lookups failed and we have a machine name hint,
      // use it as the hostname. Machine names typically match their network hostnames.
      // Only use names that look like valid hostnames (no spaces, reasonable length).
      if (!resolvedHostname && machineNameHint) {
        const hintName = machineNameHint.trim().toLowerCase()
        if (hintName.length > 0 && hintName.length <= 63 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(hintName)) {
          resolvedHostname = hintName
        }
      }

      if (resolvedHostname) {
        console.log(`[DNS] Resolved ${address} -> ${resolvedHostname}`)
      }
    } else {
      resolvedHostname = address

      // Strategy 1: Try dns.lookup() with timeout
      try {
        const result = await withTimeout(
          dnsLookup(address),
          DNS_TIMEOUT,
          null as { address: string } | null
        )
        if (result?.address) {
          resolvedIP = result.address
        }
      } catch {
        // dns.lookup() failed
      }

      // Strategy 2: Try with .local suffix for mDNS (Linux needs this explicitly)
      if (!resolvedIP && !address.endsWith('.local')) {
        try {
          const result = await withTimeout(
            dnsLookup(address + '.local'),
            DNS_TIMEOUT,
            null as { address: string } | null
          )
          if (result?.address) {
            resolvedIP = result.address
          }
        } catch {
          // mDNS lookup also failed
        }
      }

      // Strategy 3: If dns.lookup() failed, try system-level resolution
      if (!resolvedIP) {
        resolvedIP = await resolveIPViaSystem(address)
      }

      if (resolvedIP) {
        console.log(`[DNS] Resolved ${address} -> ${resolvedIP}`)
      } else {
        console.log(`[DNS] Failed to resolve hostname: ${address}`)
      }
    }
  } catch (error) {
    console.error(`[DNS] Error resolving ${address}:`, error)
  }

  // Cache the result (even failures, to avoid hammering DNS)
  dnsCache.set(address, { resolvedIP, resolvedHostname, timestamp: Date.now() })

  return { resolvedIP, resolvedHostname }
}

// Ping with retry - pings twice before declaring offline
async function pingWithRetry(target: string, retries = 2): Promise<boolean> {
  const isWindows = process.platform === 'win32'
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const pingCmd = isWindows
        ? `ping -n 1 -w 2000 ${target}`
        : `ping -c 1 -W 2 ${target}`
      await execAsync(pingCmd, { timeout: 5000 })
      return true
    } catch {
      // If this wasn't the last attempt, wait briefly before retrying
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
  }
  return false
}

// Get cached ping result or null if not cached/expired
function getCachedPing(target: string): PingCacheEntry | null {
  const cached = pingCache.get(target)
  if (cached && Date.now() - cached.timestamp < PING_CACHE_TTL) {
    return cached
  }
  return null
}
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
  status: z.enum(['available', 'in_use', 'maintenance', 'offline']).optional(),
  condition: z.enum(['functional', 'degraded', 'broken']).optional(),
  conditionNote: z.string().nullable().optional(),
  hourMeter: z.number().min(0).optional(),
  buildDate: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  statusNote: z.string().nullable().optional(),
  autoHourTracking: z.boolean().optional(),
})

const updateMachineSchema = createMachineSchema.partial()

const updateStatusSchema = z.object({
  status: z.enum(['available', 'in_use', 'maintenance', 'offline']),
  condition: z.enum(['functional', 'degraded', 'broken']).optional(),
  source: z.enum(['manual', 'api']).optional(),
})

const updateConditionSchema = z.object({
  condition: z.enum(['functional', 'degraded', 'broken']),
  conditionNote: z.string().nullable().optional(),
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
        claimedBy: { select: { id: true, name: true } },
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
        claimedBy: { select: { id: true, name: true } },
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
        claimedBy: { select: { id: true, name: true } },
        statusLogs: {
          include: { user: { select: { id: true, name: true } } },
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
        condition: data.condition || 'functional',
        conditionNote: data.conditionNote || null,
        hourMeter: data.hourMeter || 0,
        buildDate: data.buildDate ? new Date(data.buildDate) : null,
        icon: data.icon || null,
        notes: data.notes || null,
        statusNote: data.statusNote || null,
        autoHourTracking: data.autoHourTracking ?? true,
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
    const { status, condition, source } = updateStatusSchema.parse(req.body)

    const updateData: Record<string, unknown> = { status }
    if (condition) updateData.condition = condition

    const machine = await prisma.machine.update({
      where: { id },
      data: updateData,
      include: { type: true },
    })

    // Log status change
    await prisma.machineStatusLog.create({
      data: {
        machineId: id,
        userId: req.user!.id,
        status,
        condition: condition || null,
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

// Update status note (operator+)
router.patch('/:id/status-note', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const { statusNote } = z.object({ statusNote: z.string().nullable() }).parse(req.body)

    const machine = await prisma.machine.update({
      where: { id },
      data: { statusNote },
      include: { type: true },
    })

    // Emit socket event
    const io = req.app.get('io')
    io.emit('machine:update', machine)

    res.json(machine)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Update status note error:', error)
    res.status(500).json({ error: 'Failed to update status note' })
  }
})

// Update machine condition (operator+)
router.patch('/:id/condition', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const { condition, conditionNote } = updateConditionSchema.parse(req.body)

    const machine = await prisma.machine.update({
      where: { id },
      data: { condition, conditionNote: conditionNote ?? undefined },
      include: { type: true, claimedBy: { select: { id: true, name: true } } },
    })

    // Log condition change
    await prisma.machineStatusLog.create({
      data: {
        machineId: id,
        userId: req.user!.id,
        status: machine.status,
        condition,
        source: 'manual',
      },
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        machineId: id,
        userId: req.user!.id,
        action: 'condition_changed',
        details: `Condition changed to: ${condition}`,
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
    console.error('Update condition error:', error)
    res.status(500).json({ error: 'Failed to update condition' })
  }
})

// Get unified timeline for machine (service records + maintenance requests + status logs)
router.get('/:id/timeline', authenticate, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string

    const [serviceRecords, maintenanceRequests, statusLogs] = await Promise.all([
      prisma.serviceRecord.findMany({
        where: { machineId: id },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { performedAt: 'desc' },
      }),
      prisma.maintenanceRequest.findMany({
        where: { machineId: id },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.machineStatusLog.findMany({
        where: { machineId: id },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { timestamp: 'desc' },
        take: 50,
      }),
    ])

    // Parse photos JSON for both service records and maintenance requests
    const parsedServiceRecords = serviceRecords.map((r) => ({
      ...r,
      photos: r.photos ? JSON.parse(r.photos) : [],
    }))
    const parsedMaintenanceRequests = maintenanceRequests.map((r) => ({
      ...r,
      photos: r.photos ? JSON.parse(r.photos as string) : [],
    }))

    res.json({ serviceRecords: parsedServiceRecords, maintenanceRequests: parsedMaintenanceRequests, statusLogs })
  } catch (error) {
    console.error('Get timeline error:', error)
    res.status(500).json({ error: 'Failed to get timeline' })
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
    // Parse photos and attachments JSON
    const parsedRecords = records.map((record) => ({
      ...record,
      photos: record.photos ? JSON.parse(record.photos) : [],
      attachments: record.attachments ? JSON.parse(record.attachments) : [],
    }))
    res.json(parsedRecords)
  } catch (error) {
    console.error('Get service history error:', error)
    res.status(500).json({ error: 'Failed to get service history' })
  }
})

// Add service record
router.post('/:id/service-history', authenticate, requireOperator, upload.fields([{ name: 'photos', maxCount: 5 }, { name: 'attachments', maxCount: 10 }]), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const data = req.body

    // Handle photo uploads
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
    const photoPaths = files?.photos?.map((f) => `/uploads/${f.filename}`) || []
    // Also accept JSON photo paths from body (for backward compatibility)
    if (data.photos && typeof data.photos === 'string') {
      try {
        const parsed = JSON.parse(data.photos)
        if (Array.isArray(parsed)) photoPaths.push(...parsed)
      } catch { /* not JSON */ }
    }

    // Handle general file attachments
    const attachments = files?.attachments?.map((f) => ({
      filename: `/uploads/${f.filename}`,
      originalName: f.originalname,
      fileType: f.mimetype,
    })) || []

    const record = await prisma.serviceRecord.create({
      data: {
        machineId: id,
        userId: req.user!.id,
        type: data.type,
        description: data.description,
        partsUsed: data.partsUsed || null,
        cost: data.cost ? parseFloat(data.cost) : null,
        performedBy: data.performedBy,
        performedAt: new Date(data.performedAt),
        notes: data.notes || null,
        photos: photoPaths.length > 0 ? JSON.stringify(photoPaths) : null,
        attachments: attachments.length > 0 ? JSON.stringify(attachments) : null,
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

    res.status(201).json({
      ...record,
      photos: record.photos ? JSON.parse(record.photos) : [],
      attachments: record.attachments ? JSON.parse(record.attachments) : [],
    })
  } catch (error) {
    console.error('Add service record error:', error)
    res.status(500).json({ error: 'Failed to add service record' })
  }
})

// Claim machine
router.patch('/:id/claim', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const schema = z.object({
      duration: z.number().min(5).max(1440).optional(),
      userId: z.string().optional() // Admin can claim for another user
    })
    const { duration = 60, userId } = schema.parse(req.body)

    const machine = await prisma.machine.findUnique({ where: { id } })
    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' })
    }

    // Determine who is claiming the machine
    const claimingUserId = userId && req.user!.role === 'admin' ? userId : req.user!.id

    // If claiming for another user, verify they exist
    if (userId && req.user!.role === 'admin') {
      const targetUser = await prisma.user.findUnique({ where: { id: userId } })
      if (!targetUser) {
        return res.status(404).json({ error: 'Target user not found' })
      }
    } else if (userId && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can claim on behalf of other users' })
    }

    // Reject if already claimed by someone else
    if (machine.claimedById && machine.claimedById !== req.user!.id && machine.claimedById !== claimingUserId) {
      // Check if claim is expired
      if (machine.claimExpiresAt && new Date(machine.claimExpiresAt) > new Date()) {
        return res.status(409).json({ error: 'Machine is already claimed by another user' })
      }
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + duration * 60 * 1000)

    const updated = await prisma.machine.update({
      where: { id },
      data: {
        claimedById: claimingUserId,
        claimedAt: now,
        claimExpiresAt: expiresAt,
        status: 'in_use',
      },
      include: {
        type: true,
        claimedBy: { select: { id: true, name: true } },
      },
    })

    // Log status change
    await prisma.machineStatusLog.create({
      data: { machineId: id, userId: claimingUserId, status: 'in_use', source: 'claim' },
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        machineId: id,
        userId: req.user!.id,
        action: 'machine_claimed',
        details: userId && req.user!.role === 'admin'
          ? `Claimed for ${duration} minutes on behalf of ${updated.claimedBy?.name}`
          : `Claimed for ${duration} minutes`,
      },
    })

    const io = req.app.get('io')
    io.emit('machine:claimed', { machineId: id, claimedBy: updated.claimedBy, expiresAt: expiresAt.toISOString() })

    res.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Claim machine error:', error)
    res.status(500).json({ error: 'Failed to claim machine' })
  }
})

// Release machine claim
router.patch('/:id/release', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string

    const machine = await prisma.machine.findUnique({ where: { id } })
    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' })
    }

    // Allow if claimer is current user OR user is admin
    if (machine.claimedById !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only the claimer or an admin can release this machine' })
    }

    const updated = await prisma.machine.update({
      where: { id },
      data: {
        claimedById: null,
        claimedAt: null,
        claimExpiresAt: null,
        status: 'available',
      },
      include: {
        type: true,
        claimedBy: { select: { id: true, name: true } },
      },
    })

    // Log status change
    await prisma.machineStatusLog.create({
      data: { machineId: id, userId: req.user!.id, status: 'available', source: 'release' },
    })

    // Log activity
    await prisma.activityLog.create({
      data: {
        machineId: id,
        userId: req.user!.id,
        action: 'machine_released',
        details: 'Released machine claim',
      },
    })

    const io = req.app.get('io')
    io.emit('machine:released', { machineId: id })

    res.json(updated)
  } catch (error) {
    console.error('Release machine error:', error)
    res.status(500).json({ error: 'Failed to release machine' })
  }
})

// Upload attachment to machine
router.post('/:id/attachments', authenticate, requireOperator, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const file = req.file

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const attachment = await prisma.machineAttachment.create({
      data: {
        machineId: id,
        userId: req.user!.id,
        filename: file.filename,
        originalName: file.originalname,
        fileType: file.mimetype,
        description: req.body.description || null,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    })

    res.status(201).json(attachment)
  } catch (error) {
    console.error('Upload attachment error:', error)
    res.status(500).json({ error: 'Failed to upload attachment' })
  }
})

// Get attachments for machine
router.get('/:id/attachments', authenticate, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const attachments = await prisma.machineAttachment.findMany({
      where: { machineId: id },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(attachments)
  } catch (error) {
    console.error('Get attachments error:', error)
    res.status(500).json({ error: 'Failed to get attachments' })
  }
})

// Delete attachment
router.delete('/:id/attachments/:attachmentId', authenticate, requireOperator, async (req: AuthRequest, res) => {
  try {
    const attachmentId = req.params.attachmentId as string

    const attachment = await prisma.machineAttachment.findUnique({ where: { id: attachmentId } })
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' })
    }

    // Only uploader or admin can delete
    if (attachment.userId !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this attachment' })
    }

    await prisma.machineAttachment.delete({ where: { id: attachmentId } })
    res.json({ success: true })
  } catch (error) {
    console.error('Delete attachment error:', error)
    res.status(500).json({ error: 'Failed to delete attachment' })
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

// Get custom fields for a machine
router.get('/:id/custom-fields', authenticate, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const customFields = await prisma.machineCustomField.findMany({
      where: { machineId: id },
    })
    res.json(customFields)
  } catch (error) {
    console.error('Get custom fields error:', error)
    res.status(500).json({ error: 'Failed to get custom fields' })
  }
})

// Update custom fields for a machine (bulk upsert)
router.put('/:id/custom-fields', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const fields = req.body as Array<{ fieldName: string; fieldValue: string }>

    // Delete existing custom fields for this machine
    await prisma.machineCustomField.deleteMany({
      where: { machineId: id },
    })

    // Create new custom fields
    if (fields && fields.length > 0) {
      await prisma.machineCustomField.createMany({
        data: fields.map((field) => ({
          machineId: id,
          fieldName: field.fieldName,
          fieldValue: field.fieldValue,
        })),
      })
    }

    // Return updated custom fields
    const customFields = await prisma.machineCustomField.findMany({
      where: { machineId: id },
    })

    res.json(customFields)
  } catch (error) {
    console.error('Update custom fields error:', error)
    res.status(500).json({ error: 'Failed to update custom fields' })
  }
})

// Ping machine to check reachability (with retry and caching)
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

    // Ping each IP with retry logic and DNS resolution
    const pingResults = await Promise.all(
      machine.ips.map(async (ip: { id: string; label: string; ipAddress: string }) => {
        const { resolvedIP, resolvedHostname } = await resolveAddress(ip.ipAddress, machine.name)
        const pingTarget = resolvedIP || ip.ipAddress

        // Check ping cache first
        const cached = getCachedPing(pingTarget)
        if (cached) {
          return {
            id: ip.id,
            label: ip.label,
            ipAddress: ip.ipAddress,
            resolvedIP: cached.resolvedIP ?? resolvedIP,
            resolvedHostname: cached.resolvedHostname ?? resolvedHostname,
            reachable: cached.reachable,
          }
        }

        // Ping with retry (2 attempts before declaring offline)
        const reachable = await pingWithRetry(pingTarget, 2)

        // Cache the result
        pingCache.set(pingTarget, {
          reachable,
          resolvedIP,
          resolvedHostname,
          timestamp: Date.now(),
        })

        return {
          id: ip.id,
          label: ip.label,
          ipAddress: ip.ipAddress,
          resolvedIP,
          resolvedHostname,
          reachable,
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

// Helper: ping a single machine's first IP with caching and retry
async function pingMachineFirstIP(machine: { id: string; name: string; ips: Array<{ ipAddress: string }> }) {
  if (!machine.ips || machine.ips.length === 0) {
    return { machineId: machine.id, reachable: null, resolvedIP: null, resolvedHostname: null }
  }

  const ip = machine.ips[0]
  const { resolvedIP, resolvedHostname } = await resolveAddress(ip.ipAddress, machine.name)
  const pingTarget = resolvedIP || ip.ipAddress

  // Check ping cache first
  const cached = getCachedPing(pingTarget)
  if (cached) {
    return {
      machineId: machine.id,
      reachable: cached.reachable,
      resolvedIP: cached.resolvedIP ?? resolvedIP,
      resolvedHostname: cached.resolvedHostname ?? resolvedHostname,
    }
  }

  // Ping with retry (2 attempts)
  const reachable = await pingWithRetry(pingTarget, 2)

  // Cache the result
  pingCache.set(pingTarget, {
    reachable,
    resolvedIP,
    resolvedHostname,
    timestamp: Date.now(),
  })

  return { machineId: machine.id, reachable, resolvedIP, resolvedHostname }
}

// Ping all machines (batch) - with caching so multiple clients share results
router.get('/ping/all', authenticate, async (req: AuthRequest, res) => {
  try {
    const machines = await prisma.machine.findMany({
      include: { ips: true },
    })

    const results = await Promise.all(
      machines.map((machine) => pingMachineFirstIP(machine))
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
      machines.map((machine) => pingMachineFirstIP(machine))
    )

    res.json(results)
  } catch (error) {
    console.error('Public batch ping error:', error)
    res.status(500).json({ error: 'Failed to ping machines' })
  }
})

export { router as machinesRouter }
