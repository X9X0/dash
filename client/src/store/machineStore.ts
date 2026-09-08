import { create } from 'zustand'
import type { Machine, MachineType } from '@/types'

interface MachineState {
  machines: Machine[]
  machineTypes: MachineType[]
  isLoading: boolean
  setMachines: (machines: Machine[]) => void
  setMachineTypes: (types: MachineType[]) => void
  addMachine: (machine: Machine) => void
  updateMachine: (id: string, updates: Partial<Machine>) => void
  setLoading: (loading: boolean) => void
  updateMachineStatus: (id: string, status: Machine['status']) => void
}

export const useMachineStore = create<MachineState>((set) => ({
  machines: [],
  machineTypes: [],
  isLoading: false,
  setMachines: (machines) => set({ machines }),
  setMachineTypes: (machineTypes) => set({ machineTypes }),
  addMachine: (machine) => set((state) => ({ machines: [...state.machines, machine] })),
  updateMachine: (id, updates) =>
    set((state) => ({
      machines: state.machines.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  setLoading: (isLoading) => set({ isLoading }),
  updateMachineStatus: (id, status) =>
    set((state) => ({
      machines: state.machines.map((m) => (m.id === id ? { ...m, status } : m)),
    })),
}))
