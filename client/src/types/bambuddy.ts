export interface BamBuddyPrinterStatus {
  dashMachineId: string
  printerName: string
  state: string // RUNNING, IDLE, PAUSE, FINISH, FAILED, PREPARE, SLICING, etc.
  progress: number // 0-100
  remaining_time: number // minutes
  current_print: string | null
  layer_num: number | null
  total_layers: number | null
  temperatures: {
    bed: number
    bed_target: number
    nozzle: number
    nozzle_target: number
  } | null
  connected: boolean
  error?: boolean
}

export interface BamBuddyQueueItem {
  id: number
  status: string // pending, printing, completed, failed, skipped, cancelled
  position: number
  archive_name: string | null
  library_file_name: string | null
  print_time_seconds: number | null
  filament_used_grams: number | null
  filament_type: string | null
  filament_color: string | null
  archive_thumbnail: string | null
  printer_name: string | null
  dashMachineId: string | null
}

export interface BamBuddyPrintLogEntry {
  id: number
  print_name: string | null
  printer_name: string | null
  printer_id: number | null
  status: string
  started_at: string | null
  completed_at: string | null
  duration_seconds: number | null
  filament_type: string | null
  filament_color: string | null
  filament_used_grams: number | null
  thumbnail_path: string | null
  created_by_username: string | null
  created_at: string
}

export interface BamBuddyPrintLogResponse {
  items: BamBuddyPrintLogEntry[]
  total: number
}

export interface BamBuddyConfig {
  available: boolean
  publicUrl: string
}
