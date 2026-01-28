import { Link } from 'react-router-dom'
import { Cpu, Printer, Bot, MapPin, Clock, Wifi, WifiOff } from 'lucide-react'
import { Card, CardContent, Badge } from '@/components/common'
import type { Machine, MachineStatus } from '@/types'

interface PingStatus {
  machineId: string
  reachable: boolean | null
  resolvedIP: string | null
  resolvedHostname: string | null
}

interface MachineCardProps {
  machine: Machine
  pingStatus?: PingStatus
}

const statusColors: Record<MachineStatus, string> = {
  available: 'bg-green-500',
  in_use: 'bg-blue-500',
  maintenance: 'bg-yellow-500',
  offline: 'bg-gray-500',
  error: 'bg-red-500',
  damaged_but_usable: 'hazard-stripes',
}

const statusBadgeVariants: Record<MachineStatus, 'success' | 'default' | 'warning' | 'secondary' | 'destructive' | 'caution'> = {
  available: 'success',
  in_use: 'default',
  maintenance: 'warning',
  offline: 'secondary',
  error: 'destructive',
  damaged_but_usable: 'caution',
}

function getMachineIcon(type?: { category?: string }) {
  if (!type?.category) return <Cpu className="h-8 w-8" />
  if (type.category === 'printer') return <Printer className="h-8 w-8" />
  if (type.category === 'robot') return <Bot className="h-8 w-8" />
  return <Cpu className="h-8 w-8" />
}

export function MachineCard({ machine, pingStatus }: MachineCardProps) {
  const isReachable = pingStatus?.reachable
  const hasNetworkConfig = pingStatus !== undefined
  const resolvedHostname = pingStatus?.resolvedHostname
  const resolvedIP = pingStatus?.resolvedIP

  return (
    <Link to={`/machines/${machine.id}`}>
      <Card className="group hover:shadow-md transition-shadow cursor-pointer overflow-hidden">
        <div className={`h-3 ${statusColors[machine.status]}`} />
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
              {getMachineIcon(machine.type)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{machine.name}</h3>
              <p className="text-sm text-muted-foreground truncate">
                {machine.model}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span className="truncate">{machine.location}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{machine.hourMeter.toLocaleString()} hours</span>
            </div>
            {/* Network Info - IP/Hostname */}
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

          {machine.statusNote && (
            <p className="mt-2 text-xs italic text-muted-foreground line-clamp-2">
              {machine.statusNote}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant={statusBadgeVariants[machine.status]}>
                {machine.status.replace('_', ' ')}
              </Badge>
              {/* Network Status Indicator */}
              {hasNetworkConfig && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
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
            </div>
            {machine.type && (
              <span className="text-xs text-muted-foreground">
                {machine.type.name}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
