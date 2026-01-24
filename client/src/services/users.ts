import api from './api'
import type { User, UserRole } from '@/types'

export interface CreateUserData {
  name: string
  email: string
  role: UserRole
  password: string
}

export interface UpdateUserData {
  name?: string
  email?: string
  role?: UserRole
  password?: string
}

export const userService = {
  async getAll(): Promise<User[]> {
    const { data } = await api.get<User[]>('/users')
    return data
  },

  async create(userData: CreateUserData): Promise<User> {
    const { data } = await api.post<User>('/users', userData)
    return data
  },

  async update(id: string, updates: UpdateUserData): Promise<User> {
    const { data } = await api.patch<User>(`/users/${id}`, updates)
    return data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/users/${id}`)
  },
}
