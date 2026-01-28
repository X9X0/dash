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
  Pencil,
  Check,
  AlertTriangle,
  ArrowRightLeft,
  Lock,
  Unlock,
  Paperclip,
  Upload,
  FileText,
} from 'lucide-react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
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
import { EditMaintenanceRequestDialog } from '@/components/machines/EditMaintenanceRequestDialog'
import type { Machine, MachineStatus, ServiceRecord, MachineStatusLog, MaintenanceRequest, MachineAttachment } from '@/types'

interface MachineDetailData extends Machine {
  statusLogs?: MachineStatusLog[]
}

interface PingResult {
  reachable: boolean
  ips?: Array<{
    id: string
    label: string
    ipAddress: string
    resolvedIP: string | null
    resolvedHostname: string | null
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

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001'

function getPhotoUrl(path: string): string {
  if (path.startsWith('http')) return path
  return `${API_BASE}${path}`
}

function isImageFile(fileType: string): boolean {
  return fileType.startsWith('image/')
}

export function MachineDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const isOperator = user?.role === 'admin' || user?.role === 'operator'

  const [machine, setMachine] = useState<MachineDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [pingResult, setPingResult] = useState<PingResult | null>(null)
  const [pinging, setPinging] = useState(false)
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([])
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([])

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

  // Maintenance editing state
  const [editingMaintenanceRequest, setEditingMaintenanceRequest] = useState<MaintenanceRequest | null>(null)

  // Status note state
  const [editingStatusNote, setEditingStatusNote] = useState(false)
  const [statusNoteValue, setStatusNoteValue] = useState('')
  const [savingStatusNote, setSavingStatusNote] = useState(false)

  // Claim state
  const [claimDuration, setClaimDuration] = useState(60)
  const [claiming, setClaiming] = useState(false)
  const [releasing, setReleasing] = useState(false)

  // Attachments state
  const [attachments, setAttachments] = useState<MachineAttachment[]>([])
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [attachmentDescription, setAttachmentDescription] = useState('')

  useEffect(() => {
    if (id) {
      fetchMachine()
      fetchTimeline()
      fetchAttachments()
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

  const fetchTimeline = async () => {
    try {
      const timeline = await machineService.getTimeline(id!)
      setServiceRecords(timeline.serviceRecords)
      setMaintenanceRequests(timeline.maintenanceRequests)
    } catch (error) {
      console.error('Failed to fetch timeline:', error)
    }
  }

  const fetchAttachments = async () => {
    try {
      const data = await machineService.getAttachments(id!)
      setAttachments(data)
    } catch (error) {
      console.error('Failed to fetch attachments:', error)
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

  const handleSaveStatusNote = async () => {
    if (!machine) return
    setSavingStatusNote(true)
    try {
      const updated = await machineService.updateStatusNote(machine.id, statusNoteValue || null)
      setMachine((prev) => prev ? { ...prev, statusNote: updated.statusNote } : null)
      setEditingStatusNote(false)
    } catch (error) {
      console.error('Failed to update status note:', error)
    } finally {
      setSavingStatusNote(false)
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
      setServiceRecords((prev) =>
        prev.map((r) => (r.id === record.id ? record : r))
      )
    } else {
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

  // Claim handlers
  const handleClaim = async () => {
    if (!machine) return
    setClaiming(true)
    try {
      const updated = await machineService.claimMachine(machine.id, claimDuration)
      setMachine((prev) => prev ? { ...prev, ...updated } : null)
    } catch (error) {
      console.error('Failed to claim machine:', error)
    } finally {
      setClaiming(false)
    }
  }

  const handleRelease = async () => {
    if (!machine) return
    setReleasing(true)
    try {
      const updated = await machineService.releaseMachine(machine.id)
      setMachine((prev) => prev ? { ...prev, ...updated } : null)
    } catch (error) {
      console.error('Failed to release machine:', error)
    } finally {
      setReleasing(false)
    }
  }

  // Maintenance edit handler
  const handleMaintenanceSaved = (updated: MaintenanceRequest) => {
    setMaintenanceRequests((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r))
    )
    setEditingMaintenanceRequest(null)
  }

  // Attachment handlers
  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    setUploadingAttachment(true)
    try {
      const attachment = await machineService.uploadAttachment(id, file, attachmentDescription || undefined)
      setAttachments((prev) => [attachment, ...prev])
      setAttachmentDescription('')
    } catch (error) {
      console.error('Failed to upload attachment:', error)
    } finally {
      setUploadingAttachment(false)
      e.target.value = ''
    }
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Delete this attachment?') || !id) return
    try {
      await machineService.deleteAttachment(id, attachmentId)
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
    } catch (error) {
      console.error('Failed to delete attachment:', error)
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

  const canClaim = isOperator && (!machine.claimedById || machine.claimedById === user?.id) && machine.status === 'available'
  const canRelease = isOperator && machine.claimedById && (machine.claimedById === user?.id || isAdmin)

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
              <div className={`h-3 w-6 rounded-full ${statusColors[machine.status]}`} />
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
            {/* Claim info */}
            {machine.claimedBy && machine.claimExpiresAt && (
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                Claimed by {machine.claimedBy.name} · Expires {formatDistanceToNow(parseISO(machine.claimExpiresAt), { addSuffix: true })}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={pingMachine} disabled={pinging}>
            {pinging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
            Ping
          </Button>
          {/* Claim/Release buttons */}
          {canClaim && !machine.claimedById && (
            <div className="flex items-center gap-1">
              <Select value={String(claimDuration)} onValueChange={(v) => setClaimDuration(Number(v))}>
                <SelectTrigger className="w-[100px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">1 hr</SelectItem>
                  <SelectItem value="120">2 hr</SelectItem>
                  <SelectItem value="240">4 hr</SelectItem>
                  <SelectItem value="480">8 hr</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="default" onClick={handleClaim} disabled={claiming}>
                {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Claim
              </Button>
            </div>
          )}
          {canRelease && (
            <Button variant="outline" onClick={handleRelease} disabled={releasing}>
              {releasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
              Release
            </Button>
          )}
          {isOperator && (
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
                {isOperator && (
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

            {/* Status Note */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-muted-foreground">Status Note</p>
                {isOperator && !editingStatusNote && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => {
                      setStatusNoteValue(machine.statusNote || '')
                      setEditingStatusNote(true)
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {editingStatusNote ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={statusNoteValue}
                    onChange={(e) => setStatusNoteValue(e.target.value)}
                    placeholder="Short status note..."
                    className="h-8 text-sm"
                  />
                  <Button size="sm" className="h-8" onClick={handleSaveStatusNote} disabled={savingStatusNote}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingStatusNote(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <p className={`text-sm ${machine.statusNote ? 'italic' : 'text-muted-foreground'}`}>
                  {machine.statusNote || 'No status note'}
                </p>
              )}
            </div>

            {/* Status Control */}
            {isOperator && (
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
                      <SelectItem value="damaged_but_usable">Damaged (Usable)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant={statusBadgeVariants[machine.status]}>
                    {machine.status === 'damaged_but_usable' ? 'damaged (usable)' : machine.status.replace('_', ' ')}
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
                  const resolvedIP = ipPingResult?.resolvedIP
                  const resolvedHostname = ipPingResult?.resolvedHostname
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
                          {ipPingResult && (resolvedIP || resolvedHostname) ? (
                            <div className="text-xs font-mono mt-0.5 space-y-0.5">
                              {resolvedHostname && (
                                <p className="text-blue-600 dark:text-blue-400">
                                  {resolvedHostname}
                                </p>
                              )}
                              {resolvedIP && (
                                <p className="text-green-600 dark:text-green-400">
                                  {resolvedIP}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground font-mono">{ip.ipAddress}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {ipPingResult && (
                          <span className={`text-xs font-medium ${ipPingResult.reachable ? 'text-green-500' : 'text-red-500'}`}>
                            {ipPingResult.reachable ? 'Online' : 'Offline'}
                          </span>
                        )}
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

        {/* Unified Timeline: Service & Maintenance */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Service & Maintenance</CardTitle>
            {isOperator && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowMaintenanceRequest(true)}>
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Report Issue
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowServiceRecord(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Record
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {(() => {
              type TimelineEntry =
                | { type: 'service'; date: string; data: ServiceRecord }
                | { type: 'maintenance'; date: string; data: MaintenanceRequest }
                | { type: 'status'; date: string; data: MachineStatusLog }

              const entries: TimelineEntry[] = [
                ...serviceRecords.map((r) => ({
                  type: 'service' as const,
                  date: r.performedAt,
                  data: r,
                })),
                ...maintenanceRequests.map((r) => ({
                  type: 'maintenance' as const,
                  date: r.createdAt,
                  data: r,
                })),
                ...(machine.statusLogs || []).map((l) => ({
                  type: 'status' as const,
                  date: l.timestamp,
                  data: l,
                })),
              ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

              if (entries.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-8">
                    <p className="text-muted-foreground mb-2">No history yet</p>
                    {isOperator && (
                      <Button variant="outline" size="sm" onClick={() => setShowServiceRecord(true)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add First Record
                      </Button>
                    )}
                  </div>
                )
              }

              return (
                <div className="space-y-3">
                  {entries.map((entry) => {
                    if (entry.type === 'service') {
                      const record = entry.data as ServiceRecord
                      return (
                        <div key={`service-${record.id}`} className="flex items-start gap-3 p-3 rounded-lg border group">
                          <div className="mt-0.5">
                            <Wrench className="h-4 w-4 text-blue-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="default" className="text-xs">Service</Badge>
                              <Badge variant="outline" className="text-xs">{record.type}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {format(parseISO(record.performedAt), 'MMM d, yyyy')}
                              </span>
                            </div>
                            <p className="mt-1 text-sm">{record.description}</p>
                            {record.partsUsed && (
                              <p className="text-xs text-muted-foreground mt-1">Parts: {record.partsUsed}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">By {record.performedBy}</p>
                            {/* Photos */}
                            {record.photos && record.photos.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {record.photos.map((photo, i) => (
                                  <a key={i} href={getPhotoUrl(photo)} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={getPhotoUrl(photo)}
                                      alt={`Photo ${i + 1}`}
                                      className="h-16 w-16 object-cover rounded border hover:opacity-80"
                                    />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {record.cost != null && record.cost > 0 && (
                              <span className="text-sm font-medium">${record.cost.toFixed(2)}</span>
                            )}
                            {isOperator && (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditServiceRecord(record)}>
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteServiceRecord(record.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    }

                    if (entry.type === 'maintenance') {
                      const request = entry.data as MaintenanceRequest
                      return (
                        <div key={`maintenance-${request.id}`} className="flex items-start gap-3 p-3 rounded-lg border group">
                          <div className="mt-0.5">
                            <AlertTriangle className="h-4 w-4 text-orange-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="warning" className="text-xs">Issue</Badge>
                              <Badge variant="outline" className="text-xs">{request.type}</Badge>
                              <Badge variant={
                                request.priority === 'critical' ? 'destructive' :
                                request.priority === 'high' ? 'warning' : 'secondary'
                              } className="text-xs">{request.priority}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {format(parseISO(request.createdAt), 'MMM d, yyyy')}
                              </span>
                            </div>
                            <p className="mt-1 text-sm">{request.description}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">
                                Status: {request.status}
                              </span>
                              {request.user && (
                                <span className="text-xs text-muted-foreground">
                                  by {request.user.name}
                                </span>
                              )}
                            </div>
                            {/* Photos */}
                            {request.photos && request.photos.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {request.photos.map((photo, i) => (
                                  <a key={i} href={getPhotoUrl(photo)} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={getPhotoUrl(photo)}
                                      alt={`Photo ${i + 1}`}
                                      className="h-16 w-16 object-cover rounded border hover:opacity-80"
                                    />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Edit button for operators */}
                          {isOperator && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingMaintenanceRequest(request)}>
                                <Edit className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    }

                    // status log
                    const log = entry.data as MachineStatusLog
                    return (
                      <div key={`status-${log.id}`} className="flex items-start gap-3 p-3 rounded-lg border">
                        <div className="mt-0.5">
                          <ArrowRightLeft className="h-4 w-4 text-gray-500" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">Status Change</Badge>
                            <Badge variant={statusBadgeVariants[log.status as MachineStatus] || 'secondary'} className="text-xs">
                              {log.status === 'damaged_but_usable' ? 'damaged (usable)' : log.status.replace('_', ' ')}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(parseISO(log.timestamp), 'MMM d, h:mm a')}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">Source: {log.source}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </CardContent>
        </Card>

        {/* Attachments */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Attachments
            </CardTitle>
            {isOperator && (
              <label className="cursor-pointer">
                <Button variant="ghost" size="sm" asChild>
                  <span>
                    {uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  </span>
                </Button>
                <input
                  type="file"
                  className="hidden"
                  onChange={handleUploadAttachment}
                  accept="image/*,.pdf,.txt,.zip"
                  disabled={uploadingAttachment}
                />
              </label>
            )}
          </CardHeader>
          <CardContent>
            {attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-3 p-2 rounded-lg border group">
                    {isImageFile(att.fileType) ? (
                      <a href={getPhotoUrl(`/uploads/${att.filename}`)} target="_blank" rel="noopener noreferrer">
                        <img
                          src={getPhotoUrl(`/uploads/${att.filename}`)}
                          alt={att.originalName}
                          className="h-10 w-10 object-cover rounded"
                        />
                      </a>
                    ) : (
                      <FileText className="h-10 w-10 text-muted-foreground p-2" />
                    )}
                    <div className="flex-1 min-w-0">
                      <a
                        href={getPhotoUrl(`/uploads/${att.filename}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium hover:underline truncate block"
                      >
                        {att.originalName}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {att.user?.name} · {format(parseISO(att.createdAt), 'MMM d, yyyy')}
                      </p>
                      {att.description && (
                        <p className="text-xs text-muted-foreground">{att.description}</p>
                      )}
                    </div>
                    {(att.userId === user?.id || isAdmin) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        onClick={() => handleDeleteAttachment(att.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No attachments
              </p>
            )}
          </CardContent>
        </Card>

        {/* Custom Fields */}
        <CustomFieldsCard
          machineId={machine.id}
          machineType={machine.type}
          canEdit={isOperator}
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
        onRequestCreated={() => fetchTimeline()}
      />

      {/* Edit Maintenance Request Dialog */}
      {editingMaintenanceRequest && (
        <EditMaintenanceRequestDialog
          open={!!editingMaintenanceRequest}
          onOpenChange={(open) => { if (!open) setEditingMaintenanceRequest(null) }}
          request={editingMaintenanceRequest}
          onSave={handleMaintenanceSaved}
        />
      )}
    </div>
  )
}
