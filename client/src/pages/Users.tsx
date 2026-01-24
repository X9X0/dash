import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { X, Loader2, Pencil, Trash2, Search, Shield, User as UserIcon, Eye } from 'lucide-react'
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
import { userService, UpdateUserData } from '@/services/users'
import type { User, UserRole } from '@/types'

const roleConfig: Record<UserRole, { label: string; variant: 'default' | 'secondary' | 'outline'; icon: React.ReactNode }> = {
  admin: { label: 'Admin', variant: 'default', icon: <Shield className="h-3 w-3" /> },
  operator: { label: 'Operator', variant: 'secondary', icon: <UserIcon className="h-3 w-3" /> },
  viewer: { label: 'Viewer', variant: 'outline', icon: <Eye className="h-3 w-3" /> },
}

export function Users() {
  const { user: currentUser } = useAuthStore()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [deletingUser, setDeletingUser] = useState<User | null>(null)

  // Only admins can access this page
  if (currentUser?.role !== 'admin') {
    return <Navigate to="/" />
  }

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await userService.getAll()
        setUsers(data)
      } catch (error) {
        console.error('Failed to fetch users:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchUsers()
  }, [])

  const filteredUsers = users.filter((user) => {
    const query = searchQuery.toLowerCase()
    return (
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.role.toLowerCase().includes(query)
    )
  })

  const handleUserUpdated = (updatedUser: User) => {
    setUsers(users.map((u) => (u.id === updatedUser.id ? updatedUser : u)))
    setEditingUser(null)
  }

  const handleUserDeleted = (userId: string) => {
    setUsers(users.filter((u) => u.id !== userId))
    setDeletingUser(null)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
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
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage user accounts and roles</p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search users by name, email, or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-4 font-medium">Name</th>
                  <th className="text-left p-4 font-medium">Email</th>
                  <th className="text-left p-4 font-medium">Role</th>
                  <th className="text-left p-4 font-medium">Joined</th>
                  <th className="text-right p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-4">
                      <div className="font-medium">{user.name}</div>
                    </td>
                    <td className="p-4 text-muted-foreground">{user.email}</td>
                    <td className="p-4">
                      <Badge variant={roleConfig[user.role].variant} className="gap-1">
                        {roleConfig[user.role].icon}
                        {roleConfig[user.role].label}
                      </Badge>
                    </td>
                    <td className="p-4 text-muted-foreground">{formatDate(user.createdAt)}</td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditingUser(user)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingUser(user)}
                          disabled={user.id === currentUser?.id}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">
                {users.length === 0 ? 'No users found' : 'No users match your search'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      {editingUser && (
        <EditUserDialog
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={handleUserUpdated}
          isCurrentUser={editingUser.id === currentUser?.id}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deletingUser && (
        <DeleteUserDialog
          user={deletingUser}
          onClose={() => setDeletingUser(null)}
          onDelete={handleUserDeleted}
        />
      )}
    </div>
  )
}

interface EditUserDialogProps {
  user: User
  onClose: () => void
  onSave: (user: User) => void
  isCurrentUser: boolean
}

function EditUserDialog({ user, onClose, onSave, isCurrentUser }: EditUserDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    role: user.role as UserRole,
    password: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const updates: UpdateUserData = {}
      if (formData.name !== user.name) updates.name = formData.name
      if (formData.email !== user.email) updates.email = formData.email
      if (formData.role !== user.role) updates.role = formData.role
      if (formData.password) updates.password = formData.password

      if (Object.keys(updates).length === 0) {
        onClose()
        return
      }

      const updatedUser = await userService.update(user.id, updates)
      onSave(updatedUser)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Failed to update user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">Edit User</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            Update user information and role.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as UserRole })}
                disabled={isCurrentUser}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              {isCurrentUser && (
                <p className="text-xs text-muted-foreground">You cannot change your own role</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">New Password (optional)</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Leave blank to keep current"
                minLength={6}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
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

interface DeleteUserDialogProps {
  user: User
  onClose: () => void
  onDelete: (userId: string) => void
}

function DeleteUserDialog({ user, onClose, onDelete }: DeleteUserDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    setError('')
    setLoading(true)

    try {
      await userService.delete(user.id)
      onDelete(user.id)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Failed to delete user')
      setLoading(false)
    }
  }

  return (
    <AlertDialog.Root open onOpenChange={(open: boolean) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
          <AlertDialog.Title className="text-lg font-semibold">Delete User</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-muted-foreground mt-2">
            Are you sure you want to delete <strong>{user.name}</strong> ({user.email})?
            This action cannot be undone.
          </AlertDialog.Description>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mt-4">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete User
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
