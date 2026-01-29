import { useEffect, useState } from 'react'
import { Plus, Search, Filter } from 'lucide-react'
import { Button, Card, CardContent, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common'
import { useMachineStore } from '@/store/machineStore'
import { useAuthStore } from '@/store/authStore'
import { machineService } from '@/services/machines'
import { MachineCard } from '@/components/machines/MachineCard'
import { AddMachineDialog } from '@/components/machines/AddMachineDialog'
import api from '@/services/api'

interface PingStatus {
  machineId: string
  reachable: boolean | null
  resolvedIP: string | null
  resolvedHostname: string | null
}

export function Machines() {
  const { machines, setMachines, machineTypes, setMachineTypes, setLoading } = useMachineStore()
  const { user } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [conditionFilter, setConditionFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [pingStatus, setPingStatus] = useState<Record<string, PingStatus>>({})

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [machinesData, typesData] = await Promise.all([
          machineService.getAll(),
          machineService.getTypes(),
        ])
        setMachines(machinesData)
        setMachineTypes(typesData)

        // Fetch ping status for all machines
        try {
          const { data: pingResults } = await api.get<PingStatus[]>('/machines/ping/all')
          const statusMap: Record<string, PingStatus> = {}
          pingResults.forEach((result) => {
            statusMap[result.machineId] = result
          })
          setPingStatus(statusMap)
        } catch (pingError) {
          console.error('Failed to ping machines:', pingError)
        }
      } catch (error) {
        console.error('Failed to fetch machines:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()

    // Refresh ping status every 30 seconds
    const pingInterval = setInterval(async () => {
      try {
        const { data: pingResults } = await api.get<PingStatus[]>('/machines/ping/all')
        const statusMap: Record<string, PingStatus> = {}
        pingResults.forEach((result) => {
          statusMap[result.machineId] = result
        })
        setPingStatus(statusMap)
      } catch (error) {
        console.error('Ping refresh failed:', error)
      }
    }, 30000)

    return () => clearInterval(pingInterval)
  }, [setMachines, setMachineTypes, setLoading])

  // Define category order for sorting
  const categoryOrder: Record<string, number> = {
    'Biped Humanoid': 1,
    'Wheeled Humanoid': 2,
    'Robot Arm': 3,
    'Testbench': 4,
    'FDM Printer': 5,
    'SLA/Resin Printer': 6,
    'SLS Printer': 7,
  }

  const filteredMachines = machines
    .filter((machine) => {
      const matchesSearch =
        machine.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        machine.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        machine.model.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'all' || machine.status === statusFilter
      const matchesCondition = conditionFilter === 'all' || machine.condition === conditionFilter
      const matchesType = typeFilter === 'all' || machine.typeId === typeFilter
      return matchesSearch && matchesStatus && matchesCondition && matchesType
    })
    .sort((a, b) => {
      const orderA = categoryOrder[a.type?.name || ''] ?? 99
      const orderB = categoryOrder[b.type?.name || ''] ?? 99
      if (orderA !== orderB) return orderA - orderB
      return a.name.localeCompare(b.name)
    })

  const statusOptions: { value: string; label: string }[] = [
    { value: 'all', label: 'All Status' },
    { value: 'available', label: 'Available' },
    { value: 'in_use', label: 'In Use' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'offline', label: 'Offline' },
  ]

  const conditionOptions: { value: string; label: string }[] = [
    { value: 'all', label: 'All Condition' },
    { value: 'functional', label: 'Functional' },
    { value: 'degraded', label: 'Degraded' },
    { value: 'broken', label: 'Broken' },
  ]

  const handleClaimChange = (updated: typeof machines[0]) => {
    setMachines(machines.map((m) => (m.id === updated.id ? updated : m)))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Machines</h1>
          <p className="text-muted-foreground">
            Manage your robots and 3D printers
          </p>
        </div>
        {user?.role === 'admin' && (
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" />
            Add Machine
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search machines..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={conditionFilter} onValueChange={setConditionFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Filter by condition" />
              </SelectTrigger>
              <SelectContent>
                {conditionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {[...machineTypes]
                  .sort((a, b) => (categoryOrder[a.name] ?? 99) - (categoryOrder[b.name] ?? 99))
                  .map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Machine Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredMachines.map((machine) => (
          <MachineCard key={machine.id} machine={machine} pingStatus={pingStatus[machine.id]} onClaimChange={handleClaimChange} />
        ))}
      </div>

      {filteredMachines.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">
              {machines.length === 0
                ? 'No machines added yet'
                : 'No machines match your filters'}
            </p>
            {user?.role === 'admin' && machines.length === 0 && (
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4" />
                Add your first machine
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <AddMachineDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        machineTypes={machineTypes}
      />
    </div>
  )
}
