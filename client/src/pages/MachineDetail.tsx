import { useEffect, useState, useRef, useCallback } from 'react'
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
  Printer,
  ExternalLink,
  Pause,
  Square,
  Play,
  Thermometer,
  Layers,
  Camera,
} from 'lucide-react'
import { format, parseISO, differenceInSeconds } from 'date-fns'

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
import { formatHours } from '@/lib/utils'
import { userService } from '@/services/users'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import { bambuddyService } from '@/services/bambuddy'
import type { BamBuddyPrinterStatus, BamBuddyPrintLogEntry, BamBuddyConfig, BamBuddyMaintenanceOverview } from '@/types/bambuddy'
import { AddHoursDialog } from '@/components/machines/AddHoursDialog'
import { AddServiceRecordDialog } from '@/components/machines/AddServiceRecordDialog'
import { CustomFieldsCard } from '@/components/machines/CustomFieldsCard'
import { MaintenanceRequestDialog } from '@/components/machines/MaintenanceRequestDialog'
import { EditMaintenanceRequestDialog } from '@/components/machines/EditMaintenanceRequestDialog'
import type { Machine, MachineStatus, MachineCondition, ServiceRecord, MachineStatusLog, MaintenanceRequest, MachineAttachment, UptimeData } from '@/types'

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
    hostnameReachable: boolean | null
  }>
  reason?: string
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

const conditionColors: Record<string, string> = {
  functional: 'bg-green-500',
  degraded: 'hazard-stripes',
  broken: 'bg-red-500',
}

const conditionBadgeVariants: Record<string, 'success' | 'caution' | 'destructive'> = {
  functional: 'success',
  degraded: 'caution',
  broken: 'destructive',
}

function getPhotoUrl(path: string): string {
  if (path.startsWith('http')) return path
  // Use relative URL - works regardless of domain/port
  return path
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
  const [changingCondition, setChangingCondition] = useState(false)

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
  const [claimingUserId, setClaimingUserId] = useState<string>('')
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([])
  const [claiming, setClaiming] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [countdown, setCountdown] = useState<string | null>(null)

  // Update countdown every second when machine is claimed
  useEffect(() => {
    if (machine?.claimExpiresAt) {
      setCountdown(formatCountdown(machine.claimExpiresAt))
      const interval = setInterval(() => {
        setCountdown(formatCountdown(machine.claimExpiresAt!))
      }, 1000)
      return () => clearInterval(interval)
    }
    setCountdown(null)
  }, [machine?.claimExpiresAt])

  // Attachments state
  const [attachments, setAttachments] = useState<MachineAttachment[]>([])
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [attachmentDescription, setAttachmentDescription] = useState('')
  const [showAllFiles, setShowAllFiles] = useState(false)

  // Uptime monitoring state
  const [uptime, setUptime] = useState<UptimeData | null>(null)

  // BamBuddy state
  const [bbStatus, setBbStatus] = useState<BamBuddyPrinterStatus | null>(null)
  const [bbPrintLog, setBbPrintLog] = useState<BamBuddyPrintLogEntry[]>([])
  const [bbConfig, setBbConfig] = useState<BamBuddyConfig | null>(null)
  const [bbControlling, setBbControlling] = useState(false)
  const [bbCameraError, setBbCameraError] = useState(false)
  const [bbCameraLive, setBbCameraLive] = useState(false)
  const [bbSnapshotUrl, setBbSnapshotUrl] = useState<string | null>(null)
  const snapshotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [bbMaintenance, setBbMaintenance] = useState<BamBuddyMaintenanceOverview | null>(null)

  useEffect(() => {
    if (id) {
      fetchMachine()
      fetchTimeline()
      fetchAttachments()
      fetchBamBuddyData()
      fetchUptime()
    }
    if (isAdmin) {
      fetchUsers()
    }

    // Poll BamBuddy status every 10 seconds
    const bbInterval = setInterval(() => {
      if (id) {
        bambuddyService.getStatus(id).then((s) => setBbStatus(s)).catch(() => {})
      }
    }, 10000)
    return () => clearInterval(bbInterval)
  }, [id, isAdmin])

  const fetchUsers = async () => {
    try {
      const allUsers = await userService.getAll()
      setUsers(allUsers.map(u => ({ id: u.id, name: u.name })))
    } catch (error) {
      console.error('Failed to fetch users:', error)
    }
  }

  const fetchUptime = async () => {
    if (!id) return
    try {
      setUptime(await machineService.getUptime(id))
    } catch (error) {
      console.error('Failed to fetch uptime:', error)
    }
  }

  const fetchBamBuddyData = async () => {
    if (!id) return
    try {
      const [status, config, logResponse, maintenance] = await Promise.all([
        bambuddyService.getStatus(id),
        bambuddyService.getConfig(),
        bambuddyService.getPrintLog(id, 10),
        bambuddyService.getMaintenance(id),
      ])
      setBbStatus(status)
      setBbConfig(config)
      setBbPrintLog(logResponse.items)
      setBbMaintenance(maintenance)
    } catch {
      // BamBuddy unavailable or machine not linked
    }
  }

  // Snapshot refresh: load a new snapshot every 5 seconds when not in live mode
  const refreshSnapshot = useCallback(() => {
    if (!id) return
    // Append timestamp to bust browser cache
    setBbSnapshotUrl(bambuddyService.getCameraSnapshotUrl(id) + '&_t=' + Date.now())
  }, [id])

  useEffect(() => {
    if (!id || !bbStatus || bbStatus.error || bbCameraLive) {
      // Clear interval when switching to live mode or no printer
      if (snapshotIntervalRef.current) {
        clearInterval(snapshotIntervalRef.current)
        snapshotIntervalRef.current = null
      }
      return
    }
    // Take initial snapshot immediately
    refreshSnapshot()
    // Then refresh every 5 seconds
    snapshotIntervalRef.current = setInterval(refreshSnapshot, 5000)
    return () => {
      if (snapshotIntervalRef.current) {
        clearInterval(snapshotIntervalRef.current)
        snapshotIntervalRef.current = null
      }
    }
  }, [id, bbStatus, bbCameraLive, refreshSnapshot])

  const handleBBControl = async (action: 'stop' | 'pause' | 'resume') => {
    if (!id || !confirm(`Are you sure you want to ${action} the print?`)) return
    setBbControlling(true)
    try {
      await bambuddyService.controlPrint(id, action)
      // Re-fetch status after a short delay to reflect the change
      setTimeout(async () => {
        const s = await bambuddyService.getStatus(id)
        setBbStatus(s)
        setBbControlling(false)
      }, 2000)
    } catch (error) {
      console.error(`Failed to ${action} print:`, error)
      setBbControlling(false)
    }
  }

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
      // Update statusLogs from timeline (includes user data)
      if (timeline.statusLogs) {
        setMachine((prev) => prev ? { ...prev, statusLogs: timeline.statusLogs } : null)
      }
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
      fetchTimeline() // Refresh to show new status log with user
    } catch (error) {
      console.error('Failed to update status:', error)
    } finally {
      setChangingStatus(false)
    }
  }

  const handleConditionChange = async (newCondition: MachineCondition) => {
    if (!machine) return
    setChangingCondition(true)
    try {
      const updated = await machineService.updateCondition(machine.id, newCondition)
      setMachine((prev) => (prev ? { ...prev, condition: updated.condition } : null))
      fetchTimeline() // Refresh to show new status log with user
    } catch (error) {
      console.error('Failed to update condition:', error)
    } finally {
      setChangingCondition(false)
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
      const userId = claimingUserId || undefined
      const updated = await machineService.claimMachine(machine.id, claimDuration, userId)
      setMachine((prev) => prev ? { ...prev, ...updated } : null)
      setClaimingUserId('') // Reset the user selection
      fetchTimeline() // Refresh to show new status log with user
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
      fetchTimeline() // Refresh to show new status log with user
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

  // Gather all files from service records and attachments
  const getAllFiles = () => {
    const files: Array<{
      id: string
      filename: string
      originalName: string
      fileType: string
      createdAt: string
      userId?: string
      userName?: string
      source: 'attachment' | 'service-record'
      serviceRecordId?: string
    }> = []

    // Add machine attachments
    attachments.forEach((att) => {
      files.push({
        id: att.id,
        filename: `/uploads/${att.filename}`,
        originalName: att.originalName,
        fileType: att.fileType,
        createdAt: att.createdAt,
        userId: att.userId,
        userName: att.user?.name,
        source: 'attachment',
      })
    })

    // Add service record attachments
    serviceRecords.forEach((record) => {
      if (record.attachments && record.attachments.length > 0) {
        record.attachments.forEach((att, idx) => {
          files.push({
            id: `${record.id}-${idx}`,
            filename: att.filename,
            originalName: att.originalName,
            fileType: att.fileType,
            createdAt: record.performedAt,
            userId: record.userId,
            userName: record.user?.name,
            source: 'service-record',
            serviceRecordId: record.id,
          })
        })
      }
    })

    // Sort by date, most recent first
    return files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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
              <div className={`h-3 w-6 rounded-full ${machine.condition === 'broken' ? conditionColors.broken : machine.condition === 'degraded' ? conditionColors.degraded : statusColors[machine.status]}`} />
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
            {/* Claim info with countdown */}
            {machine.claimedBy && countdown && (
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                <Timer className="h-3.5 w-3.5" />
                Claimed by {machine.claimedBy.name} · <span className="font-mono">{countdown}</span> remaining
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
              {isAdmin && users.length > 0 && (
                <Select value={claimingUserId || '__self__'} onValueChange={(v) => setClaimingUserId(v === '__self__' ? '' : v)}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder="For yourself" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__self__">Yourself</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={claimDuration}
                  onChange={(e) => setClaimDuration(Math.max(1, Math.min(1440, Number(e.target.value) || 60)))}
                  className="w-[70px] h-9 text-center"
                />
                <span className="text-sm text-muted-foreground">min</span>
              </div>
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

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main Info */}
        <Card className="lg:col-span-2 lg:row-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Machine Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
                  <p className="font-medium">{formatHours(machine.hourMeter)} hours</p>
                </div>
                {isOperator && (
                  <Button variant="ghost" size="sm" onClick={() => setShowAddHours(true)}>
                    <Timer className="h-4 w-4 mr-1" />
                    Log
                  </Button>
                )}
              </div>
              {uptime?.monitorUptime && (
                <div className="flex items-center gap-3">
                  {uptime.isOnline === false ? (
                    <WifiOff className="h-4 w-4 text-red-500" />
                  ) : (
                    <Wifi className="h-4 w-4 text-green-500" />
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Uptime ({uptime.windowDays}d)
                    </p>
                    <p className="font-medium">
                      {uptime.isOnline === null
                        ? 'Checking…'
                        : uptime.isOnline
                          ? 'Online'
                          : 'Offline'}
                      {uptime.uptimePercent !== null && (
                        <span className="text-muted-foreground font-normal">
                          {' '}· {uptime.uptimePercent.toFixed(2)}% up
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}
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
                <div className="flex flex-col gap-2">
                  <textarea
                    value={statusNoteValue}
                    onChange={(e) => setStatusNoteValue(e.target.value)}
                    placeholder="Status note (2-3 lines)..."
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveStatusNote} disabled={savingStatusNote}>
                      <Check className="h-3 w-3 mr-1" />
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingStatusNote(false)}>
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className={`text-sm whitespace-pre-wrap ${machine.statusNote ? 'italic' : 'text-muted-foreground'}`}>
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
                    </SelectContent>
                  </Select>
                  <Badge variant={statusBadgeVariants[machine.status]}>
                    {machine.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
            )}

            {/* Condition Control */}
            {isOperator && (
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">Change Condition</p>
                <div className="flex items-center gap-2">
                  <Select
                    value={machine.condition}
                    onValueChange={(value) => handleConditionChange(value as MachineCondition)}
                    disabled={changingCondition}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="functional">Functional</SelectItem>
                      <SelectItem value="degraded">Degraded</SelectItem>
                      <SelectItem value="broken">Broken</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant={conditionBadgeVariants[machine.condition]}>
                    {machine.condition}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Network/IP Info */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4" />
              Network
            </CardTitle>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => setShowAddIP(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="px-4 pb-4">
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
                                <p className={ipPingResult.hostnameReachable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                  {resolvedHostname}
                                </p>
                              )}
                              {resolvedIP && (
                                <p className={ipPingResult.reachable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
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

        {/* BamBuddy Print Status */}
        {bbStatus && !bbStatus.error && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Printer className="h-4 w-4" />
                Print Status
              </CardTitle>
              {bbConfig?.available && bbConfig.publicUrl && (
                <a
                  href={bbConfig.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  BamBuddy <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {/* State */}
              <div className="flex items-center justify-between">
                <Badge
                  variant={
                    bbStatus.state === 'RUNNING' ? 'default' :
                    bbStatus.state === 'IDLE' ? 'success' :
                    bbStatus.state === 'PAUSE' ? 'warning' :
                    bbStatus.state === 'FINISH' ? 'success' :
                    bbStatus.state === 'FAILED' ? 'destructive' :
                    'secondary'
                  }
                >
                  {bbStatus.state}
                </Badge>
                <span className={`text-xs ${bbStatus.connected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {bbStatus.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              {/* Progress (when printing) */}
              {bbStatus.state === 'RUNNING' && (
                <div className="space-y-1">
                  <p className="text-sm font-medium truncate">{bbStatus.current_print || 'Printing...'}</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                        style={{ width: `${bbStatus.progress}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono font-medium">{bbStatus.progress}%</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    {bbStatus.layer_num != null && bbStatus.total_layers != null && (
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        Layer {bbStatus.layer_num}/{bbStatus.total_layers}
                      </span>
                    )}
                    <span>~{Math.round(bbStatus.remaining_time)} min remaining</span>
                  </div>
                </div>
              )}

              {/* Temperatures */}
              {bbStatus.temperatures && (
                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <Thermometer className="h-3 w-3 text-orange-500" />
                    <span>Nozzle: {Math.round(bbStatus.temperatures.nozzle)}/{bbStatus.temperatures.nozzle_target}&deg;C</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Thermometer className="h-3 w-3 text-blue-500" />
                    <span>Bed: {Math.round(bbStatus.temperatures.bed)}/{bbStatus.temperatures.bed_target}&deg;C</span>
                  </div>
                </div>
              )}

              {/* Print Controls */}
              {isOperator && (bbStatus.state === 'RUNNING' || bbStatus.state === 'PAUSE') && (
                <div className="flex gap-2 pt-1 border-t">
                  {bbStatus.state === 'RUNNING' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleBBControl('pause')}
                        disabled={bbControlling}
                      >
                        {bbControlling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
                        Pause
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleBBControl('stop')}
                        disabled={bbControlling}
                      >
                        {bbControlling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
                        Stop
                      </Button>
                    </>
                  )}
                  {bbStatus.state === 'PAUSE' && (
                    <Button
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={() => handleBBControl('resume')}
                      disabled={bbControlling}
                    >
                      {bbControlling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      Resume
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* BamBuddy Printer Maintenance */}
        {bbMaintenance && bbMaintenance.maintenance_items.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wrench className="h-4 w-4" />
                Printer Maintenance
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {Math.round(bbMaintenance.total_print_hours)} print hours
              </span>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {bbMaintenance.maintenance_items.filter((item) => item.enabled).map((item) => {
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
              {(bbMaintenance.due_count > 0 || bbMaintenance.warning_count > 0) && bbConfig?.publicUrl && (
                <a
                  href={bbConfig.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-center text-primary hover:underline pt-1"
                >
                  Perform maintenance in BamBuddy
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* Files (Attachments + Service Record Files) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Paperclip className="h-4 w-4" />
              Files
            </CardTitle>
            <div className="flex items-center gap-2">
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
                    disabled={uploadingAttachment}
                  />
                </label>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {(() => {
              const allFiles = getAllFiles()
              const displayFiles = showAllFiles ? allFiles : allFiles.slice(0, 6)

              return allFiles.length > 0 ? (
                <div className="space-y-2">
                  {displayFiles.map((file) => (
                    <div key={file.id} className="flex items-center gap-3 p-2 rounded-lg border group">
                      {isImageFile(file.fileType) ? (
                        <a href={getPhotoUrl(file.filename)} target="_blank" rel="noopener noreferrer">
                          <img
                            src={getPhotoUrl(file.filename)}
                            alt={file.originalName}
                            className="h-10 w-10 object-cover rounded"
                          />
                        </a>
                      ) : (
                        <FileText className="h-10 w-10 text-muted-foreground p-2" />
                      )}
                      <div className="flex-1 min-w-0">
                        <a
                          href={getPhotoUrl(file.filename)}
                          download={file.originalName}
                          className="text-sm font-medium hover:underline truncate block"
                        >
                          {file.originalName}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {file.userName || 'Unknown'} · {format(parseISO(file.createdAt), 'MMM d, yyyy h:mm a')}
                          {file.source === 'service-record' && ' · Service record'}
                        </p>
                      </div>
                      {file.source === 'attachment' && (file.userId === user?.id || isAdmin) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          onClick={() => handleDeleteAttachment(file.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {allFiles.length > 6 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setShowAllFiles(!showAllFiles)}
                    >
                      {showAllFiles ? 'Show Less' : `Show All (${allFiles.length} files)`}
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No files
                </p>
              )
            })()}
          </CardContent>
        </Card>

        {/* BamBuddy Camera Feed */}
        {bbStatus && !bbStatus.error && (
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Camera className="h-4 w-4" />
                Camera
              </CardTitle>
              <Button
                variant={bbCameraLive ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-7"
                onClick={() => {
                  setBbCameraError(false)
                  setBbCameraLive(!bbCameraLive)
                }}
              >
                {bbCameraLive ? 'Live' : 'Snapshot'}
              </Button>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {!bbCameraError ? (
                bbCameraLive ? (
                  <img
                    src={bambuddyService.getCameraStreamUrl(id!)}
                    alt="Printer camera live"
                    className="w-full rounded-lg bg-muted"
                    onError={() => setBbCameraError(true)}
                  />
                ) : (
                  bbSnapshotUrl && (
                    <img
                      src={bbSnapshotUrl}
                      alt="Printer camera snapshot"
                      className="w-full rounded-lg bg-muted"
                      onError={() => setBbCameraError(true)}
                    />
                  )
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Camera className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Camera unavailable</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs"
                    onClick={() => {
                      setBbCameraError(false)
                      if (!bbCameraLive) refreshSnapshot()
                    }}
                  >
                    Retry
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* BamBuddy Recent Prints */}
        {bbPrintLog.length > 0 && (
          <Card className="lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Printer className="h-4 w-4" />
                Recent Prints
              </CardTitle>
              {bbConfig?.available && bbConfig.publicUrl && (
                <a
                  href={bbConfig.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  View all in BamBuddy <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {bbPrintLog.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 p-2 rounded-lg border">
                    {entry.thumbnail_path ? (
                      <img
                        src={bambuddyService.getPrintLogThumbnailUrl(id!, entry.id)}
                        alt=""
                        className="h-10 w-10 object-cover rounded bg-muted"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                        <Printer className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.print_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.duration_seconds != null && (
                          <span>{Math.round(entry.duration_seconds / 60)} min</span>
                        )}
                        {entry.filament_used_grams != null && (
                          <span className="ml-2">{entry.filament_used_grams.toFixed(1)}g {entry.filament_type || ''}</span>
                        )}
                        {entry.completed_at && (
                          <span className="ml-2">{format(parseISO(entry.completed_at), 'MMM d, h:mm a')}</span>
                        )}
                      </p>
                    </div>
                    <Badge
                      variant={
                        entry.status === 'completed' || entry.status === 'success' ? 'success' :
                        entry.status === 'failed' ? 'destructive' :
                        'secondary'
                      }
                    >
                      {entry.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status History + Service & Maintenance side by side */}
        <div className="lg:col-span-3 grid gap-4 lg:grid-cols-2">

          {/* Status History */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Status History</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const statusEntries = (machine.statusLogs || [])
                  .slice()
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

                if (statusEntries.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-8">
                      <p className="text-muted-foreground">No status changes yet</p>
                    </div>
                  )
                }

                return (
                  <div className="space-y-3">
                    {statusEntries.map((log) => (
                      <div key={`status-${log.id}`} className="flex items-start gap-3 p-3 rounded-lg border">
                        <div className="mt-0.5">
                          <ArrowRightLeft className="h-4 w-4 text-gray-500" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs">Status Change</Badge>
                            <Badge variant={statusBadgeVariants[log.status as MachineStatus] || 'secondary'} className="text-xs">
                              {log.status.replace('_', ' ')}
                            </Badge>
                            {log.condition && (
                              <Badge variant={conditionBadgeVariants[log.condition] || 'secondary'} className="text-xs">
                                {log.condition}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {format(parseISO(log.timestamp), 'MMM d, h:mm a')}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {log.source}{log.user ? ` · by ${log.user.name}` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          {/* Service & Maintenance */}
          <Card>
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
                              {/* Attachments count */}
                              {record.attachments && record.attachments.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                  <Paperclip className="h-3 w-3" />
                                  {record.attachments.length} file{record.attachments.length !== 1 ? 's' : ''} uploaded
                                </p>
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

                      // maintenance
                      const request = entry.data as MaintenanceRequest
                      return (
                        <div
                          key={`maintenance-${request.id}`}
                          className="flex items-start gap-3 p-3 rounded-lg border group hover:bg-accent/50 cursor-pointer transition-colors"
                          onClick={() => navigate(`/maintenance/${request.id}`)}
                        >
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
                                  <a key={i} href={getPhotoUrl(photo)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
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
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditingMaintenanceRequest(request) }}>
                                <Edit className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </CardContent>
          </Card>

        </div>

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
