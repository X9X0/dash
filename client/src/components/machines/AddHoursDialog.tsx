import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2, Clock } from 'lucide-react'
import { Button, Input, Label } from '@/components/common'
import { machineService } from '@/services/machines'

interface AddHoursDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machineId: string
  machineName: string
  currentHours: number
  onHoursAdded: (newTotal: number) => void
}

export function AddHoursDialog({
  open,
  onOpenChange,
  machineId,
  machineName,
  currentHours,
  onHoursAdded,
}: AddHoursDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    hours: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  })

  const resetForm = () => {
    setFormData({
      hours: '',
      date: new Date().toISOString().split('T')[0],
      notes: '',
    })
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const hours = parseFloat(formData.hours)
    if (isNaN(hours) || hours <= 0) {
      setError('Please enter a valid number of hours')
      return
    }

    setLoading(true)

    try {
      await machineService.addHours(machineId, {
        hours,
        date: formData.date,
        notes: formData.notes || null,
      })

      onHoursAdded(currentHours + hours)
      onOpenChange(false)
      resetForm()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Failed to log hours')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm()
    }
    onOpenChange(open)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Log Hours
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            Add operating hours for {machineName}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Current hour meter</p>
              <p className="text-2xl font-bold">{currentHours.toLocaleString()} hours</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hours">Hours to Add *</Label>
              <Input
                id="hours"
                type="number"
                step="0.1"
                min="0.1"
                value={formData.hours}
                onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                placeholder="e.g., 8.5"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="e.g., Production run #42"
              />
            </div>

            {formData.hours && !isNaN(parseFloat(formData.hours)) && parseFloat(formData.hours) > 0 && (
              <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                <p className="text-sm text-muted-foreground">New total will be</p>
                <p className="text-xl font-bold text-primary">
                  {(currentHours + parseFloat(formData.hours)).toLocaleString()} hours
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Log Hours
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
