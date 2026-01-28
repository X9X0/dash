import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common'
import { machineService } from '@/services/machines'
import { useMachineStore } from '@/store/machineStore'
import api from '@/services/api'
import type { MachineType, MachineStatus } from '@/types'

interface IPEntry {
  label: string
  ipAddress: string
}

interface AddMachineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machineTypes: MachineType[]
}

// Define category order for sorting
const categoryOrder: Record<string, number> = {
  'Biped Humanoid': 1,
  'Wheeled Humanoid': 2,
  'Robot Arm': 3,
  'Testbench': 4,
  'FDM Printer': 5,
  'SLA/Resin Printer': 6,
  'SLS Printer': 7,
}

export function AddMachineDialog({ open, onOpenChange, machineTypes }: AddMachineDialogProps) {
  const { addMachine } = useMachineStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Sort machine types by category order
  const sortedMachineTypes = [...machineTypes].sort(
    (a, b) => (categoryOrder[a.name] ?? 99) - (categoryOrder[b.name] ?? 99)
  )

  const [formData, setFormData] = useState({
    name: '',
    typeId: '',
    model: '',
    location: '',
    status: 'available' as MachineStatus,
    hourMeter: 0,
    buildDate: '',
    notes: '',
  })

  const [ipEntries, setIpEntries] = useState<IPEntry[]>([
    { label: '', ipAddress: '' }
  ])

  const addIPEntry = () => {
    setIpEntries([...ipEntries, { label: '', ipAddress: '' }])
  }

  const removeIPEntry = (index: number) => {
    setIpEntries(ipEntries.filter((_, i) => i !== index))
  }

  const updateIPEntry = (index: number, field: keyof IPEntry, value: string) => {
    const updated = [...ipEntries]
    updated[index][field] = value
    setIpEntries(updated)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      typeId: '',
      model: '',
      location: '',
      status: 'available',
      hourMeter: 0,
      buildDate: '',
      notes: '',
    })
    setIpEntries([{ label: '', ipAddress: '' }])
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Create the machine first
      const machine = await machineService.create({
        ...formData,
        hourMeter: Number(formData.hourMeter),
        buildDate: formData.buildDate || null,
        notes: formData.notes || null,
      })

      // Add IP addresses if any are filled in
      const validIPs = ipEntries.filter(ip => ip.label && ip.ipAddress)
      for (const ip of validIPs) {
        try {
          await api.post(`/machines/${machine.id}/ips`, ip)
        } catch (ipError) {
          console.error('Failed to add IP:', ipError)
        }
      }

      // Refresh machine data to include IPs
      const updatedMachine = await machineService.getById(machine.id)
      addMachine(updatedMachine)

      onOpenChange(false)
      resetForm()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Failed to create machine')
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">Add New Machine</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            Enter the details for the new machine.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Robot Arm #1"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={formData.typeId}
                  onValueChange={(value) => setFormData({ ...formData, typeId: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedMachineTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Model *</Label>
                <Input
                  id="model"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="UR5e"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location *</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Lab A - Station 1"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as MachineStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="in_use">In Use</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="damaged_but_usable">Damaged (Usable)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hourMeter">Hour Meter</Label>
                <Input
                  id="hourMeter"
                  type="number"
                  min="0"
                  value={formData.hourMeter}
                  onChange={(e) => setFormData({ ...formData, hourMeter: Number(e.target.value) })}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="buildDate">Build Date</Label>
                <Input
                  id="buildDate"
                  type="date"
                  value={formData.buildDate}
                  onChange={(e) => setFormData({ ...formData, buildDate: e.target.value })}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional notes about this machine"
                />
              </div>
            </div>

            {/* Network / IP Addresses Section */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base">Network Addresses</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addIPEntry}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add IP
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Add IP addresses or hostnames to enable ping/reachability monitoring.
              </p>
              <div className="space-y-3">
                {ipEntries.map((entry, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Input
                        placeholder="Label (e.g., Main Controller)"
                        value={entry.label}
                        onChange={(e) => updateIPEntry(index, 'label', e.target.value)}
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        placeholder="IP or hostname"
                        value={entry.ipAddress}
                        onChange={(e) => updateIPEntry(index, 'ipAddress', e.target.value)}
                      />
                    </div>
                    {ipEntries.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeIPEntry(index)}
                        className="shrink-0"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Add Machine
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
