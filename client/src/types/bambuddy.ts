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
  scheduled_time: string | null
  started_at: string | null
  completed_at: string | null
  created_by_username: string | null
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

export interface BamBuddySyncResult {
  created: string[]
  updated: string[]
  offlined: string[]
}

export interface BamBuddyMaintenanceItem {
  id: number
  maintenance_type_name: string
  maintenance_type_icon: string | null
  enabled: boolean
  interval_hours: number
  interval_type: string
  hours_since_maintenance: number
  hours_until_due: number
  is_due: boolean
  is_warning: boolean
  last_performed_at: string | null
}

export interface BamBuddyMaintenanceOverview {
  printer_id: number
  printer_name: string
  total_print_hours: number
  maintenance_items: BamBuddyMaintenanceItem[]
  due_count: number
  warning_count: number
  dashMachineId?: string
}
