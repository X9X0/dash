import api from './api'
import type { Machine, MachineType, MachineStatus, MachineCondition, HourEntry, ServiceRecord, MaintenanceRequest, MachineStatusLog, MachineAttachment } from '@/types'

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

  async updateStatus(id: string, status: MachineStatus, condition?: MachineCondition): Promise<Machine> {
    const { data } = await api.patch<Machine>(`/machines/${id}/status`, { status, condition })
    return data
  },

  async updateCondition(id: string, condition: MachineCondition, conditionNote?: string | null): Promise<Machine> {
    const { data } = await api.patch<Machine>(`/machines/${id}/condition`, { condition, conditionNote })
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

  async updateStatusNote(id: string, statusNote: string | null): Promise<Machine> {
    const { data } = await api.patch<Machine>(`/machines/${id}/status-note`, { statusNote })
    return data
  },

  async getTimeline(id: string): Promise<{ serviceRecords: ServiceRecord[]; maintenanceRequests: MaintenanceRequest[]; statusLogs: MachineStatusLog[] }> {
    const { data } = await api.get(`/machines/${id}/timeline`)
    return data
  },

  async claimMachine(id: string, duration?: number, userId?: string): Promise<Machine> {
    const { data } = await api.patch<Machine>(`/machines/${id}/claim`, { duration, userId })
    return data
  },

  async releaseMachine(id: string): Promise<Machine> {
    const { data } = await api.patch<Machine>(`/machines/${id}/release`, {})
    return data
  },

  async getAttachments(id: string): Promise<MachineAttachment[]> {
    const { data } = await api.get<MachineAttachment[]>(`/machines/${id}/attachments`)
    return data
  },

  async uploadAttachment(id: string, file: File, description?: string): Promise<MachineAttachment> {
    const formData = new FormData()
    formData.append('file', file)
    if (description) formData.append('description', description)
    const { data } = await api.post<MachineAttachment>(`/machines/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  async deleteAttachment(machineId: string, attachmentId: string): Promise<void> {
    await api.delete(`/machines/${machineId}/attachments/${attachmentId}`)
  },
}
