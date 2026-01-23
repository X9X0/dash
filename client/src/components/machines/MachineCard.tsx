import { Link } from 'react-router-dom'
import { Cpu, Printer, Bot, MapPin, Clock } from 'lucide-react'
import { Card, CardContent, Badge } from '@/components/common'
import type { Machine, MachineStatus } from '@/types'

interface MachineCardProps {
  machine: Machine
}

const statusColors: Record<MachineStatus, string> = {
  available: 'bg-green-500',
  in_use: 'bg-blue-500',
  maintenance: 'bg-yellow-500',
  offline: 'bg-gray-500',
  error: 'bg-red-500',
}

const statusBadgeVariants: Record<MachineStatus, 'success' | 'default' | 'warning' | 'secondary' | 'destructive'> = {
  available: 'success',
  in_use: 'default',
  maintenance: 'warning',
  offline: 'secondary',
  error: 'destructive',
}

function getMachineIcon(type?: { category?: string }) {
  if (!type?.category) return <Cpu className="h-8 w-8" />
  if (type.category === 'printer') return <Printer className="h-8 w-8" />
  if (type.category === 'robot') return <Bot className="h-8 w-8" />
  return <Cpu className="h-8 w-8" />
}

export function MachineCard({ machine }: MachineCardProps) {
  return (
    <Link to={`/machines/${machine.id}`}>
      <Card className="group hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
              {getMachineIcon(machine.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold truncate">{machine.name}</h3>
                <div className={`h-3 w-3 rounded-full ${statusColors[machine.status]} flex-shrink-0`} />
              </div>
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
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Badge variant={statusBadgeVariants[machine.status]}>
              {machine.status.replace('_', ' ')}
            </Badge>
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
