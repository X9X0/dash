import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Edit,
  Trash2,
  Plus,
  Clock,
  MapPin,
  Calendar,
  Activity,
  Wifi,
  WifiOff,
  Loader2,
  Network,
  X,
  Timer,
  Wrench,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common'
import { machineService } from '@/services/machines'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import { AddHoursDialog } from '@/components/machines/AddHoursDialog'
import { AddServiceRecordDialog } from '@/components/machines/AddServiceRecordDialog'
import { CustomFieldsCard } from '@/components/machines/CustomFieldsCard'
import { MaintenanceRequestDialog } from '@/components/machines/MaintenanceRequestDialog'
import type { Machine, MachineStatus, ServiceRecord, MachineStatusLog } from '@/types'

interface MachineDetailData extends Machine {
  statusLogs?: MachineStatusLog[]
}

interface PingResult {
  reachable: boolean
  ips?: Array<{
    id: string
    label: string
    ipAddress: string
    reachable: boolean
  }>
  reason?: string
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

export function MachineDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [machine, setMachine] = useState<MachineDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [pingResult, setPingResult] = useState<PingResult | null>(null)
  const [pinging, setPinging] = useState(false)
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([])

  // IP management state
  const [showAddIP, setShowAddIP] = useState(false)
  const [newIP, setNewIP] = useState({ label: '', ipAddress: '' })
  const [addingIP, setAddingIP] = useState(false)

  // Status change state
  const [changingStatus, setChangingStatus] = useState(false)

  // Hour logging state
  const [showAddHours, setShowAddHours] = useState(false)

  // Service record state
  const [showServiceRecord, setShowServiceRecord] = useState(false)
  const [editingServiceRecord, setEditingServiceRecord] = useState<ServiceRecord | null>(null)

  // Maintenance request state
  const [showMaintenanceRequest, setShowMaintenanceRequest] = useState(false)

  useEffect(() => {
    if (id) {
      fetchMachine()
      fetchServiceRecords()
    }
  }, [id])

  const fetchMachine = async () => {
    try {
      setLoading(true)
      const data = await machineService.getById(id!)
      setMachine(data as MachineDetailData)
      // Auto-ping on load
      pingMachine()
    } catch (error) {
      console.error('Failed to fetch machine:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchServiceRecords = async () => {
    try {
      const { data } = await api.get<ServiceRecord[]>(`/machines/${id}/service-history`)
      setServiceRecords(data)
    } catch (error) {
      console.error('Failed to fetch service records:', error)
    }
  }

  const pingMachine = async () => {
    if (!id) return
    setPinging(true)
    try {
      const { data } = await api.get<PingResult>(`/machines/${id}/ping`)
      setPingResult(data)
    } catch (error) {
      console.error('Ping failed:', error)
      setPingResult({ reachable: false, reason: 'Ping request failed' })
    } finally {
      setPinging(false)
    }
  }

  const handleAddIP = async () => {
    if (!newIP.label || !newIP.ipAddress) return
    setAddingIP(true)
    try {
      const { data } = await api.post(`/machines/${id}/ips`, newIP)
      setMachine((prev) => prev ? { ...prev, ips: [...(prev.ips || []), data] } : null)
      setNewIP({ label: '', ipAddress: '' })
      setShowAddIP(false)
    } catch (error) {
      console.error('Failed to add IP:', error)
    } finally {
      setAddingIP(false)
    }
  }

  const handleDeleteIP = async (ipId: string) => {
    try {
      await api.delete(`/machines/${id}/ips/${ipId}`)
      setMachine((prev) =>
        prev ? { ...prev, ips: prev.ips?.filter((ip) => ip.id !== ipId) } : null
      )
    } catch (error) {
      console.error('Failed to delete IP:', error)
    }
  }

  const handleStatusChange = async (newStatus: MachineStatus) => {
    if (!machine) return
    setChangingStatus(true)
    try {
      const updated = await machineService.updateStatus(machine.id, newStatus)
      setMachine((prev) => (prev ? { ...prev, status: updated.status } : null))
    } catch (error) {
      console.error('Failed to update status:', error)
    } finally {
      setChangingStatus(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this machine?')) return
    try {
      await machineService.delete(id!)
      navigate('/machines')
    } catch (error) {
      console.error('Failed to delete machine:', error)
    }
  }

  const handleHoursAdded = (newTotal: number) => {
    setMachine((prev) => (prev ? { ...prev, hourMeter: newTotal } : null))
  }

  const handleServiceRecordSaved = (record: ServiceRecord) => {
    if (editingServiceRecord) {
      // Update existing record
      setServiceRecords((prev) =>
        prev.map((r) => (r.id === record.id ? record : r))
      )
    } else {
      // Add new record at the beginning
      setServiceRecords((prev) => [record, ...prev])
    }
    setEditingServiceRecord(null)
  }

  const handleEditServiceRecord = (record: ServiceRecord) => {
    setEditingServiceRecord(record)
    setShowServiceRecord(true)
  }

  const handleDeleteServiceRecord = async (recordId: string) => {
    if (!confirm('Are you sure you want to delete this service record?')) return
    try {
      await api.delete(`/service-records/${recordId}`)
      setServiceRecords((prev) => prev.filter((r) => r.id !== recordId))
    } catch (error) {
      console.error('Failed to delete service record:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!machine) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Machine not found</p>
        <Button variant="link" onClick={() => navigate('/machines')}>
          Back to Machines
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/machines')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{machine.name}</h1>
              <div className={`h-3 w-3 rounded-full ${statusColors[machine.status]}`} />
              {pingResult && (
                <div className="flex items-center gap-1">
                  {pingResult.reachable ? (
                    <Wifi className="h-4 w-4 text-green-500" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-red-500" />
                  )}
                  <span className={`text-xs ${pingResult.reachable ? 'text-green-500' : 'text-red-500'}`}>
                    {pingResult.reachable ? 'Online' : 'Offline'}
                  </span>
                </div>
              )}
            </div>
            <p className="text-muted-foreground">{machine.model}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={pingMachine} disabled={pinging}>
            {pinging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
            Ping
          </Button>
          {(user?.role === 'admin' || user?.role === 'operator') && (
            <Button variant="outline" onClick={() => setShowMaintenanceRequest(true)}>
              <Wrench className="h-4 w-4" />
              Maintenance
            </Button>
          )}
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => navigate(`/machines/${id}/edit`)}>
                <Edit className="h-4 w-4" />
                Edit
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Machine Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p className="font-medium">{machine.location}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Hour Meter</p>
                  <p className="font-medium">{machine.hourMeter.toLocaleString()} hours</p>
                </div>
                {(user?.role === 'admin' || user?.role === 'operator') && (
                  <Button variant="ghost" size="sm" onClick={() => setShowAddHours(true)}>
                    <Timer className="h-4 w-4 mr-1" />
                    Log
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium">{machine.type?.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Build Date</p>
                  <p className="font-medium">
                    {machine.buildDate
                      ? format(parseISO(machine.buildDate), 'MMM d, yyyy')
                      : 'Not specified'}
                  </p>
                </div>
              </div>
            </div>

            {machine.notes && (
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-1">Notes</p>
                <p>{machine.notes}</p>
              </div>
            )}

            {/* Status Control */}
            {(user?.role === 'admin' || user?.role === 'operator') && (
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">Change Status</p>
                <div className="flex items-center gap-2">
                  <Select
                    value={machine.status}
                    onValueChange={(value) => handleStatusChange(value as MachineStatus)}
                    disabled={changingStatus}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="in_use">In Use</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="offline">Offline</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant={statusBadgeVariants[machine.status]}>
                    {machine.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Network/IP Info */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              Network
            </CardTitle>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => setShowAddIP(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {showAddIP && (
              <div className="mb-4 p-3 border rounded-lg space-y-3">
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input
                    placeholder="e.g., Main Controller"
                    value={newIP.label}
                    onChange={(e) => setNewIP({ ...newIP, label: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>IP Address / Hostname</Label>
                  <Input
                    placeholder="e.g., 192.168.1.100"
                    value={newIP.ipAddress}
                    onChange={(e) => setNewIP({ ...newIP, ipAddress: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddIP} disabled={addingIP}>
                    {addingIP && <Loader2 className="h-3 w-3 animate-spin" />}
                    Add
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddIP(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {machine.ips && machine.ips.length > 0 ? (
              <div className="space-y-2">
                {machine.ips.map((ip) => {
                  const ipPingResult = pingResult?.ips?.find((p) => p.id === ip.id)
                  return (
                    <div
                      key={ip.id}
                      className="flex items-center justify-between p-2 rounded-lg border"
                    >
                      <div className="flex items-center gap-2">
                        {ipPingResult ? (
                          ipPingResult.reachable ? (
                            <Wifi className="h-4 w-4 text-green-500" />
                          ) : (
                            <WifiOff className="h-4 w-4 text-red-500" />
                          )
                        ) : (
                          <Network className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{ip.label}</p>
                          <p className="text-xs text-muted-foreground font-mono">{ip.ipAddress}</p>
                        </div>
                      </div>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleDeleteIP(ip.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No IP addresses configured
              </p>
            )}
          </CardContent>
        </Card>

        {/* Service History */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Service History</CardTitle>
            {(user?.role === 'admin' || user?.role === 'operator') && (
              <Button variant="ghost" size="sm" onClick={() => setShowServiceRecord(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Record
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {serviceRecords.length > 0 ? (
              <div className="space-y-3">
                {serviceRecords.map((record) => (
                  <div key={record.id} className="flex items-start gap-3 p-3 rounded-lg border group">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{record.type}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {format(parseISO(record.performedAt), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <p className="mt-1">{record.description}</p>
                      {record.partsUsed && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Parts: {record.partsUsed}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        By {record.performedBy}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {record.cost && (
                        <span className="text-sm font-medium">${record.cost.toFixed(2)}</span>
                      )}
                      {(user?.role === 'admin' || user?.role === 'operator') && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleEditServiceRecord(record)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteServiceRecord(record.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <p className="text-muted-foreground mb-2">No service records</p>
                {(user?.role === 'admin' || user?.role === 'operator') && (
                  <Button variant="outline" size="sm" onClick={() => setShowServiceRecord(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add First Record
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status History */}
        <Card>
          <CardHeader>
            <CardTitle>Status History</CardTitle>
          </CardHeader>
          <CardContent>
            {machine.statusLogs && machine.statusLogs.length > 0 ? (
              <div className="space-y-2">
                {machine.statusLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="flex items-center justify-between text-sm">
                    <Badge variant={statusBadgeVariants[log.status as MachineStatus]} className="text-xs">
                      {log.status.replace('_', ' ')}
                    </Badge>
                    <span className="text-muted-foreground">
                      {format(parseISO(log.timestamp), 'MMM d, h:mm a')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No status history</p>
            )}
          </CardContent>
        </Card>

        {/* Custom Fields */}
        <CustomFieldsCard
          machineId={machine.id}
          machineType={machine.type}
          canEdit={user?.role === 'admin' || user?.role === 'operator'}
        />
      </div>

      {/* Add Hours Dialog */}
      <AddHoursDialog
        open={showAddHours}
        onOpenChange={setShowAddHours}
        machineId={machine.id}
        machineName={machine.name}
        currentHours={machine.hourMeter}
        onHoursAdded={handleHoursAdded}
      />

      {/* Add/Edit Service Record Dialog */}
      <AddServiceRecordDialog
        open={showServiceRecord}
        onOpenChange={(open) => {
          setShowServiceRecord(open)
          if (!open) setEditingServiceRecord(null)
        }}
        machineId={machine.id}
        machineName={machine.name}
        editingRecord={editingServiceRecord}
        onSave={handleServiceRecordSaved}
      />

      {/* Maintenance Request Dialog */}
      <MaintenanceRequestDialog
        open={showMaintenanceRequest}
        onOpenChange={setShowMaintenanceRequest}
        machineId={machine.id}
        machineName={machine.name}
      />
    </div>
  )
}
