import { PrismaClient } from '@prisma/client'
import type { Server } from 'socket.io'
import { pingHost } from '../lib/ping.js'
import { sendMail, parseRecipients } from '../lib/mailer.js'

const prisma = new PrismaClient()

// Interval in minutes between uptime checks
const CHECK_INTERVAL_MINUTES = 5

let isRunning = false
let io: Server | null = null

/**
 * Resolve the set of email recipients for a machine's offline alert based on
 * its configured toggles: an explicit address list, all admins, and/or the
 * current claimer. Returns a deduped list of addresses.
 */
async function resolveAlertRecipients(machine: {
  alertEmails: string | null
  alertAdmins: boolean
  alertClaimer: boolean
  claimedById: string | null
}): Promise<string[]> {
  const recipients = new Set<string>(parseRecipients(machine.alertEmails))

  if (machine.alertAdmins) {
    const admins = await prisma.user.findMany({
      where: { role: 'admin' },
      select: { email: true },
    })
    admins.forEach((a) => recipients.add(a.email))
  }

  if (machine.alertClaimer && machine.claimedById) {
    const claimer = await prisma.user.findUnique({
      where: { id: machine.claimedById },
      select: { email: true },
    })
    if (claimer?.email) recipients.add(claimer.email)
  }

  return [...recipients]
}

async function handleOfflineTransition(machine: {
  id: string
  name: string
  alertOnOffline: boolean
  alertEmails: string | null
  alertAdmins: boolean
  alertClaimer: boolean
  claimedById: string | null
}, now: Date): Promise<void> {
  // In-app notification for all admins (cheap, always useful)
  const admins = await prisma.user.findMany({
    where: { role: 'admin' },
    select: { id: true },
  })
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: 'machine_offline',
      title: 'Machine offline',
      message: `${machine.name} went offline at ${now.toLocaleString()}.`,
    })),
  }).catch((err) => console.error('[UptimeMonitoring] Failed to create notifications:', err))

  if (!machine.alertOnOffline) return

  const recipients = await resolveAlertRecipients(machine)
  if (recipients.length === 0) {
    console.log(`[UptimeMonitoring] ${machine.name} offline but no alert recipients configured.`)
    return
  }

  const subject = `[Dash] ${machine.name} is offline`
  const text =
    `${machine.name} stopped responding to network pings at ${now.toLocaleString()}.\n\n` +
    `Dash will send no further emails until the machine comes back online and goes offline again.`

  await sendMail({ to: recipients, subject, text })
}

async function checkMachines(): Promise<void> {
  if (isRunning) {
    console.log('[UptimeMonitoring] Previous check still running, skipping...')
    return
  }

  isRunning = true
  const now = new Date()

  try {
    const machines = await prisma.machine.findMany({
      where: { monitorUptime: true },
      include: { ips: true },
    })

    if (machines.length === 0) return

    console.log(`[UptimeMonitoring] Checking ${machines.length} machines...`)

    for (const machine of machines) {
      if (!machine.ips || machine.ips.length === 0) continue

      const isReachable = await pingHost(machine.ips[0].ipAddress)

      // First check ever for this machine: record baseline without a transition.
      if (machine.isOnline === null) {
        await prisma.machine.update({
          where: { id: machine.id },
          data: {
            isOnline: isReachable,
            lastOnlineAt: isReachable ? now : machine.lastOnlineAt,
            lastOfflineAt: isReachable ? machine.lastOfflineAt : now,
          },
        })
        await prisma.uptimeEvent.create({
          data: { machineId: machine.id, status: isReachable ? 'online' : 'offline' },
        })
        continue
      }

      // No change in state — nothing to record.
      if (isReachable === machine.isOnline) continue

      // State transition: compute how long the previous state lasted.
      const prevSince = isReachable ? machine.lastOfflineAt : machine.lastOnlineAt
      const durationSeconds = prevSince
        ? Math.max(0, Math.round((now.getTime() - new Date(prevSince).getTime()) / 1000))
        : null

      await prisma.machine.update({
        where: { id: machine.id },
        data: {
          isOnline: isReachable,
          lastOnlineAt: isReachable ? now : machine.lastOnlineAt,
          lastOfflineAt: isReachable ? machine.lastOfflineAt : now,
        },
      })

      await prisma.uptimeEvent.create({
        data: {
          machineId: machine.id,
          status: isReachable ? 'online' : 'offline',
          durationSeconds,
        },
      })

      io?.emit('machine:uptime', {
        machineId: machine.id,
        isOnline: isReachable,
        timestamp: now.toISOString(),
      })

      console.log(`[UptimeMonitoring] ${machine.name}: ${isReachable ? 'ONLINE' : 'OFFLINE'}`)

      // Only alert on the transition INTO offline (re-armed when it returns).
      if (!isReachable) {
        await handleOfflineTransition(machine, now)
      }
    }
  } catch (error) {
    console.error('[UptimeMonitoring] Error:', error)
  } finally {
    isRunning = false
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null

export function startUptimeMonitoring(socketServer: Server): void {
  if (intervalId) {
    console.log('[UptimeMonitoring] Already running')
    return
  }

  io = socketServer
  console.log(`[UptimeMonitoring] Starting (interval: ${CHECK_INTERVAL_MINUTES} minutes)`)

  checkMachines()
  intervalId = setInterval(checkMachines, CHECK_INTERVAL_MINUTES * 60 * 1000)
}

export function stopUptimeMonitoring(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('[UptimeMonitoring] Stopped')
  }
}
