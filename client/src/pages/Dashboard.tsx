import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Calendar, Wrench, AlertTriangle, Clock, Wifi, WifiOff } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/common'
import { useMachineStore } from '@/store/machineStore'
import { machineService } from '@/services/machines'
import { reservationService } from '@/services/reservations'
import { maintenanceService } from '@/services/maintenance'
import api from '@/services/api'
import type { Reservation, MaintenanceRequest } from '@/types'
import { format, isToday } from 'date-fns'

interface PingStatus {
  machineId: string
  reachable: boolean | null
}

export function Dashboard() {
  const { machines, setMachines, setLoading } = useMachineStore()
  const [todayReservations, setTodayReservations] = useState<Reservation[]>([])
  const [pendingMaintenance, setPendingMaintenance] = useState<MaintenanceRequest[]>([])
  const [pingStatus, setPingStatus] = useState<Record<string, boolean | null>>({})

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [machinesData, reservationsData, maintenanceData] = await Promise.all([
          machineService.getAll(),
          reservationService.getAll(),
          maintenanceService.getAll({ status: 'submitted' }),
        ])
        setMachines(machinesData)
        setTodayReservations(
          reservationsData.filter((r) => isToday(new Date(r.startTime)))
        )
        setPendingMaintenance(maintenanceData)

        // Fetch ping status for all machines
        try {
          const { data: pingResults } = await api.get<PingStatus[]>('/machines/ping/all')
          const statusMap: Record<string, boolean | null> = {}
          pingResults.forEach((result) => {
            statusMap[result.machineId] = result.reachable
          })
          setPingStatus(statusMap)
        } catch (pingError) {
          console.error('Failed to ping machines:', pingError)
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()

    // Refresh ping status every 30 seconds
    const pingInterval = setInterval(async () => {
      try {
        const { data: pingResults } = await api.get<PingStatus[]>('/machines/ping/all')
        const statusMap: Record<string, boolean | null> = {}
        pingResults.forEach((result) => {
          statusMap[result.machineId] = result.reachable
        })
        setPingStatus(statusMap)
      } catch (error) {
        console.error('Ping refresh failed:', error)
      }
    }, 30000)

    return () => clearInterval(pingInterval)
  }, [setMachines, setLoading])

  // Count machines that are available AND reachable
  const readyCount = machines.filter((m) =>
    m.status === 'available' && pingStatus[m.id] === true
  ).length

  // Define category order for sorting
  const categoryOrder: Record<string, number> = {
    'Biped Humanoid': 1,
    'Wheeled Humanoid': 2,
    'Robot Arm': 3,
    'Testbench': 4,
    'FDM Printer': 5,
    'SLA/Resin Printer': 6,
    'SLS Printer': 7,
  }

  // Sort machines by category order
  const sortedMachines = [...machines].sort((a, b) => {
    const orderA = categoryOrder[a.type?.name || ''] ?? 99
    const orderB = categoryOrder[b.type?.name || ''] ?? 99
    if (orderA !== orderB) return orderA - orderB
    // Secondary sort by name within same category
    return a.name.localeCompare(b.name)
  })

  const stats = [
    {
      label: 'Total Machines',
      value: machines.length,
      icon: <Cpu className="h-5 w-5" />,
      color: 'text-blue-500',
    },
    {
      label: 'Ready',
      value: readyCount,
      icon: <Wifi className="h-5 w-5" />,
      color: 'text-green-500',
    },
    {
      label: 'Today\'s Reservations',
      value: todayReservations.length,
      icon: <Calendar className="h-5 w-5" />,
      color: 'text-purple-500',
    },
    {
      label: 'Pending Repairs',
      value: pendingMaintenance.length,
      icon: <Wrench className="h-5 w-5" />,
      color: 'text-orange-500',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your machines and activities</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Machine Status Grid */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Machine Status</CardTitle>
            <Link to="/machines" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {sortedMachines.slice(0, 6).map((machine) => {
                const isReachable = pingStatus[machine.id]
                const hasNetworkConfig = isReachable !== null && isReachable !== undefined

                // Green only if available AND reachable
                // Yellow if in_use/maintenance, or available but unreachable
                // Red if error
                // Gray if offline or no network config
                const getIndicatorColor = () => {
                  if (machine.status === 'available' && isReachable === true) return 'bg-green-500'
                  if (machine.status === 'error') return 'bg-red-500'
                  if (machine.status === 'offline') return 'bg-gray-500'
                  if (machine.status === 'available' && isReachable === false) return 'bg-yellow-500'
                  if (machine.status === 'in_use') return 'bg-blue-500'
                  if (machine.status === 'maintenance') return 'bg-yellow-500'
                  return 'bg-gray-400'
                }

                const getStatusText = () => {
                  if (machine.status === 'available' && isReachable === true) return 'Ready'
                  if (machine.status === 'available' && isReachable === false) return 'Unreachable'
                  if (machine.status === 'available' && !hasNetworkConfig) return 'Available'
                  return machine.status.replace('_', ' ')
                }

                return (
                  <Link
                    key={machine.id}
                    to={`/machines/${machine.id}`}
                    className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
                  >
                    <div className="relative">
                      <div className={`h-4 w-4 rounded-full ${getIndicatorColor()}`} />
                      {hasNetworkConfig && (
                        <div className="absolute -bottom-1 -right-1">
                          {isReachable ? (
                            <Wifi className="h-2.5 w-2.5 text-green-600" />
                          ) : (
                            <WifiOff className="h-2.5 w-2.5 text-red-500" />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{machine.name}</p>
                      <p className="text-xs text-muted-foreground">{machine.location}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-medium capitalize ${
                        machine.status === 'available' && isReachable === true ? 'text-green-600' :
                        machine.status === 'error' ? 'text-red-500' :
                        machine.status === 'available' && isReachable === false ? 'text-yellow-600' :
                        'text-muted-foreground'
                      }`}>
                        {getStatusText()}
                      </span>
                      <p className="text-[10px] text-muted-foreground">{machine.type?.name}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
            {machines.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No machines added yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Today's Reservations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Today's Reservations</CardTitle>
            <Link to="/calendar" className="text-sm text-primary hover:underline">
              View calendar
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {todayReservations.slice(0, 5).map((reservation) => (
                <div
                  key={reservation.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {reservation.machine?.name || 'Unknown machine'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(reservation.startTime), 'h:mm a')} -{' '}
                      {format(new Date(reservation.endTime), 'h:mm a')}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground truncate max-w-[100px]">
                    {reservation.purpose}
                  </p>
                </div>
              ))}
            </div>
            {todayReservations.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No reservations for today
              </p>
            )}
          </CardContent>
        </Card>

        {/* Alerts & Maintenance */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Pending Maintenance</CardTitle>
            <Link to="/maintenance" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingMaintenance.slice(0, 4).map((request) => (
                <div
                  key={request.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <AlertTriangle
                    className={`h-4 w-4 ${
                      request.priority === 'critical'
                        ? 'text-red-500'
                        : request.priority === 'high'
                        ? 'text-orange-500'
                        : 'text-yellow-500'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {request.machine?.name || 'Unknown machine'}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {request.description}
                    </p>
                  </div>
                  <Badge
                    variant={
                      request.priority === 'critical'
                        ? 'destructive'
                        : request.priority === 'high'
                        ? 'warning'
                        : 'secondary'
                    }
                  >
                    {request.priority}
                  </Badge>
                </div>
              ))}
            </div>
            {pendingMaintenance.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No pending maintenance requests
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
