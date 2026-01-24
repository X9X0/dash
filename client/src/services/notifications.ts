import api from './api'
import type { Notification } from '@/types'

export const notificationService = {
  async getAll(unreadOnly = false): Promise<Notification[]> {
    const params = new URLSearchParams()
    if (unreadOnly) params.set('unread', 'true')
    const { data } = await api.get<Notification[]>(`/notifications?${params}`)
    return data
  },

  async getUnreadCount(): Promise<number> {
    const { data } = await api.get<{ count: number }>('/notifications/unread-count')
    return data.count
  },

  async markAsRead(id: string): Promise<Notification> {
    const { data } = await api.patch<Notification>(`/notifications/${id}/read`)
    return data
  },

  async markAllAsRead(): Promise<void> {
    await api.patch('/notifications/mark-all-read')
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/notifications/${id}`)
  },
}
