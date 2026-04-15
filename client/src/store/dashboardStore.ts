import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DashboardState {
  machineLimit: number // 0 means show all
  setMachineLimit: (limit: number) => void
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      machineLimit: 9,
      setMachineLimit: (machineLimit) => set({ machineLimit }),
    }),
    {
      name: 'dashboard-storage',
    }
  )
)
