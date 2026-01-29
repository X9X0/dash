import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Calendar, Wrench, AlertTriangle, Clock, Wifi, WifiOff, Lock, Unlock, Loader2, Timer } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/common'
import { useMachineStore } from '@/store/machineStore'
import { useAuthStore } from '@/store/authStore'
import { machineService } from '@/services/machines'
import { reservationService } from '@/services/reservations'
import { maintenanceService } from '@/services/maintenance'
import api from '@/services/api'
import type { Reservation, MaintenanceRequest } from '@/types'
import { format, isToday, parseISO, differenceInSeconds } from 'date-fns'

function formatCountdown(expiresAt: string): string {
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

interface PingStatus {
  machineId: string
  reachable: boolean | null
  resolvedIP: string | null
  resolvedHostname: string | null
}

export function Dashboard() {
  const { machines, setMachines, setLoading } = useMachineStore()
  const { user } = useAuthStore()
  const [todayReservations, setTodayReservations] = useState<Reservation[]>([])
  const [pendingMaintenance, setPendingMaintenance] = useState<MaintenanceRequest[]>([])
  const [pingStatus, setPingStatus] = useState<Record<string, PingStatus>>({})
  const [claimingMachineId, setClaimingMachineId] = useState<string | null>(null)
  const [releasingMachineId, setReleasingMachineId] = useState<string | null>(null)
  const [countdowns, setCountdowns] = useState<Record<string, string>>({})

  // Update countdowns every second for claimed machines
  useEffect(() => {
    const updateCountdowns = () => {
      const newCountdowns: Record<string, string> = {}
      machines.forEach((m) => {
        if (m.claimExpiresAt) {
          newCountdowns[m.id] = formatCountdown(m.claimExpiresAt)
        }
      })
      setCountdowns(newCountdowns)
    }
    updateCountdowns()
    const interval = setInterval(updateCountdowns, 1000)
    return () => clearInterval(interval)
  }, [machines])

  const isOperator = user?.role === 'admin' || user?.role === 'operator'
  const isAdmin = user?.role === 'admin'

  const handleClaim = async (e: React.MouseEvent, machineId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setClaimingMachineId(machineId)
    try {
      const updated = await machineService.claimMachine(machineId, 60)
      setMachines(machines.map((m) => (m.id === machineId ? updated : m)))
    } catch (error) {
      console.error('Failed to claim machine:', error)
    } finally {
      setClaimingMachineId(null)
    }
  }

  const handleRelease = async (e: React.MouseEvent, machineId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setReleasingMachineId(machineId)
    try {
      const updated = await machineService.releaseMachine(machineId)
      setMachines(machines.map((m) => (m.id === machineId ? updated : m)))
    } catch (error) {
      console.error('Failed to release machine:', error)
    } finally {
      setReleasingMachineId(null)
    }
  }

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
          const statusMap: Record<string, PingStatus> = {}
          pingResults.forEach((result) => {
            statusMap[result.machineId] = result
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
        const statusMap: Record<string, PingStatus> = {}
        pingResults.forEach((result) => {
          statusMap[result.machineId] = result
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
    m.status === 'available' && pingStatus[m.id]?.reachable === true
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
      link: '/machines',
    },
    {
      label: 'Ready',
      value: readyCount,
      icon: <Wifi className="h-5 w-5" />,
      color: 'text-green-500',
      link: '/machines',
    },
    {
      label: 'Today\'s Reservations',
      value: todayReservations.length,
      icon: <Calendar className="h-5 w-5" />,
      color: 'text-purple-500',
      link: '/calendar',
    },
    {
      label: 'Pending Repairs',
      value: pendingMaintenance.length,
      icon: <Wrench className="h-5 w-5" />,
      color: 'text-orange-500',
      link: '/maintenance',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your machines and activities</p>
      </div>

      {/* Stats Grid - clickable links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.link} className="block hover:opacity-80 transition-opacity">
            <Card className="hover:shadow-md transition-shadow">
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
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Machine Status Grid */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Machine Status</CardTitle>
            <Link to="/machines" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedMachines.slice(0, 9).map((machine) => {
                const status = pingStatus[machine.id]
                const isReachable = status?.reachable
                const hasNetworkConfig = status !== undefined

                const getIndicatorColor = () => {
                  if (machine.condition === 'broken') return 'bg-red-500'
                  if (machine.condition === 'degraded') return 'hazard-stripes'
                  if (machine.status === 'available' && isReachable === true) return 'bg-green-500'
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

                const getConditionText = () => {
                  if (machine.condition === 'broken') return 'Broken'
                  if (machine.condition === 'degraded') return 'Degraded'
                  return null
                }

                const resolvedHostname = status?.resolvedHostname
                const resolvedIP = status?.resolvedIP
                const conditionText = getConditionText()
                const canClaimThis = isOperator && !machine.claimedById && machine.status === 'available'
                const canReleaseThis = isOperator && machine.claimedById && (machine.claimedById === user?.id || isAdmin)

                return (
                  <Link
                    key={machine.id}
                    to={`/machines/${machine.id}`}
                    className="flex flex-col rounded-lg border hover:bg-accent transition-colors overflow-hidden"
                  >
                    <div className={`h-3 ${getIndicatorColor()}`} />
                    <div className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{machine.name}</p>
                      <p className="text-xs text-muted-foreground">{machine.location}</p>
                      {(resolvedHostname || resolvedIP) && (
                        <div className="text-[10px] font-mono">
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
                    <div className="text-right shrink-0">
                      <span className={`text-xs font-medium capitalize ${
                        machine.condition === 'broken' ? 'text-red-500' :
                        machine.condition === 'degraded' ? 'text-yellow-600' :
                        machine.status === 'available' && isReachable === true ? 'text-green-600' :
                        machine.status === 'available' && isReachable === false ? 'text-yellow-600' :
                        'text-muted-foreground'
                      }`}>
                        {getStatusText()}
                        {conditionText && <span className="ml-1">({conditionText})</span>}
                      </span>
                      <p className="text-[10px] text-muted-foreground">{machine.type?.name}</p>
                    </div>
                    </div>
                    {/* Status Note - more visible */}
                    {machine.statusNote && (
                      <p className="mx-3 mb-1 text-xs italic text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded px-1.5 py-0.5 truncate" title={machine.statusNote}>
                        {machine.statusNote}
                      </p>
                    )}
                    {/* Claimer display with countdown timer */}
                    {machine.claimedBy && (
                      <div className="px-3 pb-1 flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                        <Timer className="h-2.5 w-2.5" />
                        <span>
                          {machine.claimedBy.name}
                          {countdowns[machine.id] && (
                            <span className="text-muted-foreground ml-1 font-mono">
                              ({countdowns[machine.id]})
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    {/* Claim/Release buttons */}
                    {(canClaimThis || canReleaseThis) && (
                      <div className="px-3 pb-2 flex gap-1">
                        {canClaimThis && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-6 text-[10px]"
                            onClick={(e) => handleClaim(e, machine.id)}
                            disabled={claimingMachineId === machine.id}
                          >
                            {claimingMachineId === machine.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Lock className="h-2.5 w-2.5" />}
                            Claim
                          </Button>
                        )}
                        {canReleaseThis && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-6 text-[10px]"
                            onClick={(e) => handleRelease(e, machine.id)}
                            disabled={releasingMachineId === machine.id}
                          >
                            {releasingMachineId === machine.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Unlock className="h-2.5 w-2.5" />}
                            Release
                          </Button>
                        )}
                      </div>
                    )}
                    {/* Wifi indicator at bottom */}
                    {hasNetworkConfig && (
                      <div className={`flex items-center justify-center gap-1 py-1 text-[10px] font-medium ${
                        isReachable
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                          : 'bg-red-500/10 text-red-600 dark:text-red-400'
                      }`}>
                        {isReachable ? (
                          <>
                            <Wifi className="h-2.5 w-2.5" />
                            <span>Online</span>
                          </>
                        ) : (
                          <>
                            <WifiOff className="h-2.5 w-2.5" />
                            <span>Offline</span>
                          </>
                        )}
                      </div>
                    )}
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
        <Card className="lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Pending Maintenance</CardTitle>
            <Link to="/maintenance" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingMaintenance.slice(0, 4).map((request) => (
                <Link
                  key={request.id}
                  to={`/maintenance/${request.id}`}
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
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
                </Link>
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
