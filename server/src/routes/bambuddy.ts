import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { Readable } from 'stream'
import { authenticate, requireOperator, requireAdmin, AuthRequest } from '../middleware/auth.js'
import { round2 } from '../lib/hours.js'

const router = Router()
const prisma = new PrismaClient()

// --- Printer mapping cache ---
interface PrinterMapping {
  bambuddyPrinterId: number
  dashMachineId: string
  printerName: string
  ip: string
}

let printerMappingCache: PrinterMapping[] = []
let mappingCacheTimestamp = 0
const MAPPING_CACHE_TTL = 60_000 // 60 seconds

// --- Helper: fetch from BamBuddy API ---
const BB_API_PREFIX = '/api/v1'

async function bbFetch(path: string, options?: RequestInit): Promise<any> {
  const baseUrl = (process.env.BAMBUDDY_URL || 'http://localhost:8000') + BB_API_PREFIX
  const apiKey = process.env.BAMBUDDY_API_KEY

  if (!apiKey) {
    throw new Error('BAMBUDDY_API_KEY not configured')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const resp = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    if (!resp.ok) {
      throw new Error(`BamBuddy API error: ${resp.status} ${resp.statusText}`)
    }

    return resp.json()
  } finally {
    clearTimeout(timeout)
  }
}

// --- Helper: raw fetch (for streaming responses like camera) ---
async function bbFetchRaw(path: string, options?: RequestInit & { streaming?: boolean }): Promise<Response> {
  const baseUrl = (process.env.BAMBUDDY_URL || 'http://localhost:8000') + BB_API_PREFIX
  const apiKey = process.env.BAMBUDDY_API_KEY
  const { streaming, ...fetchOptions } = options || {}

  // For streaming responses (MJPEG), only use a timeout for the initial connection.
  // For non-streaming (snapshot, thumbnail), use a 30s timeout for the whole request.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), streaming ? 10000 : 30000)

  try {
    const resp = await fetch(`${baseUrl}${path}`, {
      ...fetchOptions,
      signal: streaming ? undefined : controller.signal,
      headers: {
        'X-API-Key': apiKey || '',
        ...fetchOptions?.headers,
      },
    })

    clearTimeout(timeout)

    if (!resp.ok) {
      throw new Error(`BamBuddy API error: ${resp.status}`)
    }

    return resp
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

// --- Helper: refresh IP-based printer mapping ---
async function refreshMapping(): Promise<PrinterMapping[]> {
  if (Date.now() - mappingCacheTimestamp < MAPPING_CACHE_TTL && printerMappingCache.length > 0) {
    return printerMappingCache
  }

  try {
    const bbPrinters = await bbFetch('/printers/')
    const allIPs = await prisma.machineIP.findMany()

    const mapping: PrinterMapping[] = []
    for (const printer of bbPrinters) {
      const matchingIP = allIPs.find(
        (ip: { ipAddress: string }) => ip.ipAddress === printer.ip_address
      )
      if (matchingIP) {
        mapping.push({
          bambuddyPrinterId: printer.id,
          dashMachineId: matchingIP.machineId,
          printerName: printer.name,
          ip: printer.ip_address,
        })
      }
    }

    printerMappingCache = mapping
    mappingCacheTimestamp = Date.now()
    return mapping
  } catch (error) {
    // If refresh fails but we have stale cache, use it
    if (printerMappingCache.length > 0) {
      return printerMappingCache
    }
    throw error
  }
}

// --- Helper: find BamBuddy printer ID for a Dash machine ID ---
async function findPrinter(dashMachineId: string): Promise<PrinterMapping | null> {
  const mapping = await refreshMapping()
  return mapping.find((m) => m.dashMachineId === dashMachineId) || null
}

// --- Sync: import printers from BamBuddy into Dash ---
const FDM_TYPE_ID = 'fdm-printer'
const DEFAULT_LOCATION = '3D Print Lab'
const SYNC_INTERVAL = 5 * 60_000 // 5 minutes

interface SyncResult {
  created: string[]
  updated: string[]
  offlined: string[]
}

async function syncPrinters(): Promise<SyncResult> {
  if (!process.env.BAMBUDDY_API_KEY) {
    throw new Error('BAMBUDDY_API_KEY not configured')
  }

  const bbPrinters: any[] = await bbFetch('/printers/')
  const allIPs = await prisma.machineIP.findMany({ include: { machine: true } })

  // Build lookup: IP → MachineIP record (with machine)
  const ipToMachineIP = new Map<string, typeof allIPs[number]>()
  for (const ip of allIPs) {
    ipToMachineIP.set(ip.ipAddress, ip)
  }

  const result: SyncResult = { created: [], updated: [], offlined: [] }
  const seenMachineIds = new Set<string>()

  // Ensure FDM printer type exists
  let fdmType = await prisma.machineType.findUnique({ where: { id: FDM_TYPE_ID } })
  if (!fdmType) {
    fdmType = await prisma.machineType.create({
      data: {
        id: FDM_TYPE_ID,
        name: 'FDM Printer',
        category: 'printer',
        icon: 'printer',
      },
    })
  }

  // Fetch maintenance overviews in parallel so we can sync total_print_hours → hourMeter.
  // Missing/failed overviews just mean hourMeter stays untouched for that printer.
  const printHoursByBBId = new Map<number, number>()
  const maintenanceResults = await Promise.allSettled(
    bbPrinters.map((p) => bbFetch(`/maintenance/printers/${p.id}`))
  )
  maintenanceResults.forEach((r, i) => {
    if (r.status === 'fulfilled' && typeof r.value?.total_print_hours === 'number') {
      printHoursByBBId.set(bbPrinters[i].id, round2(r.value.total_print_hours))
    }
  })

  for (const bbPrinter of bbPrinters) {
    const existingIP = ipToMachineIP.get(bbPrinter.ip_address)
    const printHours = printHoursByBBId.get(bbPrinter.id)

    if (existingIP) {
      // Printer already linked — update name, status, and hour meter if changed
      seenMachineIds.add(existingIP.machineId)
      const machine = existingIP.machine
      const updates: { name?: string; status?: string; hourMeter?: number } = {}

      if (machine.name !== bbPrinter.name) {
        updates.name = bbPrinter.name
      }
      if (machine.status === 'offline') {
        updates.status = 'available'
      }
      if (printHours !== undefined && printHours !== machine.hourMeter) {
        updates.hourMeter = printHours
      }

      if (Object.keys(updates).length > 0) {
        await prisma.machine.update({
          where: { id: machine.id },
          data: updates,
        })
        if (!result.updated.includes(bbPrinter.name)) {
          result.updated.push(bbPrinter.name)
        }
      }
    } else {
      // New printer — create machine + IP record
      const machine = await prisma.machine.create({
        data: {
          name: bbPrinter.name,
          typeId: FDM_TYPE_ID,
          model: bbPrinter.model || 'Bambu Lab',
          location: DEFAULT_LOCATION,
          status: 'available',
          condition: 'functional',
          icon: 'printer',
          autoHourTracking: false,
          hourMeter: printHours ?? 0,
          ips: {
            create: {
              label: 'printer',
              ipAddress: bbPrinter.ip_address,
            },
          },
        },
      })
      seenMachineIds.add(machine.id)
      result.created.push(bbPrinter.name)
    }
  }

  // Mark machines that were synced from BamBuddy but no longer exist there as offline.
  // Only affect machines that are: (a) FDM printers, (b) have an IP that was previously
  // matched to a BamBuddy printer, and (c) are not in the current BamBuddy printer list.
  const bbIPs = new Set(bbPrinters.map((p: any) => p.ip_address))
  const fdmMachines = await prisma.machine.findMany({
    where: { typeId: FDM_TYPE_ID, status: { not: 'offline' } },
    include: { ips: true },
  })
  for (const machine of fdmMachines) {
    if (seenMachineIds.has(machine.id)) continue
    // Check if any of this machine's IPs were previously BamBuddy-linked
    const hasBBIP = machine.ips.some((ip: { label: string }) => ip.label === 'printer')
    if (hasBBIP && !machine.ips.some((ip: { ipAddress: string }) => bbIPs.has(ip.ipAddress))) {
      await prisma.machine.update({
        where: { id: machine.id },
        data: { status: 'offline' },
      })
      result.offlined.push(machine.name)
    }
  }

  // Invalidate mapping cache so it picks up new machines
  mappingCacheTimestamp = 0

  return result
}

// Background sync timer
let syncInterval: ReturnType<typeof setInterval> | null = null

export function startBamBuddySync() {
  if (!process.env.BAMBUDDY_API_KEY) return

  // Run initial sync after a short delay to let the server finish starting
  setTimeout(() => {
    syncPrinters().catch((err) =>
      console.error('BamBuddy initial sync failed:', err.message)
    )
  }, 5000)

  syncInterval = setInterval(() => {
    syncPrinters().catch((err) =>
      console.error('BamBuddy background sync failed:', err.message)
    )
  }, SYNC_INTERVAL)
}

// =============================================================================
// Routes
// =============================================================================

// POST /sync - Manually trigger printer sync (admin only)
router.post('/sync', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await syncPrinters()
    res.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Sync failed'
    res.status(500).json({ error: msg })
  }
})

// GET /config - Check if BamBuddy is available and return public URL
router.get('/config', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!process.env.BAMBUDDY_API_KEY) {
      return res.json({ available: false, publicUrl: '' })
    }
    await bbFetch('/printers/')
    res.json({
      available: true,
      publicUrl: process.env.BAMBUDDY_PUBLIC_URL || process.env.BAMBUDDY_URL || 'http://localhost:8000',
    })
  } catch {
    res.json({ available: false, publicUrl: '' })
  }
})

// GET /status/all - Batch fetch all linked printer statuses (authenticated)
router.get('/status/all', authenticate, async (req: AuthRequest, res) => {
  try {
    const mapping = await refreshMapping()
    const statuses = await Promise.allSettled(
      mapping.map(async (m) => {
        try {
          const status = await bbFetch(`/printers/${m.bambuddyPrinterId}/status`)
          return { dashMachineId: m.dashMachineId, printerName: m.printerName, ...status }
        } catch {
          return { dashMachineId: m.dashMachineId, printerName: m.printerName, error: true }
        }
      })
    )

    const results = statuses.map((s) =>
      s.status === 'fulfilled' ? s.value : { error: true }
    )
    res.json(results)
  } catch {
    res.json([])
  }
})

// GET /status/all/public - Same but unauthenticated (for Kiosk)
router.get('/status/all/public', async (req, res) => {
  try {
    const mapping = await refreshMapping()
    const statuses = await Promise.allSettled(
      mapping.map(async (m) => {
        try {
          const status = await bbFetch(`/printers/${m.bambuddyPrinterId}/status`)
          return { dashMachineId: m.dashMachineId, printerName: m.printerName, ...status }
        } catch {
          return { dashMachineId: m.dashMachineId, printerName: m.printerName, error: true }
        }
      })
    )

    const results = statuses.map((s) =>
      s.status === 'fulfilled' ? s.value : { error: true }
    )
    res.json(results)
  } catch {
    res.json([])
  }
})

// GET /status/:machineId - Single printer status by Dash machine ID
router.get('/status/:machineId', authenticate, async (req: AuthRequest, res) => {
  try {
    const printer = await findPrinter(req.params.machineId as string)
    if (!printer) {
      return res.json({ error: true, message: 'Printer not linked to BamBuddy' })
    }

    const status = await bbFetch(`/printers/${printer.bambuddyPrinterId}/status`)
    res.json({ dashMachineId: printer.dashMachineId, printerName: printer.printerName, ...status })
  } catch (error) {
    res.json({ error: true, message: 'Failed to fetch printer status' })
  }
})

// POST /control/:machineId/:action - Print controls (stop/pause/resume)
router.post('/control/:machineId/:action', authenticate, requireOperator, async (req: AuthRequest, res) => {
  const machineId = req.params.machineId as string
  const action = req.params.action as string

  if (!['stop', 'pause', 'resume'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Must be stop, pause, or resume.' })
  }

  try {
    const printer = await findPrinter(machineId)
    if (!printer) {
      return res.status(404).json({ error: 'Printer not linked to BamBuddy' })
    }

    const result = await bbFetch(`/printers/${printer.bambuddyPrinterId}/print/${action}`, {
      method: 'POST',
    })
    res.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to control printer'
    res.status(500).json({ error: msg })
  }
})

// GET /queue - Print queue
router.get('/queue', authenticate, async (req: AuthRequest, res) => {
  try {
    const queue = await bbFetch('/queue/')
    // Queue may return items with BamBuddy printer IDs — enrich with Dash machine IDs
    const mapping = await refreshMapping()
    const enriched = (Array.isArray(queue) ? queue : []).map((item: any) => {
      const linked = mapping.find((m) => m.printerName === item.printer_name)
      return { ...item, dashMachineId: linked?.dashMachineId || null }
    })
    res.json(enriched)
  } catch {
    res.json([])
  }
})

// GET /print-log/all - Print history across all printers (for calendar)
router.get('/print-log/all', authenticate, async (req: AuthRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100
    const dateFrom = req.query.date_from as string | undefined
    const dateTo = req.query.date_to as string | undefined
    let url = `/print-log/?limit=${limit}`
    if (dateFrom) url += `&date_from=${dateFrom}`
    if (dateTo) url += `&date_to=${dateTo}`
    const result = await bbFetch(url)
    // Enrich with dashMachineId
    const mapping = await refreshMapping()
    const items = (result?.items || []).map((item: any) => {
      const linked = mapping.find((m) => m.printerName === item.printer_name)
      return { ...item, dashMachineId: linked?.dashMachineId || null }
    })
    res.json({ items, total: result?.total || 0 })
  } catch {
    res.json({ items: [], total: 0 })
  }
})

// GET /print-log/:machineId - Print history for a machine
router.get('/print-log/:machineId', authenticate, async (req: AuthRequest, res) => {
  try {
    const printer = await findPrinter(req.params.machineId as string)
    if (!printer) {
      return res.json({ items: [], total: 0 })
    }

    const limit = parseInt(req.query.limit as string) || 10
    const result = await bbFetch(`/print-log/?printer_id=${printer.bambuddyPrinterId}&limit=${limit}`)
    res.json(result)
  } catch {
    res.json({ items: [], total: 0 })
  }
})

// GET /maintenance/all - All printer maintenance statuses
router.get('/maintenance/all', authenticate, async (req: AuthRequest, res) => {
  try {
    const mapping = await refreshMapping()
    const results = await Promise.allSettled(
      mapping.map(async (m) => {
        const data = await bbFetch(`/maintenance/printers/${m.bambuddyPrinterId}`)
        return { dashMachineId: m.dashMachineId, ...data }
      })
    )
    const maintenance = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map((r) => r.value)
    res.json(maintenance)
  } catch {
    res.json([])
  }
})

// GET /maintenance/:machineId - Printer maintenance status
router.get('/maintenance/:machineId', authenticate, async (req: AuthRequest, res) => {
  try {
    const printer = await findPrinter(req.params.machineId as string)
    if (!printer) {
      return res.json(null)
    }

    const result = await bbFetch(`/maintenance/printers/${printer.bambuddyPrinterId}`)
    res.json(result)
  } catch {
    res.json(null)
  }
})

// GET /camera/:machineId/snapshot - Proxy camera snapshot (JPEG)
router.get('/camera/:machineId/snapshot', authenticate, async (req: AuthRequest, res) => {
  try {
    const printer = await findPrinter(req.params.machineId as string)
    if (!printer) {
      return res.status(404).json({ error: 'Printer not linked' })
    }

    const response = await bbFetchRaw(`/printers/${printer.bambuddyPrinterId}/camera/snapshot`)
    res.set('Content-Type', 'image/jpeg')
    res.set('Cache-Control', 'no-cache')

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any)
      nodeStream.pipe(res)
    } else {
      res.status(502).json({ error: 'No camera data' })
    }
  } catch {
    res.status(502).json({ error: 'Camera unavailable' })
  }
})

// GET /camera/:machineId/stream - Proxy MJPEG camera stream
router.get('/camera/:machineId/stream', authenticate, async (req: AuthRequest, res) => {
  try {
    const printer = await findPrinter(req.params.machineId as string)
    if (!printer) {
      return res.status(404).json({ error: 'Printer not linked' })
    }

    const fps = parseInt(req.query.fps as string) || 10
    const response = await bbFetchRaw(`/printers/${printer.bambuddyPrinterId}/camera/stream?fps=${fps}`, { streaming: true })

    // Forward the content type header (multipart/x-mixed-replace)
    const contentType = response.headers.get('content-type')
    if (contentType) {
      res.set('Content-Type', contentType)
    } else {
      res.set('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
    }
    res.set('Cache-Control', 'no-cache')
    res.set('Connection', 'keep-alive')

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any)

      // Clean up when client disconnects
      req.on('close', () => {
        nodeStream.destroy()
      })

      nodeStream.pipe(res)
    } else {
      res.status(502).json({ error: 'No camera stream' })
    }
  } catch {
    res.status(502).json({ error: 'Camera stream unavailable' })
  }
})

// GET /print-log/:machineId/thumbnail/:entryId - Proxy print log thumbnail
router.get('/print-log/:machineId/thumbnail/:entryId', authenticate, async (req: AuthRequest, res) => {
  try {
    const response = await bbFetchRaw(`/print-log/${req.params.entryId as string}/thumbnail`)
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'public, max-age=86400')

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any)
      nodeStream.pipe(res)
    } else {
      res.status(404).json({ error: 'No thumbnail' })
    }
  } catch {
    res.status(404).json({ error: 'Thumbnail unavailable' })
  }
})

export { router as bambuddyRouter }
