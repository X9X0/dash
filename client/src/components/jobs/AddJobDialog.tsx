import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2, ClipboardList } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common'
import api from '@/services/api'
import type { Job, Machine, JobStatus } from '@/types'

interface AddJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machines: Machine[]
  editingJob?: Job | null
  onSave: (job: Job) => void
}

const jobStatuses: { value: JobStatus; label: string }[] = [
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function AddJobDialog({
  open,
  onOpenChange,
  machines,
  editingJob,
  onSave,
}: AddJobDialogProps) {
  const isEditing = !!editingJob
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    machineId: '',
    name: '',
    status: 'queued' as JobStatus,
    startTime: '',
    endTime: '',
    notes: '',
  })

  useEffect(() => {
    if (editingJob) {
      setFormData({
        machineId: editingJob.machineId,
        name: editingJob.name,
        status: editingJob.status,
        startTime: editingJob.startTime
          ? new Date(editingJob.startTime).toISOString().slice(0, 16)
          : '',
        endTime: editingJob.endTime
          ? new Date(editingJob.endTime).toISOString().slice(0, 16)
          : '',
        notes: editingJob.notes || '',
      })
    } else {
      resetForm()
    }
  }, [editingJob, open])

  const resetForm = () => {
    setFormData({
      machineId: machines[0]?.id || '',
      name: '',
      status: 'queued',
      startTime: '',
      endTime: '',
      notes: '',
    })
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.name.trim()) {
      setError('Job name is required')
      return
    }
    if (!formData.machineId) {
      setError('Machine is required')
      return
    }

    setLoading(true)

    try {
      const payload = {
        machineId: formData.machineId,
        name: formData.name.trim(),
        status: formData.status,
        startTime: formData.startTime || undefined,
        endTime: formData.endTime || undefined,
        notes: formData.notes.trim() || undefined,
      }

      let job: Job
      if (isEditing) {
        const { data } = await api.patch<Job>(`/jobs/${editingJob.id}`, payload)
        job = data
      } else {
        const { data } = await api.post<Job>('/jobs', payload)
        job = data
      }

      onSave(job)
      onOpenChange(false)
      if (!isEditing) {
        resetForm()
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || `Failed to ${isEditing ? 'update' : 'create'} job`)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open && !isEditing) {
      resetForm()
    }
    onOpenChange(open)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            {isEditing ? 'Edit' : 'Create'} Job
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            {isEditing ? 'Update job details' : 'Create a new job for a machine'}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="machine">Machine *</Label>
              <Select
                value={formData.machineId}
                onValueChange={(value) => setFormData({ ...formData, machineId: value })}
                disabled={isEditing}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select machine" />
                </SelectTrigger>
                <SelectContent>
                  {machines.map((machine) => (
                    <SelectItem key={machine.id} value={machine.id}>
                      {machine.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Job Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Print Part #42"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as JobStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {jobStatuses.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time</Label>
                <Input
                  id="startTime"
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime">End Time</Label>
                <Input
                  id="endTime"
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Create Job'}
              </Button>
            </div>
          </form>

          <Dialog.Close asChild>
            <button
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
