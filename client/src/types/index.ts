export type UserRole = 'admin' | 'operator' | 'viewer'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  createdAt: string
}

export type MachineStatus = 'available' | 'in_use' | 'maintenance' | 'offline' | 'error' | 'damaged_but_usable'
export type MachineCategory = 'robot' | 'printer'

export interface MachineType {
  id: string
  name: string
  category: MachineCategory
  icon: string
  fieldsSchema: Record<string, FieldSchema>
}

export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'select'
  label: string
  options?: string[]
  required?: boolean
}

export interface MachineIP {
  id: string
  machineId: string
  label: string
  ipAddress: string
}

export interface MachineCustomField {
  id: string
  machineId: string
  fieldName: string
  fieldValue: string
}

export interface Machine {
  id: string
  name: string
  typeId: string
  type?: MachineType
  model: string
  location: string
  status: MachineStatus
  hourMeter: number
  buildDate: string | null
  icon: string | null
  notes: string | null
  statusNote: string | null
  autoHourTracking: boolean
  lastPingAt: string | null
  claimedById: string | null
  claimedBy?: { id: string; name: string } | null
  claimedAt: string | null
  claimExpiresAt: string | null
  createdAt: string
  ips?: MachineIP[]
  customFields?: MachineCustomField[]
}

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'

export interface Reservation {
  id: string
  machineId: string
  machine?: Machine
  userId: string
  user?: User
  startTime: string
  endTime: string
  purpose: string
  status: ReservationStatus
  createdAt: string
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Job {
  id: string
  machineId: string
  machine?: Machine
  userId: string
  user?: User
  name: string
  startTime: string | null
  endTime: string | null
  status: JobStatus
  notes: string | null
}

export interface ActivityLog {
  id: string
  machineId: string
  machine?: Machine
  userId: string
  user?: User
  action: string
  details: string | null
  timestamp: string
}

export type MaintenancePriority = 'low' | 'medium' | 'high' | 'critical'
export type MaintenanceType = 'damage' | 'repair' | 'upgrade' | 'checkout'
export type MaintenanceStatus = 'submitted' | 'in_progress' | 'resolved'

export interface MaintenanceRequest {
  id: string
  machineId: string
  machine?: Machine
  userId: string
  user?: User
  type: MaintenanceType
  priority: MaintenancePriority
  description: string
  status: MaintenanceStatus
  photos?: string[]
  createdAt: string
  resolvedAt: string | null
}

export type ServiceType = 'repair' | 'upgrade' | 'modification' | 'calibration'

export interface ServiceRecord {
  id: string
  machineId: string
  machine?: Machine
  userId: string
  user?: User
  type: ServiceType
  description: string
  partsUsed: string | null
  cost: number | null
  performedBy: string
  performedAt: string
  notes: string | null
  photos: string[]
}

export interface HourEntry {
  id: string
  machineId: string
  machine?: Machine
  userId: string
  user?: User
  hours: number
  date: string
  notes: string | null
}

export interface MachineStatusLog {
  id: string
  machineId: string
  status: string
  source: string
  timestamp: string
}

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
}

export interface MachineAttachment {
  id: string
  machineId: string
  userId: string
  user?: { id: string; name: string }
  filename: string
  originalName: string
  fileType: string
  description: string | null
  createdAt: string
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  password: string
  name: string
}
