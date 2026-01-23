import api from './api'
import type { Machine, MachineType, MachineStatus, HourEntry } from '@/types'

export const machineService = {
  async getAll(): Promise<Machine[]> {
    const { data } = await api.get<Machine[]>('/machines')
    return data
  },

  async getById(id: string): Promise<Machine> {
    const { data } = await api.get<Machine>(`/machines/${id}`)
    return data
  },

  async create(machine: Partial<Machine>): Promise<Machine> {
    const { data } = await api.post<Machine>('/machines', machine)
    return data
  },

  async update(id: string, updates: Partial<Machine>): Promise<Machine> {
    const { data } = await api.patch<Machine>(`/machines/${id}`, updates)
    return data
  },

  async updateStatus(id: string, status: MachineStatus): Promise<Machine> {
    const { data } = await api.patch<Machine>(`/machines/${id}/status`, { status })
    return data
  },

  async addHours(id: string, entry: Partial<HourEntry>): Promise<HourEntry> {
    const { data } = await api.post<HourEntry>(`/machines/${id}/hours`, entry)
    return data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/machines/${id}`)
  },

  async getTypes(): Promise<MachineType[]> {
    const { data } = await api.get<MachineType[]>('/machine-types')
    return data
  },
}
