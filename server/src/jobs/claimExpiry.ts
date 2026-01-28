import { PrismaClient } from '@prisma/client'
import type { Server } from 'socket.io'

const prisma = new PrismaClient()

let intervalId: ReturnType<typeof setInterval> | null = null

async function releaseExpiredClaims(io: Server): Promise<void> {
  try {
    const now = new Date()
    const expiredMachines = await prisma.machine.findMany({
      where: {
        claimExpiresAt: { lt: now },
        claimedById: { not: null },
      },
      include: {
        claimedBy: { select: { id: true, name: true } },
      },
    })

    for (const machine of expiredMachines) {
      const claimerName = machine.claimedBy?.name || 'Unknown'

      await prisma.machine.update({
        where: { id: machine.id },
        data: {
          claimedById: null,
          claimedAt: null,
          claimExpiresAt: null,
          status: 'available',
        },
      })

      // Log status change
      await prisma.machineStatusLog.create({
        data: {
          machineId: machine.id,
          status: 'available',
          source: 'api',
        },
      })

      // Log activity (use the claimer's ID if available)
      if (machine.claimedById) {
        await prisma.activityLog.create({
          data: {
            machineId: machine.id,
            userId: machine.claimedById,
            action: 'claim_expired',
            details: `Claim by ${claimerName} expired automatically`,
          },
        })
      }

      io.emit('machine:released', { machineId: machine.id })
      console.log(`[ClaimExpiry] Released expired claim on ${machine.name} (was held by ${claimerName})`)
    }
  } catch (error) {
    console.error('[ClaimExpiry] Error:', error)
  }
}

export function startClaimExpiry(io: Server): void {
  if (intervalId) {
    console.log('[ClaimExpiry] Already running')
    return
  }

  console.log('[ClaimExpiry] Starting (interval: 60s)')

  // Run immediately on start
  releaseExpiredClaims(io)

  // Then run every 60 seconds
  intervalId = setInterval(() => releaseExpiredClaims(io), 60 * 1000)
}

export function stopClaimExpiry(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('[ClaimExpiry] Stopped')
  }
}
