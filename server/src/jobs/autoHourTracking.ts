import { prisma } from '../lib/prisma.js'
import { round2 } from '../lib/hours.js'
import { pingHost } from '../lib/ping.js'
import { mapConcurrent } from '../lib/concurrency.js'

// Interval in minutes between checks
const CHECK_INTERVAL_MINUTES = 5
// How much time to credit per successful ping interval (in hours)
const HOURS_PER_INTERVAL = CHECK_INTERVAL_MINUTES / 60
// How many machines to ping at once. An unreachable machine takes ~10 s of
// retries, so pinging serially could stretch one check past the next tick.
const PING_CONCURRENCY = 5

let isRunning = false

async function checkMachines(): Promise<void> {
  if (isRunning) {
    console.log('[AutoHourTracking] Previous check still running, skipping...')
    return
  }

  isRunning = true
  const now = new Date()

  try {
    // Get all machines with auto hour tracking enabled and at least one address
    const machines = (
      await prisma.machine.findMany({
        where: { autoHourTracking: true },
        include: { ips: { orderBy: { id: 'asc' } } },
      })
    ).filter((m) => m.ips.length > 0)

    if (machines.length === 0) {
      return
    }

    console.log(`[AutoHourTracking] Checking ${machines.length} machines...`)

    // Ping the first address of each machine, a few at a time
    const reachability = await mapConcurrent(machines, PING_CONCURRENCY, (m) => pingHost(m.ips[0].ipAddress))

    for (const [index, machine] of machines.entries()) {
      if (!reachability[index]) continue

      // Machine is online - credit hours if enough time has passed since last ping
      const lastPing = machine.lastPingAt
      const shouldCreditHours =
        !lastPing ||
        now.getTime() - new Date(lastPing).getTime() >= CHECK_INTERVAL_MINUTES * 60 * 1000 * 0.9 // 90% of interval to absorb timing variance

      if (!shouldCreditHours) {
        await prisma.machine.update({
          where: { id: machine.id },
          data: { lastPingAt: now },
        })
        continue
      }

      const newTotal = round2(machine.hourMeter + HOURS_PER_INTERVAL)
      await prisma.$transaction([
        prisma.machine.update({
          where: { id: machine.id },
          data: { hourMeter: newTotal, lastPingAt: now },
        }),
        // System-generated entry: no user
        prisma.hourEntry.create({
          data: {
            machineId: machine.id,
            userId: null,
            hours: HOURS_PER_INTERVAL,
            date: now,
            notes: 'Auto-tracked (network uptime)',
          },
        }),
      ])

      console.log(`[AutoHourTracking] ${machine.name}: credited ${HOURS_PER_INTERVAL.toFixed(2)} hours (total: ${newTotal.toFixed(2)})`)
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
