import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  parseISO,
} from 'date-fns'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common'
import { reservationService } from '@/services/reservations'
import { machineService } from '@/services/machines'
import { useAuthStore } from '@/store/authStore'
import { AddReservationDialog } from '@/components/calendar/AddReservationDialog'
import type { Reservation, Machine } from '@/types'

export function Calendar() {
  const { user } = useAuthStore()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [machineFilter, setMachineFilter] = useState<string>('all')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [reservationsData, machinesData] = await Promise.all([
          reservationService.getAll(),
          machineService.getAll(),
        ])
        setReservations(reservationsData)
        setMachines(machinesData)
      } catch (error) {
        console.error('Failed to fetch calendar data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const filteredReservations = reservations.filter(
    (r) => machineFilter === 'all' || r.machineId === machineFilter
  )

  const getReservationsForDay = (day: Date) => {
    return filteredReservations.filter((r) =>
      isSameDay(parseISO(r.startTime), day)
    )
  }

  const renderHeader = () => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold min-w-[180px] text-center">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Select value={machineFilter} onValueChange={setMachineFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by machine" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Machines</SelectItem>
            {machines.map((machine) => (
              <SelectItem key={machine.id} value={machine.id}>
                {machine.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(user?.role === 'admin' || user?.role === 'operator') && (
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" />
            Reserve
          </Button>
        )}
      </div>
    </div>
  )

  const renderDays = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return (
      <div className="grid grid-cols-7 mb-2">
        {days.map((day) => (
          <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
            {day}
          </div>
        ))}
      </div>
    )
  }

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(monthStart)
    const startDate = startOfWeek(monthStart)
    const endDate = endOfWeek(monthEnd)

    const rows = []
    let days = []
    let day = startDate

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const dayReservations = getReservationsForDay(day)
        const isCurrentMonth = isSameMonth(day, monthStart)
        const isSelected = selectedDate && isSameDay(day, selectedDate)
        const isToday = isSameDay(day, new Date())
        const currentDay = day

        days.push(
          <div
            key={day.toString()}
            onClick={() => setSelectedDate(currentDay)}
            className={`min-h-[100px] border-r border-b p-1 cursor-pointer transition-colors ${
              !isCurrentMonth ? 'bg-muted/30 text-muted-foreground' : ''
            } ${isSelected ? 'bg-primary/10' : 'hover:bg-accent'}`}
          >
            <div className={`text-sm font-medium mb-1 ${
              isToday ? 'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center' : ''
            }`}>
              {format(day, 'd')}
            </div>
            <div className="space-y-1">
              {dayReservations.slice(0, 3).map((reservation) => (
                <div
                  key={reservation.id}
                  className="text-xs bg-primary/20 text-primary rounded px-1 py-0.5 truncate"
                  title={`${reservation.machine?.name} - ${reservation.purpose}`}
                >
                  {format(parseISO(reservation.startTime), 'h:mm a')} {reservation.machine?.name}
                </div>
              ))}
              {dayReservations.length > 3 && (
                <div className="text-xs text-muted-foreground">
                  +{dayReservations.length - 3} more
                </div>
              )}
            </div>
          </div>
        )
        day = addDays(day, 1)
      }
      rows.push(
        <div key={day.toString()} className="grid grid-cols-7">
          {days}
        </div>
      )
      days = []
    }

    return <div className="border-l border-t">{rows}</div>
  }

  const selectedDayReservations = selectedDate ? getReservationsForDay(selectedDate) : []

  const handleReservationCreated = (reservation: Reservation) => {
    setReservations([...reservations, reservation])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-muted-foreground">Schedule and manage reservations</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardContent className="p-4">
            {renderHeader()}
            {renderDays()}
            {renderCells()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {selectedDate
                ? format(selectedDate, 'MMMM d, yyyy')
                : 'Select a date'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDate ? (
              selectedDayReservations.length > 0 ? (
                <div className="space-y-3">
                  {selectedDayReservations.map((reservation) => (
                    <div
                      key={reservation.id}
                      className="rounded-lg border p-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{reservation.machine?.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(parseISO(reservation.startTime), 'h:mm a')} -{' '}
                            {format(parseISO(reservation.endTime), 'h:mm a')}
                          </p>
                        </div>
                        <Badge variant={
                          reservation.status === 'confirmed' ? 'success' :
                          reservation.status === 'cancelled' ? 'destructive' : 'secondary'
                        }>
                          {reservation.status}
                        </Badge>
                      </div>
                      <p className="text-sm mt-2">{reservation.purpose}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        By {reservation.user?.name}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No reservations for this day
                </p>
              )
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Click on a day to see its reservations
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <AddReservationDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        machines={machines}
        selectedDate={selectedDate}
        onReservationCreated={handleReservationCreated}
      />
    </div>
  )
}
