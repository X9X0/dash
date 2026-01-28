import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cpu, Wifi, WifiOff, RefreshCw, Moon, Sun, Printer, Bot, LogIn } from 'lucide-react'
import { format } from 'date-fns'
import api from '@/services/api'
import { useThemeStore, applyTheme } from '@/store/themeStore'
import { useAuthStore } from '@/store/authStore'
import type { Machine } from '@/types'

interface PingStatus {
  machineId: string
  reachable: boolean | null
  resolvedIP: string | null
  resolvedHostname: string | null
}

function getMachineIcon(category?: string) {
  if (category === 'printer') return <Printer className="h-8 w-8" />
  if (category === 'robot') return <Bot className="h-8 w-8" />
  return <Cpu className="h-8 w-8" />
}

export function Kiosk() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const [machines, setMachines] = useState<Machine[]>([])
  const [pingStatus, setPingStatus] = useState<Record<string, PingStatus>>({})
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [loading, setLoading] = useState(true)
  const { theme, setTheme } = useThemeStore()

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const fetchData = async () => {
    try {
      // Fetch machines (public endpoint needed)
      const { data: machinesData } = await api.get<Machine[]>('/machines/public')
      setMachines(machinesData)

      // Fetch ping status
      try {
        const { data: pingResults } = await api.get<PingStatus[]>('/machines/ping/all/public')
        const statusMap: Record<string, PingStatus> = {}
        pingResults.forEach((result) => {
          statusMap[result.machineId] = result
        })
        setPingStatus(statusMap)
      } catch {
        console.error('Failed to ping machines')
      }

      setLastUpdate(new Date())
    } catch (error) {
      console.error('Failed to fetch machines:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    // Auto-refresh every 15 seconds
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [])

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const getIndicatorColor = (machine: Machine) => {
    const status = pingStatus[machine.id]
    const isReachable = status?.reachable
    if (machine.status === 'available' && isReachable === true) return 'bg-green-500'
    if (machine.status === 'error') return 'bg-red-500'
    if (machine.status === 'offline') return 'bg-gray-500'
    if (machine.status === 'damaged_but_usable') return 'hazard-stripes'
    if (machine.status === 'available' && isReachable === false) return 'bg-yellow-500'
    if (machine.status === 'in_use') return 'bg-blue-500'
    if (machine.status === 'maintenance') return 'bg-yellow-500'
    return 'bg-gray-400'
  }

  const getStatusText = (machine: Machine) => {
    const status = pingStatus[machine.id]
    const isReachable = status?.reachable
    const hasNetworkConfig = status !== undefined

    if (machine.status === 'available' && isReachable === true) return 'Ready'
    if (machine.status === 'available' && isReachable === false) return 'Unreachable'
    if (machine.status === 'available' && !hasNetworkConfig) return 'Available'
    if (machine.status === 'in_use') return 'In Use'
    if (machine.status === 'maintenance') return 'Maintenance'
    if (machine.status === 'offline') return 'Offline'
    if (machine.status === 'error') return 'Error'
    if (machine.status === 'damaged_but_usable') return 'Damaged (Usable)'
    return machine.status
  }

  const getStatusTextColor = (machine: Machine) => {
    const status = pingStatus[machine.id]
    const isReachable = status?.reachable
    if (machine.status === 'available' && isReachable === true) return 'text-green-500'
    if (machine.status === 'error') return 'text-red-500'
    if (machine.status === 'damaged_but_usable') return 'text-yellow-600'
    if (machine.status === 'available' && isReachable === false) return 'text-yellow-500'
    if (machine.status === 'in_use') return 'text-blue-500'
    if (machine.status === 'maintenance') return 'text-yellow-500'
    return 'text-gray-500'
  }

  const getNetworkInfo = (machine: Machine) => {
    const status = pingStatus[machine.id]
    if (!status) return null
    return {
      ip: status.resolvedIP,
      hostname: status.resolvedHostname,
    }
  }

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

  // Group machines by type
  const machinesByType = machines.reduce((acc, machine) => {
    const typeName = machine.type?.name || 'Other'
    if (!acc[typeName]) acc[typeName] = []
    acc[typeName].push(machine)
    return acc
  }, {} as Record<string, Machine[]>)

  // Sort type names by category order
  const sortedTypeNames = Object.keys(machinesByType).sort((a, b) => {
    const orderA = categoryOrder[a] ?? 99
    const orderB = categoryOrder[b] ?? 99
    return orderA - orderB
  })

  const readyCount = machines.filter((m) =>
    m.status === 'available' && pingStatus[m.id]?.reachable === true
  ).length

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Cpu className="h-10 w-10 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Machine Status</h1>
            <p className="text-muted-foreground">
              {readyCount} of {machines.length} machines ready
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right text-sm text-muted-foreground">
            <p>Last updated</p>
            <p className="font-mono">{format(lastUpdate, 'h:mm:ss a')}</p>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>
          <button
            onClick={fetchData}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button
            onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          >
            <LogIn className="h-4 w-4" />
            {isAuthenticated ? 'Dashboard' : 'Login'}
          </button>
        </div>
      </header>

      {/* Legend */}
      <div className="flex flex-wrap gap-6 mb-8 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full bg-green-500" />
          <span>Ready</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full bg-blue-500" />
          <span>In Use</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full bg-yellow-500" />
          <span>Maintenance / Unreachable</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full bg-red-500" />
          <span>Error</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full bg-gray-500" />
          <span>Offline</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full hazard-stripes" />
          <span>Damaged (Usable)</span>
        </div>
      </div>

      {/* Machine Grid by Type */}
      {sortedTypeNames.map((typeName) => (
        <div key={typeName} className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-muted-foreground">{typeName}</h2>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {machinesByType[typeName].map((machine) => {
              const status = pingStatus[machine.id]
              const isReachable = status?.reachable
              const hasNetworkConfig = status !== undefined
              const networkInfo = getNetworkInfo(machine)

              return (
                <div
                  key={machine.id}
                  className="rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
                >
                  <div className={`h-3 ${getIndicatorColor(machine)}`} />
                  <div className="p-4 flex-1">
                  {/* Icon + statusNote row */}
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2 rounded-lg bg-muted ${getStatusTextColor(machine)}`}>
                      {getMachineIcon(machine.type?.category)}
                    </div>
                    {machine.statusNote && (
                      <p className="text-[10px] italic text-muted-foreground text-right max-w-[55%] line-clamp-2">
                        {machine.statusNote}
                      </p>
                    )}
                  </div>
                  <h3 className="font-semibold truncate" title={machine.name}>
                    {machine.name}
                  </h3>
                  <p className="text-sm text-muted-foreground truncate" title={machine.location}>
                    {machine.location}
                  </p>
                  <p className={`text-sm font-medium mt-2 ${getStatusTextColor(machine)}`}>
                    {getStatusText(machine)}
                  </p>
                  {/* Claimer display */}
                  {machine.claimedBy && (
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mt-1">
                      In use by {machine.claimedBy.name}
                    </p>
                  )}
                  {/* Network Info - IP/Hostname */}
                  {networkInfo && (networkInfo.ip || networkInfo.hostname) && (
                    <div className="mt-2 text-xs font-mono">
                      {networkInfo.hostname && (
                        <p className="text-blue-600 dark:text-blue-400 truncate" title={networkInfo.hostname}>
                          {networkInfo.hostname}
                        </p>
                      )}
                      {networkInfo.ip && (
                        <p className="text-green-600 dark:text-green-400 truncate" title={networkInfo.ip}>
                          {networkInfo.ip}
                        </p>
                      )}
                    </div>
                  )}
                  </div>
                  {/* Network Status - full width bottom bar */}
                  {hasNetworkConfig && (
                    <div className={`flex items-center justify-center gap-2 py-1.5 text-xs font-semibold ${
                      isReachable
                        ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                        : 'bg-red-500/20 text-red-600 dark:text-red-400'
                    }`}>
                      {isReachable ? (
                        <>
                          <Wifi className="h-3.5 w-3.5" />
                          <span>Online</span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="h-3.5 w-3.5" />
                          <span>Offline</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {machines.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Cpu className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No machines available</p>
        </div>
      )}

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur border-t p-2">
        <div className="flex items-center justify-center px-4">
          <span className="text-xs text-muted-foreground">
            Auto-refreshes every 15 seconds
          </span>
        </div>
      </footer>
    </div>
  )
}
