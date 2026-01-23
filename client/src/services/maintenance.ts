import api from './api'
import type { MaintenanceRequest, ServiceRecord } from '@/types'

export const maintenanceService = {
  async getAll(params?: { machineId?: string; status?: string }): Promise<MaintenanceRequest[]> {
    const { data } = await api.get<MaintenanceRequest[]>('/maintenance', { params })
    return data
  },

  async getById(id: string): Promise<MaintenanceRequest> {
    const { data } = await api.get<MaintenanceRequest>(`/maintenance/${id}`)
    return data
  },

  async create(request: Partial<MaintenanceRequest>): Promise<MaintenanceRequest> {
    const { data } = await api.post<MaintenanceRequest>('/maintenance', request)
    return data
  },

  async update(id: string, updates: Partial<MaintenanceRequest>): Promise<MaintenanceRequest> {
    const { data } = await api.patch<MaintenanceRequest>(`/maintenance/${id}`, updates)
    return data
  },
}

export const serviceRecordService = {
  async getAll(params?: { machineId?: string; type?: string }): Promise<ServiceRecord[]> {
    const { data } = await api.get<ServiceRecord[]>('/service-records', { params })
    return data
  },

  async getByMachine(machineId: string): Promise<ServiceRecord[]> {
    const { data } = await api.get<ServiceRecord[]>(`/machines/${machineId}/service-history`)
    return data
  },

  async create(machineId: string, record: Partial<ServiceRecord>): Promise<ServiceRecord> {
    const { data } = await api.post<ServiceRecord>(`/machines/${machineId}/service-history`, record)
    return data
  },

  async update(id: string, updates: Partial<ServiceRecord>): Promise<ServiceRecord> {
    const { data } = await api.patch<ServiceRecord>(`/service-records/${id}`, updates)
    return data
  },
}
