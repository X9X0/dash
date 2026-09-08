import api from './api'
import type { Reservation } from '@/types'

export const reservationService = {
  async getAll(params?: { machineId?: string; startDate?: string; endDate?: string }): Promise<Reservation[]> {
    const { data } = await api.get<Reservation[]>('/reservations', { params })
    return data
  },

  async create(reservation: Partial<Reservation>): Promise<Reservation> {
    const { data } = await api.post<Reservation>('/reservations', reservation)
    return data
  },
}
