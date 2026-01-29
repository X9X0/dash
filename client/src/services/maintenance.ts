import api from './api'
import type { MaintenanceRequest, MaintenanceUpdate, ServiceRecord } from '@/types'

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

  async getUpdates(id: string): Promise<MaintenanceUpdate[]> {
    const { data } = await api.get<MaintenanceUpdate[]>(`/maintenance/${id}/updates`)
    return data
  },

  async addUpdate(id: string, content: string, photos?: File[]): Promise<MaintenanceUpdate> {
    if (photos && photos.length > 0) {
      const formData = new FormData()
      formData.append('content', content)
      photos.forEach((photo) => formData.append('photos', photo))
      const { data } = await api.post<MaintenanceUpdate>(`/maintenance/${id}/updates`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    }
    const { data } = await api.post<MaintenanceUpdate>(`/maintenance/${id}/updates`, { content })
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
