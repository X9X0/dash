import api from './api'
import type {
  BamBuddyPrinterStatus,
  BamBuddyQueueItem,
  BamBuddyPrintLogResponse,
  BamBuddyConfig,
} from '@/types/bambuddy'

export const bambuddyService = {
  async getConfig(): Promise<BamBuddyConfig> {
    try {
      const { data } = await api.get<BamBuddyConfig>('/bambuddy/config')
      return data
    } catch {
      return { available: false, publicUrl: '' }
    }
  },

  async getAllStatuses(): Promise<BamBuddyPrinterStatus[]> {
    try {
      const { data } = await api.get<BamBuddyPrinterStatus[]>('/bambuddy/status/all')
      return data
    } catch {
      return []
    }
  },

  async getAllStatusesPublic(): Promise<BamBuddyPrinterStatus[]> {
    try {
      const { data } = await api.get<BamBuddyPrinterStatus[]>('/bambuddy/status/all/public')
      return data
    } catch {
      return []
    }
  },

  async getStatus(machineId: string): Promise<BamBuddyPrinterStatus | null> {
    try {
      const { data } = await api.get<BamBuddyPrinterStatus>(`/bambuddy/status/${machineId}`)
      if (data.error) return null
      return data
    } catch {
      return null
    }
  },

  async controlPrint(machineId: string, action: 'stop' | 'pause' | 'resume'): Promise<void> {
    await api.post(`/bambuddy/control/${machineId}/${action}`)
  },

  async getQueue(): Promise<BamBuddyQueueItem[]> {
    try {
      const { data } = await api.get<BamBuddyQueueItem[]>('/bambuddy/queue')
      return data
    } catch {
      return []
    }
  },

  async getPrintLog(machineId: string, limit = 10): Promise<BamBuddyPrintLogResponse> {
    try {
      const { data } = await api.get<BamBuddyPrintLogResponse>(
        `/bambuddy/print-log/${machineId}`,
        { params: { limit } }
      )
      return data
    } catch {
      return { items: [], total: 0 }
    }
  },

  getCameraStreamUrl(machineId: string): string {
    return `/api/bambuddy/camera/${machineId}/stream`
  },

  getCameraSnapshotUrl(machineId: string): string {
    return `/api/bambuddy/camera/${machineId}/snapshot`
  },

  getPrintLogThumbnailUrl(machineId: string, entryId: number): string {
    return `/api/bambuddy/print-log/${machineId}/thumbnail/${entryId}`
  },
}
