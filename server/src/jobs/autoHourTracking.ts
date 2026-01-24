import { PrismaClient } from '@prisma/client'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const prisma = new PrismaClient()

// Interval in minutes between checks
const CHECK_INTERVAL_MINUTES = 5
// How much time to credit per successful ping interval (in hours)
const HOURS_PER_INTERVAL = CHECK_INTERVAL_MINUTES / 60

let isRunning = false

async function pingHost(ipAddress: string): Promise<boolean> {
  try {
    const isWindows = process.platform === 'win32'
    const pingCmd = isWindows
      ? `ping -n 1 -w 2000 ${ipAddress}`
      : `ping -c 1 -W 2 ${ipAddress}`

    await execAsync(pingCmd, { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

async function checkMachines(): Promise<void> {
  if (isRunning) {
    console.log('[AutoHourTracking] Previous check still running, skipping...')
    return
  }

  isRunning = true
  const now = new Date()

  try {
    // Get all machines with auto hour tracking enabled
    const machines = await prisma.machine.findMany({
      where: { autoHourTracking: true },
      include: { ips: true },
    })

    if (machines.length === 0) {
      return
    }

    console.log(`[AutoHourTracking] Checking ${machines.length} machines...`)

    for (const machine of machines) {
      if (!machine.ips || machine.ips.length === 0) {
        continue
      }

      // Ping first IP to check if machine is online
      const ip = machine.ips[0]
      const isReachable = await pingHost(ip.ipAddress)

      if (isReachable) {
        // Machine is online - credit hours if enough time has passed since last ping
        const lastPing = machine.lastPingAt
        const shouldCreditHours = !lastPing ||
          (now.getTime() - new Date(lastPing).getTime()) >= (CHECK_INTERVAL_MINUTES * 60 * 1000 * 0.9) // 90% of interval to account for timing variance

        if (shouldCreditHours) {
          await prisma.machine.update({
            where: { id: machine.id },
            data: {
              hourMeter: { increment: HOURS_PER_INTERVAL },
              lastPingAt: now,
            },
          })

          // Create hour entry for tracking
          // Using a system user ID - you may want to create a dedicated system user
          await prisma.hourEntry.create({
            data: {
              machineId: machine.id,
              userId: 'system', // This should be a valid user ID in production
              hours: HOURS_PER_INTERVAL,
              date: now,
              notes: 'Auto-tracked (network uptime)',
            },
          }).catch(() => {
            // If system user doesn't exist, just skip the entry
          })

          console.log(`[AutoHourTracking] ${machine.name}: credited ${HOURS_PER_INTERVAL.toFixed(2)} hours (total: ${(machine.hourMeter + HOURS_PER_INTERVAL).toFixed(1)})`)
        } else {
          // Just update lastPingAt without crediting hours
          await prisma.machine.update({
            where: { id: machine.id },
            data: { lastPingAt: now },
          })
        }
      }
    }
  } catch (error) {
    console.error('[AutoHourTracking] Error:', error)
  } finally {
    isRunning = false
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null

export function startAutoHourTracking(): void {
  if (intervalId) {
    console.log('[AutoHourTracking] Already running')
    return
  }

  console.log(`[AutoHourTracking] Starting (interval: ${CHECK_INTERVAL_MINUTES} minutes)`)

  // Run immediately on start
  checkMachines()

  // Then run periodically
  intervalId = setInterval(checkMachines, CHECK_INTERVAL_MINUTES * 60 * 1000)
}

export function stopAutoHourTracking(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('[AutoHourTracking] Stopped')
  }
}
