import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Filter, AlertTriangle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button, Card, CardContent, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common'
import { maintenanceService } from '@/services/maintenance'
import { machineService } from '@/services/machines'
import { useAuthStore } from '@/store/authStore'
import { AddMaintenanceDialog } from '@/components/maintenance/AddMaintenanceDialog'
import type { MaintenanceRequest, Machine, MaintenanceStatus, MaintenancePriority } from '@/types'

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
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [, setLoading] = useState(true)

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
    }
    fetchData()
  }, [])

  const filteredRequests = requests.filter((r) => {
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter
    const matchesPriority = priorityFilter === 'all' || r.priority === priorityFilter
    return matchesStatus && matchesPriority
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

      <AddMaintenanceDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        machines={machines}
        onRequestCreated={handleRequestCreated}
      />
    </div>
  )
}
