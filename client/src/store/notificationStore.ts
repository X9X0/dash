import { create } from 'zustand'
import type { Notification } from '@/types'

// `notifications` holds the list loaded by the Notifications page (empty until
// it is visited); `unreadCount` is initialised from the server when the app
// mounts, so the two are maintained independently rather than one being
// derived from the other.
interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  setNotifications: (notifications: Notification[]) => void
  setUnreadCount: (count: number) => void
  addNotification: (notification: Notification) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  removeNotification: (id: string) => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    }),
  setUnreadCount: (unreadCount) => set({ unreadCount: Math.max(0, unreadCount) }),
  addNotification: (notification) =>
    set((state) => {
      const existing = state.notifications.find((n) => n.id === notification.id)
      if (existing) {
        // Re-delivered row (e.g. after a reconnect): replace it and reconcile the count.
        const delta = (existing.read ? 0 : -1) + (notification.read ? 0 : 1)
        return {
          notifications: state.notifications.map((n) => (n.id === notification.id ? notification : n)),
          unreadCount: Math.max(0, state.unreadCount + delta),
        }
      }
      return {
        notifications: [notification, ...state.notifications],
        unreadCount: state.unreadCount + (notification.read ? 0 : 1),
      }
    }),
  markAsRead: (id) =>
    set((state) => {
      const target = state.notifications.find((n) => n.id === id)
      // Only decrement if it was actually unread (or unknown to the list).
      const wasUnread = !target || !target.read
      return {
        notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      }
    }),
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
  removeNotification: (id) =>
    set((state) => {
      const target = state.notifications.find((n) => n.id === id)
      const wasUnread = !!target && !target.read
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      }
    }),
}))
