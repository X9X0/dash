import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2, Wrench, Image as ImageIcon } from 'lucide-react'
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common'
import api from '@/services/api'
import { maintenanceService } from '@/services/maintenance'
import type { MaintenanceRequest, MaintenanceType, MaintenancePriority, MaintenanceStatus } from '@/types'

interface EditMaintenanceRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: MaintenanceRequest
  onSave: (updated: MaintenanceRequest) => void
}

export function EditMaintenanceRequestDialog({
  open,
  onOpenChange,
  request,
  onSave,
}: EditMaintenanceRequestDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newPhotos, setNewPhotos] = useState<File[]>([])

  const [formData, setFormData] = useState({
    type: request.type,
    priority: request.priority,
    description: request.description,
    status: request.status,
  })

  useEffect(() => {
    setFormData({
      type: request.type,
      priority: request.priority,
      description: request.description,
      status: request.status,
    })
    setNewPhotos([])
    setError('')
  }, [request])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      let updated: MaintenanceRequest
      if (newPhotos.length > 0) {
        // Use FormData for file upload
        const fd = new FormData()
        fd.append('type', formData.type)
        fd.append('priority', formData.priority)
        fd.append('description', formData.description)
        fd.append('status', formData.status)
        newPhotos.forEach((file) => fd.append('photos', file))

        const { data } = await api.patch<MaintenanceRequest>(`/maintenance/${request.id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        updated = data
      } else {
        updated = await maintenanceService.update(request.id, {
          type: formData.type,
          priority: formData.priority,
          description: formData.description,
          status: formData.status,
        })
      }

      onSave(updated)
      onOpenChange(false)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Failed to update maintenance request')
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setNewPhotos(Array.from(e.target.files))
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md max-h-[90vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Edit Maintenance Request
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            Update this maintenance request
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value as MaintenanceType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="damage">Damage Report</SelectItem>
                    <SelectItem value="repair">Repair</SelectItem>
                    <SelectItem value="upgrade">Upgrade</SelectItem>
                    <SelectItem value="checkout">Checkout</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value as MaintenancePriority })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as MaintenanceStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
                className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* Existing photos */}
            {request.photos && request.photos.length > 0 && (
              <div className="space-y-2">
                <Label>Existing Photos</Label>
                <div className="flex flex-wrap gap-2">
                  {request.photos.map((photo, i) => (
                    <a key={i} href={photo} target="_blank" rel="noopener noreferrer" className="block">
                      <img
                        src={photo}
                        alt={`Photo ${i + 1}`}
                        className="h-16 w-16 object-cover rounded border hover:opacity-80"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Add new photos */}
            <div className="space-y-2">
              <Label>Add Photos</Label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer hover:bg-accent text-sm">
                  <ImageIcon className="h-4 w-4" />
                  Choose Files
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                {newPhotos.length > 0 && (
                  <span className="text-xs text-muted-foreground">{newPhotos.length} file(s) selected</span>
                )}
              </div>
              {newPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {newPhotos.map((file, i) => (
                    <img
                      key={i}
                      src={URL.createObjectURL(file)}
                      alt={`Preview ${i + 1}`}
                      className="h-16 w-16 object-cover rounded border"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
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
