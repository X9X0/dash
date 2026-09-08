import { parseISO, differenceInSeconds } from 'date-fns'
import { Cpu, Printer, Bot, Server, Monitor, Cog, CircuitBoard, Network, Tv, Car } from 'lucide-react'
import type { Machine, User } from '@/types'

/** "h:mm:ss" / "m:ss" countdown to an ISO expiry instant (never negative). */
export function formatCountdown(expiresAt: string): string {
  const now = new Date()
  const expires = parseISO(expiresAt)
  const totalSeconds = Math.max(0, differenceInSeconds(expires, now))

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** Display order for machine types (by type name); unknown types sort last. */
export const categoryOrder: Record<string, number> = {
  'Biped Humanoid': 1,
  'Wheeled Humanoid': 2,
  'Robot Arm': 3,
  'Testbench': 4,
  'FDM Printer': 5,
  'SLA/Resin Printer': 6,
  'SLS Printer': 7,
}

export function getMachineIcon(category?: string, className = 'h-8 w-8') {
  switch (category) {
    case 'printer':
      return <Printer className={className} />
    case 'robot':
      return <Bot className={className} />
    case 'server':
      return <Server className={className} />
    case 'computer':
      return <Monitor className={className} />
    case 'cnc':
      return <Cog className={className} />
    case 'electronics':
      return <CircuitBoard className={className} />
    case 'networking':
      return <Network className={className} />
    case 'display':
      return <Tv className={className} />
    case 'vehicle':
      return <Car className={className} />
    default:
      return <Cpu className={className} />
  }
}

type ClaimFields = Pick<Machine, 'claimedById' | 'claimExpiresAt'>

/** True when the machine is claimed and that claim has not yet expired. */
export function hasActiveClaim(machine: ClaimFields): boolean {
  if (!machine.claimedById) return false
  if (!machine.claimExpiresAt) return true
  return parseISO(machine.claimExpiresAt).getTime() > Date.now()
}

/** Operators and admins can claim a machine that is unclaimed or whose claim has expired. */
export function canClaim(machine: ClaimFields, user: Pick<User, 'id' | 'role'> | null | undefined): boolean {
  if (!user) return false
  const isOperator = user.role === 'admin' || user.role === 'operator'
  return isOperator && !hasActiveClaim(machine)
}

/** The claimer or an admin can release a claimed machine. */
export function canRelease(machine: ClaimFields, user: Pick<User, 'id' | 'role'> | null | undefined): boolean {
  if (!user || !machine.claimedById) return false
  return machine.claimedById === user.id || user.role === 'admin'
}
