import { create } from 'zustand'
import type { Machine, MachineType } from '@/types'

interface MachineState {
  machines: Machine[]
  machineTypes: MachineType[]
  selectedMachine: Machine | null
  isLoading: boolean
  setMachines: (machines: Machine[]) => void
  setMachineTypes: (types: MachineType[]) => void
  addMachine: (machine: Machine) => void
  updateMachine: (id: string, updates: Partial<Machine>) => void
  removeMachine: (id: string) => void
  setSelectedMachine: (machine: Machine | null) => void
  setLoading: (loading: boolean) => void
  updateMachineStatus: (id: string, status: Machine['status']) => void
}

export const useMachineStore = create<MachineState>((set) => ({
  machines: [],
  machineTypes: [],
  selectedMachine: null,
  isLoading: false,
  setMachines: (machines) => set({ machines }),
  setMachineTypes: (machineTypes) => set({ machineTypes }),
  addMachine: (machine) => set((state) => ({ machines: [...state.machines, machine] })),
  updateMachine: (id, updates) =>
    set((state) => ({
      machines: state.machines.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  removeMachine: (id) =>
    set((state) => ({
      machines: state.machines.filter((m) => m.id !== id),
    })),
  setSelectedMachine: (selectedMachine) => set({ selectedMachine }),
  setLoading: (isLoading) => set({ isLoading }),
  updateMachineStatus: (id, status) =>
    set((state) => ({
      machines: state.machines.map((m) => (m.id === id ? { ...m, status } : m)),
    })),
}))
