import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common'
import { reservationService } from '@/services/reservations'
import type { Machine, Reservation } from '@/types'

interface AddReservationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machines: Machine[]
  selectedDate: Date | null
  onReservationCreated: (reservation: Reservation) => void
}

export function AddReservationDialog({
  open,
  onOpenChange,
  machines,
  selectedDate,
  onReservationCreated,
}: AddReservationDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    machineId: '',
    date: '',
    startTime: '09:00',
    endTime: '10:00',
    purpose: '',
  })

  useEffect(() => {
    if (selectedDate) {
      setFormData((prev) => ({
        ...prev,
        date: format(selectedDate, 'yyyy-MM-dd'),
      }))
    }
  }, [selectedDate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const startTime = new Date(`${formData.date}T${formData.startTime}:00`)
      const endTime = new Date(`${formData.date}T${formData.endTime}:00`)

      if (endTime <= startTime) {
        setError('End time must be after start time')
        setLoading(false)
        return
      }

      const reservation = await reservationService.create({
        machineId: formData.machineId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        purpose: formData.purpose,
        status: 'pending',
      })

      onReservationCreated(reservation)
      onOpenChange(false)
      setFormData({
        machineId: '',
        date: '',
        startTime: '09:00',
        endTime: '10:00',
        purpose: '',
      })
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Failed to create reservation')
    } finally {
      setLoading(false)
    }
  }

  const availableMachines = machines.filter((m) => m.status !== 'offline' && m.status !== 'error')

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">New Reservation</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            Reserve a machine for your project.
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
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a machine" />
                </SelectTrigger>
                <SelectContent>
                  {availableMachines.map((machine) => (
                    <SelectItem key={machine.id} value={machine.id}>
                      {machine.name} - {machine.location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time *</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">End Time *</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="purpose">Purpose *</Label>
              <Input
                id="purpose"
                value={formData.purpose}
                onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                placeholder="What will you be working on?"
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Reservation
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
