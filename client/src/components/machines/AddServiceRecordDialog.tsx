import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2, Wrench, Image as ImageIcon, Paperclip, FileText } from 'lucide-react'
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
import type { ServiceRecord, ServiceType } from '@/types'

interface AddServiceRecordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machineId: string
  machineName: string
  editingRecord?: ServiceRecord | null
  onSave: (record: ServiceRecord) => void
}

const serviceTypes: { value: ServiceType; label: string }[] = [
  { value: 'repair', label: 'Repair' },
  { value: 'upgrade', label: 'Upgrade' },
  { value: 'modification', label: 'Modification' },
  { value: 'calibration', label: 'Calibration' },
]

export function AddServiceRecordDialog({
  open,
  onOpenChange,
  machineId,
  machineName,
  editingRecord,
  onSave,
}: AddServiceRecordDialogProps) {
  const isEditing = !!editingRecord
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [attachments, setAttachments] = useState<File[]>([])
  const [formData, setFormData] = useState({
    type: 'repair' as ServiceType,
    description: '',
    partsUsed: '',
    cost: '',
    performedBy: '',
    performedAt: new Date().toISOString().split('T')[0],
    notes: '',
  })

  // Update form data when editingRecord changes
  useEffect(() => {
    if (editingRecord) {
      setFormData({
        type: editingRecord.type,
        description: editingRecord.description,
        partsUsed: editingRecord.partsUsed || '',
        cost: editingRecord.cost?.toString() || '',
        performedBy: editingRecord.performedBy,
        performedAt: editingRecord.performedAt
          ? new Date(editingRecord.performedAt).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        notes: editingRecord.notes || '',
      })
      setPhotos([])
      setAttachments([])
      setError('')
    } else {
      resetForm()
    }
  }, [editingRecord])

  const resetForm = () => {
    setFormData({
      type: 'repair',
      description: '',
      partsUsed: '',
      cost: '',
      performedBy: '',
      performedAt: new Date().toISOString().split('T')[0],
      notes: '',
    })
    setPhotos([])
    setAttachments([])
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.description.trim()) {
      setError('Description is required')
      return
    }
    if (!formData.performedBy.trim()) {
      setError('Performed by is required')
      return
    }

    setLoading(true)

    try {
      let record: ServiceRecord
      if (photos.length > 0 || attachments.length > 0) {
        const fd = new FormData()
        fd.append('type', formData.type)
        fd.append('description', formData.description.trim())
        if (formData.partsUsed.trim()) fd.append('partsUsed', formData.partsUsed.trim())
        if (formData.cost) fd.append('cost', formData.cost)
        fd.append('performedBy', formData.performedBy.trim())
        fd.append('performedAt', formData.performedAt)
        if (formData.notes.trim()) fd.append('notes', formData.notes.trim())
        photos.forEach((file) => fd.append('photos', file))
        attachments.forEach((file) => fd.append('attachments', file))

        if (isEditing) {
          const { data } = await api.patch<ServiceRecord>(
            `/service-records/${editingRecord.id}`,
            fd,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          )
          record = data
        } else {
          const { data } = await api.post<ServiceRecord>(
            `/machines/${machineId}/service-history`,
            fd,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          )
          record = data
        }
      } else {
        const payload = {
          type: formData.type,
          description: formData.description.trim(),
          partsUsed: formData.partsUsed.trim() || null,
          cost: formData.cost ? parseFloat(formData.cost) : null,
          performedBy: formData.performedBy.trim(),
          performedAt: formData.performedAt,
          notes: formData.notes.trim() || null,
        }

        if (isEditing) {
          const { data } = await api.patch<ServiceRecord>(
            `/service-records/${editingRecord.id}`,
            payload
          )
          record = data
        } else {
          const { data } = await api.post<ServiceRecord>(
            `/machines/${machineId}/service-history`,
            payload
          )
          record = data
        }
      }

      onSave(record)
      onOpenChange(false)
      if (!isEditing) {
        resetForm()
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || `Failed to ${isEditing ? 'update' : 'add'} service record`)
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            {isEditing ? 'Edit' : 'Add'} Service Record
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            {isEditing ? 'Update the' : 'Log a new'} service record for {machineName}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value as ServiceType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="performedAt">Date *</Label>
                <Input
                  id="performedAt"
                  type="date"
                  value={formData.performedAt}
                  onChange={(e) => setFormData({ ...formData, performedAt: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="description">Description *</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What was done?"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="performedBy">Performed By *</Label>
                <Input
                  id="performedBy"
                  value={formData.performedBy}
                  onChange={(e) => setFormData({ ...formData, performedBy: e.target.value })}
                  placeholder="Technician name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cost">Cost ($)</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="partsUsed">Parts Used</Label>
                <Input
                  id="partsUsed"
                  value={formData.partsUsed}
                  onChange={(e) => setFormData({ ...formData, partsUsed: e.target.value })}
                  placeholder="e.g., Motor, bearings, cables"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                />
              </div>
            </div>

            {/* Existing photos (when editing) */}
            {isEditing && editingRecord.photos && editingRecord.photos.length > 0 && (
              <div className="space-y-2">
                <Label>Existing Photos</Label>
                <div className="flex flex-wrap gap-2">
                  {editingRecord.photos.map((photo, i) => (
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

            {/* Photo upload */}
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
                    onChange={(e) => {
                      if (e.target.files) setPhotos(Array.from(e.target.files))
                    }}
                    className="hidden"
                  />
                </label>
                {photos.length > 0 && (
                  <span className="text-xs text-muted-foreground">{photos.length} file(s) selected</span>
                )}
              </div>
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {photos.map((file, i) => (
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

            {/* Existing attachments (when editing) */}
            {isEditing && editingRecord.attachments && editingRecord.attachments.length > 0 && (
              <div className="space-y-2">
                <Label>Existing Attachments</Label>
                <div className="flex flex-col gap-2">
                  {editingRecord.attachments.map((attachment, i) => (
                    <a
                      key={i}
                      href={attachment.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-accent text-sm"
                    >
                      <Paperclip className="h-4 w-4" />
                      <span className="flex-1 truncate">{attachment.originalName}</span>
                      <span className="text-xs text-muted-foreground">{attachment.fileType}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* File attachments upload */}
            <div className="space-y-2">
              <Label>Add Files (Logs, Firmware, etc.)</Label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer hover:bg-accent text-sm">
                  <Paperclip className="h-4 w-4" />
                  Choose Files
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) setAttachments(Array.from(e.target.files))
                    }}
                    className="hidden"
                  />
                </label>
                {attachments.length > 0 && (
                  <span className="text-xs text-muted-foreground">{attachments.length} file(s) selected</span>
                )}
              </div>
              {attachments.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  {attachments.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 border rounded-md text-sm">
                      <FileText className="h-4 w-4" />
                      <span className="flex-1 truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Add Record'}
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
