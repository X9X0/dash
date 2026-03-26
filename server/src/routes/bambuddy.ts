import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { Readable } from 'stream'
import { authenticate, requireOperator, AuthRequest } from '../middleware/auth.js'

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
async function bbFetch(path: string, options?: RequestInit): Promise<any> {
  const baseUrl = process.env.BAMBUDDY_URL || 'http://localhost:8000'
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
async function bbFetchRaw(path: string, options?: RequestInit): Promise<Response> {
  const baseUrl = process.env.BAMBUDDY_URL || 'http://localhost:8000'
  const apiKey = process.env.BAMBUDDY_API_KEY

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000) // longer timeout for streams

  try {
    const resp = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'X-API-Key': apiKey || '',
        ...options?.headers,
      },
    })

    if (!resp.ok) {
      clearTimeout(timeout)
      throw new Error(`BamBuddy API error: ${resp.status}`)
    }

    // Don't clear timeout for streams — let the AbortController handle long-running connections
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

// =============================================================================
// Routes
// =============================================================================

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

// GET /camera/:machineId/snapshot - Proxy camera snapshot (JPEG)
router.get('/camera/:machineId/snapshot', authenticate, async (req: AuthRequest, res) => {
  try {
    const printer = await findPrinter(req.params.machineId as string)
    if (!printer) {
      return res.status(404).json({ error: 'Printer not linked' })
    }

    const response = await bbFetchRaw(`/${printer.bambuddyPrinterId}/camera/snapshot`)
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
    const response = await bbFetchRaw(`/${printer.bambuddyPrinterId}/camera/stream?fps=${fps}`)

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
