import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type KioskLayout = 'rows' | 'columns'

interface KioskState {
  layout: KioskLayout
  setLayout: (layout: KioskLayout) => void
}

export const useKioskStore = create<KioskState>()(
  persist(
    (set) => ({
      layout: 'rows',
      setLayout: (layout) => set({ layout }),
    }),
    {
      name: 'kiosk-storage',
    }
  )
)
