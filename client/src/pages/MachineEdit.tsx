import { useEffect, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Save, Clock, Network, Plus, X } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/common'
import { machineService } from '@/services/machines'
import { useMachineStore } from '@/store/machineStore'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import type { Machine, MachineType, MachineStatus, MachineCondition, MachineIP } from '@/types'

const categoryOrder: Record<string, number> = {
  'Biped Humanoid': 1,
  'Wheeled Humanoid': 2,
  'Robot Arm': 3,
  'Testbench': 4,
  'FDM Printer': 5,
  'SLA/Resin Printer': 6,
  'SLS Printer': 7,
}

export function MachineEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { machineTypes, setMachineTypes, updateMachine } = useMachineStore()

  const [machine, setMachine] = useState<Machine | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    typeId: '',
    model: '',
    location: '',
    status: 'available' as MachineStatus,
    condition: 'functional' as MachineCondition,
    conditionNote: '',
    hourMeter: 0,
    buildDate: '',
    notes: '',
    autoHourTracking: false,
  })

  // IP management state
  const [ips, setIps] = useState<MachineIP[]>([])
  const [showAddIP, setShowAddIP] = useState(false)
  const [newIP, setNewIP] = useState({ label: '', ipAddress: '' })
  const [addingIP, setAddingIP] = useState(false)

  // Only admins can access this page
  if (user?.role !== 'admin') {
    return <Navigate to={`/machines/${id}`} />
  }

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return

      try {
        setLoading(true)
        const [machineData, typesData] = await Promise.all([
          machineService.getById(id),
          machineTypes.length === 0 ? machineService.getTypes() : Promise.resolve(machineTypes),
        ])

        setMachine(machineData)
        setIps(machineData.ips || [])
        if (machineTypes.length === 0) {
          setMachineTypes(typesData as MachineType[])
        }

        // Populate form data
        setFormData({
          name: machineData.name,
          typeId: machineData.typeId,
          model: machineData.model,
          location: machineData.location,
          status: machineData.status,
          condition: machineData.condition || 'functional',
          conditionNote: machineData.conditionNote || '',
          hourMeter: machineData.hourMeter,
          buildDate: machineData.buildDate ? machineData.buildDate.split('T')[0] : '',
          notes: machineData.notes || '',
          autoHourTracking: machineData.autoHourTracking || false,
        })
      } catch (error) {
        console.error('Failed to fetch machine:', error)
        setError('Failed to load machine data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id, machineTypes, setMachineTypes])

  const sortedMachineTypes = [...machineTypes].sort(
    (a, b) => (categoryOrder[a.name] ?? 99) - (categoryOrder[b.name] ?? 99)
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return

    setError('')
    setSaving(true)

    try {
      const updatedMachine = await machineService.update(id, {
        name: formData.name,
        typeId: formData.typeId,
        model: formData.model,
        location: formData.location,
        status: formData.status,
        condition: formData.condition,
        conditionNote: formData.conditionNote || null,
        hourMeter: Number(formData.hourMeter),
        buildDate: formData.buildDate || null,
        notes: formData.notes || null,
        autoHourTracking: formData.autoHourTracking,
      })

      updateMachine(id, updatedMachine)
      navigate(`/machines/${id}`)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Failed to update machine')
    } finally {
      setSaving(false)
    }
  }

  const handleAddIP = async () => {
    if (!newIP.label || !newIP.ipAddress || !id) return
    setAddingIP(true)
    try {
      const { data } = await api.post<MachineIP>(`/machines/${id}/ips`, newIP)
      setIps([...ips, data])
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
      setIps(ips.filter((ip) => ip.id !== ipId))
    } catch (error) {
      console.error('Failed to delete IP:', error)
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/machines/${id}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Edit Machine</h1>
          <p className="text-muted-foreground">{machine.name}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Machine Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
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
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={formData.typeId}
                  onValueChange={(value) => setFormData({ ...formData, typeId: value })}
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
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location *</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
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
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="condition">Condition</Label>
                <Select
                  value={formData.condition}
                  onValueChange={(value) => setFormData({ ...formData, condition: value as MachineCondition })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="functional">Functional</SelectItem>
                    <SelectItem value="degraded">Degraded</SelectItem>
                    <SelectItem value="broken">Broken</SelectItem>
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
            <div className="border-t pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-base font-medium">IP Addresses</Label>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddIP(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add IP
                </Button>
              </div>

              {showAddIP && (
                <div className="mb-4 p-3 border rounded-lg space-y-3 bg-muted/30">
                  <div className="grid gap-3 sm:grid-cols-2">
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
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={handleAddIP} disabled={addingIP}>
                      {addingIP && <Loader2 className="h-3 w-3 animate-spin" />}
                      Add
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowAddIP(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {ips.length > 0 ? (
                <div className="space-y-2">
                  {ips.map((ip) => (
                    <div
                      key={ip.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div>
                        <p className="font-medium">{ip.label}</p>
                        <p className="text-sm text-muted-foreground font-mono">{ip.ipAddress}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteIP(ip.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg">
                  No IP addresses configured
                </p>
              )}
            </div>

            {/* Auto Hour Tracking Section */}
            <div className="border-t pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="autoHourTracking" className="text-base font-medium">
                      Auto Hour Tracking
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Automatically track operating hours when the machine is reachable on the network.
                    Hours are incremented based on uptime detected via ping.
                  </p>
                </div>
                <Switch
                  id="autoHourTracking"
                  checked={formData.autoHourTracking}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, autoHourTracking: checked })
                  }
                />
              </div>
              {formData.autoHourTracking && ips.length === 0 && (
                <div className="mt-3 rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-500">
                  Add at least one IP address above for auto hour tracking to work.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => navigate(`/machines/${id}`)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
