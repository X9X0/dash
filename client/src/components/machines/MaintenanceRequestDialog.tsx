import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2, Wrench } from 'lucide-react'
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common'
import { maintenanceService } from '@/services/maintenance'
import type { MaintenanceType, MaintenancePriority } from '@/types'

interface MaintenanceRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machineId: string
  machineName: string
  onRequestCreated?: () => void
}

export function MaintenanceRequestDialog({
  open,
  onOpenChange,
  machineId,
  machineName,
  onRequestCreated,
}: MaintenanceRequestDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [formData, setFormData] = useState({
    type: 'repair' as MaintenanceType,
    priority: 'medium' as MaintenancePriority,
    description: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await maintenanceService.create({
        machineId,
        type: formData.type,
        priority: formData.priority,
        description: formData.description,
        status: 'submitted',
      })

      setSuccess(true)
      setFormData({
        type: 'repair',
        priority: 'medium',
        description: '',
      })

      setTimeout(() => {
        setSuccess(false)
        onOpenChange(false)
        onRequestCreated?.()
      }, 1500)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Failed to submit request')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setError('')
      setSuccess(false)
      onOpenChange(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Submit Maintenance Request
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            Request maintenance for <strong>{machineName}</strong>
          </Dialog.Description>

          {success ? (
            <div className="mt-6 py-8 text-center">
              <div className="rounded-full bg-green-500/20 p-3 w-fit mx-auto mb-4">
                <Wrench className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-lg font-medium">Request Submitted</p>
              <p className="text-sm text-muted-foreground">
                Your maintenance request has been submitted successfully.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Request Type *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) =>
                      setFormData({ ...formData, type: value as MaintenanceType })
                    }
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
                  <Label htmlFor="priority">Priority *</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) =>
                      setFormData({ ...formData, priority: value as MaintenancePriority })
                    }
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
                <Label htmlFor="description">Description *</Label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe the issue or request in detail..."
                  required
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Submit Request
                </Button>
              </div>
            </form>
          )}

          <Dialog.Close asChild>
            <button
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Close"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
