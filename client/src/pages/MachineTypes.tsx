import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2, Plus, Pencil, Trash2, Cpu, Printer, Search } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import type { MachineType, MachineCategory } from '@/types'

const categoryIcons: Record<MachineCategory, React.ReactNode> = {
  robot: <Cpu className="h-4 w-4" />,
  printer: <Printer className="h-4 w-4" />,
}

export function MachineTypes() {
  const { user } = useAuthStore()
  const [types, setTypes] = useState<MachineType[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [editingType, setEditingType] = useState<MachineType | null>(null)

  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" />
  }

  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const { data } = await api.get<MachineType[]>('/machine-types')
        setTypes(data)
      } catch (error) {
        console.error('Failed to fetch machine types:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchTypes()
  }, [])

  const filteredTypes = types.filter((type) =>
    type.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleTypeSaved = (type: MachineType) => {
    if (editingType) {
      setTypes(types.map((t) => (t.id === type.id ? type : t)))
    } else {
      setTypes([...types, type])
    }
    setEditingType(null)
  }

  const handleEdit = (type: MachineType) => {
    setEditingType(type)
    setShowDialog(true)
  }

  const handleDelete = async (typeId: string) => {
    if (!confirm('Are you sure you want to delete this machine type?')) return
    try {
      await api.delete(`/machine-types/${typeId}`)
      setTypes(types.filter((t) => t.id !== typeId))
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      alert(error.response?.data?.error || 'Failed to delete machine type')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Machine Types</h1>
          <p className="text-muted-foreground">Manage machine categories and custom fields</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4" />
          Add Type
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search types..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredTypes.map((type) => (
          <Card key={type.id} className="group">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    {categoryIcons[type.category]}
                  </div>
                  <div>
                    <h3 className="font-medium">{type.name}</h3>
                    <Badge variant="outline" className="mt-1">
                      {type.category}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleEdit(type)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(type.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {type.fieldsSchema && Object.keys(type.fieldsSchema).length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Custom Fields:</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(type.fieldsSchema).map((field) => (
                      <Badge key={field} variant="secondary" className="text-xs">
                        {field}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredTypes.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">
              {types.length === 0 ? 'No machine types defined' : 'No types match your search'}
            </p>
            {types.length === 0 && (
              <Button onClick={() => setShowDialog(true)}>
                <Plus className="h-4 w-4" />
                Add First Type
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <MachineTypeDialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open)
          if (!open) setEditingType(null)
        }}
        editingType={editingType}
        onSave={handleTypeSaved}
      />
    </div>
  )
}

interface MachineTypeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingType: MachineType | null
  onSave: (type: MachineType) => void
}

function MachineTypeDialog({ open, onOpenChange, editingType, onSave }: MachineTypeDialogProps) {
  const isEditing = !!editingType
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    category: 'robot' as MachineCategory,
    icon: '',
  })

  useEffect(() => {
    if (editingType) {
      setFormData({
        name: editingType.name,
        category: editingType.category,
        icon: editingType.icon || '',
      })
    } else {
      setFormData({
        name: '',
        category: 'robot',
        icon: '',
      })
    }
    setError('')
  }, [editingType, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.name.trim()) {
      setError('Name is required')
      return
    }

    setLoading(true)

    try {
      const payload = {
        name: formData.name.trim(),
        category: formData.category,
        icon: formData.icon.trim() || undefined,
      }

      let type: MachineType
      if (isEditing) {
        const { data } = await api.patch<MachineType>(`/machine-types/${editingType.id}`, payload)
        type = data
      } else {
        const { data } = await api.post<MachineType>('/machine-types', payload)
        type = data
      }

      onSave(type)
      onOpenChange(false)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || `Failed to ${isEditing ? 'update' : 'create'} type`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">
            {isEditing ? 'Edit' : 'Add'} Machine Type
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            {isEditing ? 'Update the' : 'Create a new'} machine type
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Robot Arm"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value as MachineCategory })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="robot">Robot</SelectItem>
                  <SelectItem value="printer">Printer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="icon">Icon (optional)</Label>
              <Input
                id="icon"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                placeholder="Icon name or URL"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Add Type'}
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
