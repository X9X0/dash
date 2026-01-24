import { useEffect, useState } from 'react'
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Loader2,
  AlertTriangle,
  Wrench,
  Calendar,
  Info,
} from 'lucide-react'
import { Button, Card, CardContent, Badge } from '@/components/common'
import { notificationService } from '@/services/notifications'
import { useNotificationStore } from '@/store/notificationStore'
import type { Notification } from '@/types'

const notificationIcons: Record<string, React.ReactNode> = {
  maintenance: <Wrench className="h-5 w-5 text-yellow-500" />,
  alert: <AlertTriangle className="h-5 w-5 text-red-500" />,
  reservation: <Calendar className="h-5 w-5 text-blue-500" />,
  info: <Info className="h-5 w-5 text-muted-foreground" />,
}

export function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const { setNotifications: setStoreNotifications, markAsRead: storeMarkAsRead, markAllAsRead: storeMarkAllAsRead } = useNotificationStore()

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const data = await notificationService.getAll()
        setNotifications(data)
        setStoreNotifications(data)
      } catch (error) {
        console.error('Failed to fetch notifications:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchNotifications()
  }, [setStoreNotifications])

  const handleMarkAsRead = async (id: string) => {
    setActionLoading(id)
    try {
      const updated = await notificationService.markAsRead(id)
      setNotifications(notifications.map((n) => (n.id === id ? updated : n)))
      storeMarkAsRead(id)
    } catch (error) {
      console.error('Failed to mark as read:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleMarkAllAsRead = async () => {
    setActionLoading('all')
    try {
      await notificationService.markAllAsRead()
      setNotifications(notifications.map((n) => ({ ...n, read: true })))
      storeMarkAllAsRead()
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (id: string) => {
    setActionLoading(id)
    try {
      await notificationService.delete(id)
      const updatedNotifications = notifications.filter((n) => n.id !== id)
      setNotifications(updatedNotifications)
      // Update store to recalculate unread count
      setStoreNotifications(updatedNotifications)
    } catch (error) {
      console.error('Failed to delete notification:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const unreadNotifications = notifications.filter((n) => !n.read)
  const readNotifications = notifications.filter((n) => n.read)

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
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">
            {unreadNotifications.length > 0
              ? `${unreadNotifications.length} unread notification${unreadNotifications.length > 1 ? 's' : ''}`
              : 'All caught up!'}
          </p>
        </div>
        {unreadNotifications.length > 0 && (
          <Button
            variant="outline"
            onClick={handleMarkAllAsRead}
            disabled={actionLoading === 'all'}
          >
            {actionLoading === 'all' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            Mark all as read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No notifications yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {unreadNotifications.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">Unread</h2>
              <div className="space-y-2">
                {unreadNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={handleMarkAsRead}
                    onDelete={handleDelete}
                    isLoading={actionLoading === notification.id}
                  />
                ))}
              </div>
            </div>
          )}

          {readNotifications.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">Earlier</h2>
              <div className="space-y-2">
                {readNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={handleMarkAsRead}
                    onDelete={handleDelete}
                    isLoading={actionLoading === notification.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface NotificationItemProps {
  notification: Notification
  onMarkAsRead: (id: string) => void
  onDelete: (id: string) => void
  isLoading: boolean
}

function NotificationItem({ notification, onMarkAsRead, onDelete, isLoading }: NotificationItemProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })
  }

  return (
    <Card className={notification.read ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div className="flex-shrink-0 mt-1">
            {notificationIcons[notification.type] || notificationIcons.info}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{notification.title}</h3>
                  {!notification.read && (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">
                      New
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {formatDate(notification.createdAt)}
                </p>
              </div>
              <div className="flex gap-1">
                {!notification.read && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onMarkAsRead(notification.id)}
                    disabled={isLoading}
                    title="Mark as read"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(notification.id)}
                  disabled={isLoading}
                  className="text-destructive hover:text-destructive"
                  title="Delete"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
