import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Filter, AlertTriangle, Wrench, Printer } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common'
import { maintenanceService } from '@/services/maintenance'
import { machineService } from '@/services/machines'
import { bambuddyService } from '@/services/bambuddy'
import { useAuthStore } from '@/store/authStore'
import { AddMaintenanceDialog } from '@/components/maintenance/AddMaintenanceDialog'
import type { MaintenanceRequest, Machine, MaintenanceStatus, MaintenancePriority } from '@/types'
import type { BamBuddyMaintenanceOverview, BamBuddyConfig } from '@/types/bambuddy'

const priorityColors: Record<MaintenancePriority, string> = {
  low: 'text-blue-500',
  medium: 'text-yellow-500',
  high: 'text-orange-500',
  critical: 'text-red-500',
}

const priorityBadgeVariants: Record<MaintenancePriority, 'default' | 'secondary' | 'warning' | 'destructive'> = {
  low: 'secondary',
  medium: 'default',
  high: 'warning',
  critical: 'destructive',
}

const statusBadgeVariants: Record<MaintenanceStatus, 'default' | 'secondary' | 'success'> = {
  submitted: 'secondary',
  in_progress: 'default',
  resolved: 'success',
}

export function Maintenance() {
  const { user } = useAuthStore()
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [machineTypeFilter, setMachineTypeFilter] = useState<string>('all')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [, setLoading] = useState(true)
  const [bbMaintenanceAll, setBbMaintenanceAll] = useState<BamBuddyMaintenanceOverview[]>([])
  const [bbConfig, setBbConfig] = useState<BamBuddyConfig | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [requestsData, machinesData] = await Promise.all([
          maintenanceService.getAll(),
          machineService.getAll(),
        ])
        setRequests(requestsData)
        setMachines(machinesData)
      } catch (error) {
        console.error('Failed to fetch maintenance data:', error)
      } finally {
        setLoading(false)
      }

      // Fetch BamBuddy data in background
      try {
        const [bbMaint, config] = await Promise.all([
          bambuddyService.getAllMaintenance(),
          bambuddyService.getConfig(),
        ])
        setBbMaintenanceAll(bbMaint)
        setBbConfig(config)
      } catch {}
    }
    fetchData()
  }, [])

  // Build unique machine type names from actual machines
  const machineTypeNames = [...new Set(machines.map((m) => m.type?.name).filter(Boolean))] as string[]

  const filteredRequests = requests.filter((r) => {
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter
    const matchesPriority = priorityFilter === 'all' || r.priority === priorityFilter
    const matchesType = machineTypeFilter === 'all' || r.machine?.type?.name === machineTypeFilter
    return matchesStatus && matchesPriority && matchesType
  })

  // Filter BamBuddy maintenance by type filter
  const filteredBbMaintenance = bbMaintenanceAll.filter((bm) => {
    if (machineTypeFilter === 'all') return true
    const machine = machines.find((m) => m.id === bm.dashMachineId)
    return machine?.type?.name === machineTypeFilter
  })

  const handleRequestCreated = (request: MaintenanceRequest) => {
    setRequests([request, ...requests])
  }

  const handleStatusChange = async (requestId: string, newStatus: MaintenanceStatus) => {
    try {
      const updated = await maintenanceService.update(requestId, { status: newStatus })
      setRequests(requests.map((r) => (r.id === requestId ? updated : r)))
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Maintenance</h1>
          <p className="text-muted-foreground">
            Track and manage repair requests
          </p>
        </div>
        {(user?.role === 'admin' || user?.role === 'operator') && (
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" />
            Submit Request
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={machineTypeFilter} onValueChange={setMachineTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by machine type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Machine Types</SelectItem>
                {machineTypeNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Requests List */}
      <div className="space-y-4">
        {filteredRequests.map((request) => (
          <Link key={request.id} to={`/maintenance/${request.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-4">
                    <AlertTriangle className={`h-5 w-5 mt-0.5 ${priorityColors[request.priority]}`} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{request.machine?.name}</h3>
                        <Badge variant={priorityBadgeVariants[request.priority]}>
                          {request.priority}
                        </Badge>
                        <Badge variant={statusBadgeVariants[request.status]}>
                          {request.status.replace('_', ' ')}
                        </Badge>
                        <Badge variant="outline">{request.type}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {request.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Submitted by {request.user?.name}</span>
                        <span>{format(parseISO(request.createdAt), 'MMM d, yyyy h:mm a')}</span>
                        {request.resolvedAt && (
                          <span className="text-green-500">
                            Resolved {format(parseISO(request.resolvedAt), 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {(user?.role === 'admin' || user?.role === 'operator') && request.status !== 'resolved' && (
                    <div className="flex gap-2">
                      {request.status === 'submitted' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleStatusChange(request.id, 'in_progress') }}
                        >
                          Start Work
                        </Button>
                      )}
                      {request.status === 'in_progress' && (
                        <Button
                          size="sm"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleStatusChange(request.id, 'resolved') }}
                        >
                          Mark Resolved
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {filteredRequests.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">
              {requests.length === 0
                ? 'No maintenance requests yet'
                : 'No requests match your filters'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* BamBuddy Printer Maintenance */}
      {filteredBbMaintenance.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Printer Maintenance Schedules
          </h2>
          {filteredBbMaintenance.map((bm) => {
            const machine = machines.find((m) => m.id === bm.dashMachineId)
            const enabledItems = bm.maintenance_items.filter((item) => item.enabled)
            if (enabledItems.length === 0) return null
            return (
              <Card key={bm.printer_id}>
                <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {machine ? (
                      <Link to={`/machines/${machine.id}`} className="hover:underline">
                        {machine.name}
                      </Link>
                    ) : (
                      bm.printer_name
                    )}
                    {bm.due_count > 0 && (
                      <Badge variant="destructive" className="text-[10px]">{bm.due_count} due</Badge>
                    )}
                    {bm.warning_count > 0 && (
                      <Badge variant="warning" className="text-[10px]">{bm.warning_count} soon</Badge>
                    )}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(bm.total_print_hours)} print hours
                  </span>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {enabledItems.map((item) => {
                      const pct = Math.min(100, (item.hours_since_maintenance / item.interval_hours) * 100)
                      return (
                        <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg border">
                          <div className="shrink-0">
                            {item.is_due ? (
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            ) : item.is_warning ? (
                              <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            ) : (
                              <Wrench className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium truncate">{item.maintenance_type_name}</p>
                              <Badge
                                variant={item.is_due ? 'destructive' : item.is_warning ? 'warning' : 'secondary'}
                                className="text-[10px] ml-2 shrink-0"
                              >
                                {item.is_due ? 'Due' : item.is_warning ? 'Soon' : `${Math.round(item.hours_until_due)}h left`}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    item.is_due ? 'bg-red-500' : item.is_warning ? 'bg-yellow-500' : 'bg-green-500'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {Math.round(item.hours_since_maintenance)}/{item.interval_hours}h
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {(bm.due_count > 0 || bm.warning_count > 0) && bbConfig?.publicUrl && (
                    <a
                      href={bbConfig.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-center text-primary hover:underline mt-3"
                    >
                      Perform maintenance in BamBuddy
                    </a>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AddMaintenanceDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        machines={machines}
        onRequestCreated={handleRequestCreated}
      />
    </div>
  )
}
