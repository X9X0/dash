import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, AlertTriangle, Send, Upload, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from '@/components/common'
import { maintenanceService } from '@/services/maintenance'
import { useAuthStore } from '@/store/authStore'
import type { MaintenanceRequest, MaintenancePriority, MaintenanceStatus } from '@/types'

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001'

function getPhotoUrl(path: string): string {
  if (path.startsWith('http')) return path
  return `${API_BASE}${path}`
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

export function MaintenanceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isOperator = user?.role === 'admin' || user?.role === 'operator'

  const [request, setRequest] = useState<MaintenanceRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Work log form
  const [newUpdateContent, setNewUpdateContent] = useState('')
  const [newUpdatePhotos, setNewUpdatePhotos] = useState<File[]>([])
  const [submittingUpdate, setSubmittingUpdate] = useState(false)

  useEffect(() => {
    if (id) {
      fetchRequest()
    }
  }, [id])

  const fetchRequest = async () => {
    try {
      setLoading(true)
      const data = await maintenanceService.getById(id!)
      setRequest(data)
    } catch (error) {
      console.error('Failed to fetch maintenance request:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (newStatus: MaintenanceStatus) => {
    if (!request) return
    setUpdatingStatus(true)
    try {
      const updated = await maintenanceService.update(request.id, { status: newStatus })
      setRequest((prev) => prev ? { ...prev, ...updated } : null)
    } catch (error) {
      console.error('Failed to update status:', error)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleSubmitUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!request || !newUpdateContent.trim()) return

    setSubmittingUpdate(true)
    try {
      const update = await maintenanceService.addUpdate(
        request.id,
        newUpdateContent,
        newUpdatePhotos.length > 0 ? newUpdatePhotos : undefined
      )
      setRequest((prev) => prev ? {
        ...prev,
        updates: [...(prev.updates || []), update],
      } : null)
      setNewUpdateContent('')
      setNewUpdatePhotos([])
    } catch (error) {
      console.error('Failed to add update:', error)
    } finally {
      setSubmittingUpdate(false)
    }
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      setNewUpdatePhotos((prev) => [...prev, ...Array.from(files)])
    }
    e.target.value = ''
  }

  const removePhoto = (index: number) => {
    setNewUpdatePhotos((prev) => prev.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!request) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Maintenance request not found</p>
        <Button variant="link" onClick={() => navigate('/maintenance')}>
          Back to Maintenance
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/maintenance')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                to={`/machines/${request.machineId}`}
                className="text-2xl font-bold hover:underline"
              >
                {request.machine?.name || 'Unknown Machine'}
              </Link>
              <Badge variant={priorityBadgeVariants[request.priority]}>
                {request.priority}
              </Badge>
              <Badge variant={statusBadgeVariants[request.status]}>
                {request.status.replace('_', ' ')}
              </Badge>
              <Badge variant="outline">{request.type}</Badge>
            </div>
            <p className="text-muted-foreground">
              Submitted by {request.user?.name} on {format(parseISO(request.createdAt), 'MMM d, yyyy h:mm a')}
            </p>
          </div>
        </div>

        {/* Status controls */}
        {isOperator && request.status !== 'resolved' && (
          <div className="flex gap-2">
            {request.status === 'submitted' && (
              <Button
                variant="outline"
                onClick={() => handleStatusChange('in_progress')}
                disabled={updatingStatus}
              >
                {updatingStatus && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Start Work
              </Button>
            )}
            {request.status === 'in_progress' && (
              <Button
                onClick={() => handleStatusChange('resolved')}
                disabled={updatingStatus}
              >
                {updatingStatus && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Mark Resolved
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Request Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Request Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Description</p>
              <p>{request.description}</p>
            </div>

            {request.resolvedAt && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Resolved</p>
                <p className="text-green-600">
                  {format(parseISO(request.resolvedAt), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            )}

            {/* Original photos */}
            {request.photos && request.photos.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Photos</p>
                <div className="flex flex-wrap gap-2">
                  {request.photos.map((photo, i) => (
                    <a key={i} href={getPhotoUrl(photo)} target="_blank" rel="noopener noreferrer">
                      <img
                        src={getPhotoUrl(photo)}
                        alt={`Photo ${i + 1}`}
                        className="h-24 w-24 object-cover rounded border hover:opacity-80"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Machine Info */}
        <Card>
          <CardHeader>
            <CardTitle>Machine</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              to={`/machines/${request.machineId}`}
              className="block p-3 rounded-lg border hover:bg-accent transition-colors"
            >
              <p className="font-medium">{request.machine?.name}</p>
              <p className="text-sm text-muted-foreground">{request.machine?.location}</p>
              <p className="text-sm text-muted-foreground">{request.machine?.model}</p>
            </Link>
          </CardContent>
        </Card>

        {/* Work Log */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Work Log</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Timeline of updates */}
            {request.updates && request.updates.length > 0 ? (
              <div className="space-y-4 mb-6">
                {request.updates.map((update) => (
                  <div key={update.id} className="flex gap-4 p-4 rounded-lg border">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium">{update.user?.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(update.createdAt), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{update.content}</p>
                      {update.photos && update.photos.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {update.photos.map((photo, i) => (
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
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4 mb-6">
                No work log entries yet
              </p>
            )}

            {/* Add update form */}
            {isOperator && (
              <form onSubmit={handleSubmitUpdate} className="space-y-4 pt-4 border-t">
                <div>
                  <label className="text-sm font-medium mb-2 block">Add Update</label>
                  <textarea
                    value={newUpdateContent}
                    onChange={(e) => setNewUpdateContent(e.target.value)}
                    placeholder="Describe work performed, parts used, findings..."
                    className="w-full min-h-[100px] px-3 py-2 border rounded-md bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>

                {/* Photo previews */}
                {newUpdatePhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {newUpdatePhotos.map((file, i) => (
                      <div key={i} className="relative">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Preview ${i + 1}`}
                          className="h-16 w-16 object-cover rounded border"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          className="absolute -top-1 -right-1 h-5 w-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <label className="cursor-pointer">
                    <Button type="button" variant="outline" size="sm" asChild>
                      <span>
                        <Upload className="h-4 w-4 mr-2" />
                        Add Photos
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handlePhotoSelect}
                    />
                  </label>
                  <Button type="submit" disabled={submittingUpdate || !newUpdateContent.trim()}>
                    {submittingUpdate ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Post Update
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
