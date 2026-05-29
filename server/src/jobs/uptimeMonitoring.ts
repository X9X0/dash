import { PrismaClient } from '@prisma/client'
import type { Server } from 'socket.io'
import { pingHost } from '../lib/ping.js'
import { sendMail, parseRecipients } from '../lib/mailer.js'

const prisma = new PrismaClient()

// Base tick: the job wakes up this often and pings any machine whose own
// configured checkIntervalMinutes has elapsed since its last check.
const TICK_MINUTES = 1

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

    // Only ping machines whose own interval has elapsed since their last check.
    const due = machines.filter((m) => {
      if (!m.ips || m.ips.length === 0) return false
      if (!m.lastUptimeCheckAt) return true
      const elapsedMs = now.getTime() - new Date(m.lastUptimeCheckAt).getTime()
      // 90% of the interval to absorb tick-timing variance.
      return elapsedMs >= m.checkIntervalMinutes * 60 * 1000 * 0.9
    })

    if (due.length === 0) return

    console.log(`[UptimeMonitoring] Checking ${due.length} machine(s)...`)

    for (const machine of due) {
      const isReachable = await pingHost(machine.ips[0].ipAddress)

      // Debounce: a machine is only considered offline once it has failed
      // `offlineThreshold` consecutive checks. failCount tracks the streak.
      const failCount = isReachable ? 0 : machine.failCount + 1
      const threshold = Math.max(1, machine.offlineThreshold)
      // Effective state this tick: online if reachable, offline only once the
      // failure streak reaches the threshold; otherwise hold the prior state.
      const effectiveOnline = isReachable
        ? true
        : failCount >= threshold
          ? false
          : machine.isOnline

      // Always record that we checked it, plus the current failure streak.
      const baseUpdate = { lastUptimeCheckAt: now, failCount }

      // First confirmed check ever: record baseline without a transition/alert.
      if (machine.isOnline === null) {
        // Don't declare offline on the very first check until the streak is met.
        if (!isReachable && failCount < threshold) {
          await prisma.machine.update({ where: { id: machine.id }, data: baseUpdate })
          continue
        }
        await prisma.machine.update({
          where: { id: machine.id },
          data: {
            ...baseUpdate,
            isOnline: effectiveOnline,
            lastOnlineAt: effectiveOnline ? now : machine.lastOnlineAt,
            lastOfflineAt: effectiveOnline ? machine.lastOfflineAt : now,
          },
        })
        await prisma.uptimeEvent.create({
          data: { machineId: machine.id, status: effectiveOnline ? 'online' : 'offline' },
        })
        continue
      }

      // No state change (including: failing but threshold not yet reached).
      if (effectiveOnline === machine.isOnline) {
        await prisma.machine.update({ where: { id: machine.id }, data: baseUpdate })
        continue
      }

      // State transition: compute how long the previous state lasted.
      const prevSince = effectiveOnline ? machine.lastOfflineAt : machine.lastOnlineAt
      const durationSeconds = prevSince
        ? Math.max(0, Math.round((now.getTime() - new Date(prevSince).getTime()) / 1000))
        : null

      await prisma.machine.update({
        where: { id: machine.id },
        data: {
          ...baseUpdate,
          isOnline: effectiveOnline,
          lastOnlineAt: effectiveOnline ? now : machine.lastOnlineAt,
          lastOfflineAt: effectiveOnline ? machine.lastOfflineAt : now,
        },
      })

      await prisma.uptimeEvent.create({
        data: {
          machineId: machine.id,
          status: effectiveOnline ? 'online' : 'offline',
          durationSeconds,
        },
      })

      io?.emit('machine:uptime', {
        machineId: machine.id,
        isOnline: effectiveOnline,
        timestamp: now.toISOString(),
      })

      console.log(`[UptimeMonitoring] ${machine.name}: ${effectiveOnline ? 'ONLINE' : 'OFFLINE'}`)

      // Only alert on the transition INTO offline (re-armed when it returns).
      if (!effectiveOnline) {
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
  console.log(`[UptimeMonitoring] Starting (tick: ${TICK_MINUTES} min; per-machine intervals apply)`)

  checkMachines()
  intervalId = setInterval(checkMachines, TICK_MINUTES * 60 * 1000)
}

export function stopUptimeMonitoring(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('[UptimeMonitoring] Stopped')
  }
}
