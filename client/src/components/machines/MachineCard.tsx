import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Printer, Bot, MapPin, Clock, Wifi, WifiOff, Lock, Unlock, Loader2 } from 'lucide-react'
import { Card, CardContent, Badge, Button } from '@/components/common'
import { useAuthStore } from '@/store/authStore'
import { machineService } from '@/services/machines'
import type { Machine, MachineStatus, MachineCondition } from '@/types'

interface PingStatus {
  machineId: string
  reachable: boolean | null
  resolvedIP: string | null
  resolvedHostname: string | null
}

interface MachineCardProps {
  machine: Machine
  pingStatus?: PingStatus
  onClaimChange?: (updated: Machine) => void
}

const statusColors: Record<MachineStatus, string> = {
  available: 'bg-green-500',
  in_use: 'bg-blue-500',
  maintenance: 'bg-yellow-500',
  offline: 'bg-gray-500',
}

const statusBadgeVariants: Record<MachineStatus, 'success' | 'default' | 'warning' | 'secondary'> = {
  available: 'success',
  in_use: 'default',
  maintenance: 'warning',
  offline: 'secondary',
}

const conditionColors: Record<MachineCondition, string> = {
  functional: 'bg-green-500',
  degraded: 'hazard-stripes',
  broken: 'bg-red-500',
}

const conditionBadgeVariants: Record<MachineCondition, 'success' | 'caution' | 'destructive'> = {
  functional: 'success',
  degraded: 'caution',
  broken: 'destructive',
}

function getMachineIcon(type?: { category?: string }) {
  if (!type?.category) return <Cpu className="h-8 w-8" />
  if (type.category === 'printer') return <Printer className="h-8 w-8" />
  if (type.category === 'robot') return <Bot className="h-8 w-8" />
  return <Cpu className="h-8 w-8" />
}

export function MachineCard({ machine, pingStatus, onClaimChange }: MachineCardProps) {
  const { user } = useAuthStore()
  const [localMachine, setLocalMachine] = useState(machine)
  const [claiming, setClaiming] = useState(false)
  const [releasing, setReleasing] = useState(false)

  const isReachable = pingStatus?.reachable
  const hasNetworkConfig = pingStatus !== undefined
  const resolvedHostname = pingStatus?.resolvedHostname
  const resolvedIP = pingStatus?.resolvedIP

  const isOperator = user?.role === 'admin' || user?.role === 'operator'
  const isAdmin = user?.role === 'admin'
  const canClaim = isOperator && !localMachine.claimedById && localMachine.status === 'available'
  const canRelease = isOperator && localMachine.claimedById && (localMachine.claimedById === user?.id || isAdmin)

  const handleClaim = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setClaiming(true)
    try {
      const updated = await machineService.claimMachine(localMachine.id, 60)
      setLocalMachine(updated)
      onClaimChange?.(updated)
    } catch (error) {
      console.error('Failed to claim machine:', error)
    } finally {
      setClaiming(false)
    }
  }

  const handleRelease = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setReleasing(true)
    try {
      const updated = await machineService.releaseMachine(localMachine.id)
      setLocalMachine(updated)
      onClaimChange?.(updated)
    } catch (error) {
      console.error('Failed to release machine:', error)
    } finally {
      setReleasing(false)
    }
  }

  // Determine the top bar color - use condition color if degraded/broken, otherwise status color
  const getTopBarColor = () => {
    if (localMachine.condition === 'broken') return conditionColors.broken
    if (localMachine.condition === 'degraded') return conditionColors.degraded
    return statusColors[localMachine.status]
  }

  return (
    <Link to={`/machines/${localMachine.id}`}>
      <Card className="group hover:shadow-md transition-shadow cursor-pointer overflow-hidden">
        <div className={`h-3 ${getTopBarColor()}`} />
        <CardContent className="p-4">
          {/* Icon + Name/Model (left) | statusNote (right) */}
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
              {getMachineIcon(localMachine.type)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{localMachine.name}</h3>
              <p className="text-sm text-muted-foreground truncate">
                {localMachine.model}
              </p>
            </div>
            {localMachine.statusNote && (
              <p className="text-xs italic text-muted-foreground text-right max-w-[40%] line-clamp-2 shrink-0">
                {localMachine.statusNote}
              </p>
            )}
          </div>

          {/* Location, hours, network info */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span className="truncate">{localMachine.location}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{localMachine.hourMeter.toLocaleString()} hours</span>
            </div>
            {(resolvedHostname || resolvedIP) && (
              <div className="text-xs font-mono truncate space-y-0.5">
                {resolvedHostname && (
                  <p className="text-blue-600 dark:text-blue-400 truncate" title={resolvedHostname}>
                    {resolvedHostname}
                  </p>
                )}
                {resolvedIP && (
                  <p className="text-green-600 dark:text-green-400 truncate" title={resolvedIP}>
                    {resolvedIP}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Claimer display */}
          {localMachine.claimedBy && (
            <p className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400">
              In use by {localMachine.claimedBy.name}
            </p>
          )}

          {/* Claim/Release buttons */}
          {(canClaim || canRelease) && (
            <div className="mt-3 flex gap-2">
              {canClaim && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-xs"
                  onClick={handleClaim}
                  disabled={claiming}
                >
                  {claiming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
                  Quick Claim (1hr)
                </Button>
              )}
              {canRelease && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-xs"
                  onClick={handleRelease}
                  disabled={releasing}
                >
                  {releasing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
                  Release
                </Button>
              )}
            </div>
          )}

          {/* Status badge + condition badge + type name */}
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Badge variant={statusBadgeVariants[localMachine.status]}>
                {localMachine.status.replace('_', ' ')}
              </Badge>
              {localMachine.condition !== 'functional' && (
                <Badge variant={conditionBadgeVariants[localMachine.condition]}>
                  {localMachine.condition}
                </Badge>
              )}
            </div>
            {localMachine.type && (
              <span className="text-xs text-muted-foreground">
                {localMachine.type.name}
              </span>
            )}
          </div>

          {/* Wifi Online/Offline - full width bottom bar */}
          {hasNetworkConfig && (
            <div className={`mt-3 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium ${
              isReachable
                ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                : 'bg-red-500/20 text-red-600 dark:text-red-400'
            }`}>
              {isReachable ? (
                <>
                  <Wifi className="h-3 w-3" />
                  <span>Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  <span>Offline</span>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
