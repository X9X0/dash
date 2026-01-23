import api from './api'
import type { User, LoginCredentials, RegisterData } from '@/types'

interface AuthResponse {
  user: User
  token: string
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/login', credentials)
    return data
  },

  async register(userData: RegisterData): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/register', userData)
    return data
  },

  async me(): Promise<User> {
    const { data } = await api.get<User>('/users/me')
    return data
  },
}
