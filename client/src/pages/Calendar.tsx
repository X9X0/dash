import { useEffect, useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, Printer } from 'lucide-react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  addSeconds,
  isSameMonth,
  isSameDay,
  parseISO,
} from 'date-fns'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common'
import { reservationService } from '@/services/reservations'
import { machineService } from '@/services/machines'
import { bambuddyService } from '@/services/bambuddy'
import { useAuthStore } from '@/store/authStore'
import { AddReservationDialog } from '@/components/calendar/AddReservationDialog'
import type { Reservation, Machine } from '@/types'
import type { BamBuddyPrinterStatus, BamBuddyQueueItem } from '@/types/bambuddy'

interface PrintEvent {
  id: string
  machineName: string
  dashMachineId: string | null
  printName: string
  startTime: Date
  endTime: Date
  status: string
  createdBy: string | null
}

export function Calendar() {
  const { user } = useAuthStore()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [machineFilter, setMachineFilter] = useState<string>('all')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [, setLoading] = useState(true)
  const [bbStatuses, setBbStatuses] = useState<Record<string, BamBuddyPrinterStatus>>({})
  const [bbQueue, setBbQueue] = useState<BamBuddyQueueItem[]>([])

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

      // Fetch BamBuddy statuses and queue for printer availability / calendar
      try {
        const [statuses, queue] = await Promise.all([
          bambuddyService.getAllStatuses(),
          bambuddyService.getQueue(),
        ])
        const map: Record<string, BamBuddyPrinterStatus> = {}
        statuses.forEach((s) => {
          if (s.dashMachineId) map[s.dashMachineId] = s
        })
        setBbStatuses(map)
        setBbQueue(queue)
      } catch {}
    }
    fetchData()
  }, [])

  // Convert BamBuddy queue items into calendar-displayable print events
  const printEvents = useMemo<PrintEvent[]>(() => {
    return bbQueue
      .filter((item) => {
        // Only show items that have timing info
        if (item.status === 'cancelled' || item.status === 'skipped') return false
        return item.started_at || item.scheduled_time
      })
      .map((item) => {
        const duration = item.print_time_seconds || 3600 // default 1h if unknown
        let startTime: Date
        let endTime: Date

        if (item.started_at) {
          // Active or completed print — use actual start time
          startTime = parseISO(item.started_at)
          endTime = item.completed_at
            ? parseISO(item.completed_at)
            : addSeconds(startTime, duration)
        } else {
          // Scheduled print — use scheduled_time
          startTime = parseISO(item.scheduled_time!)
          endTime = addSeconds(startTime, duration)
        }

        return {
          id: `bb-${item.id}`,
          machineName: item.printer_name || 'Unassigned',
          dashMachineId: item.dashMachineId,
          printName: item.archive_name || item.library_file_name || 'Print job',
          startTime,
          endTime,
          status: item.status,
          createdBy: item.created_by_username,
        }
      })
  }, [bbQueue])

  const filteredReservations = reservations.filter(
    (r) => machineFilter === 'all' || r.machineId === machineFilter
  )

  const filteredPrintEvents = printEvents.filter(
    (e) => machineFilter === 'all' || e.dashMachineId === machineFilter
  )

  const getReservationsForDay = (day: Date) => {
    return filteredReservations.filter((r) =>
      isSameDay(parseISO(r.startTime), day)
    )
  }

  const getPrintEventsForDay = (day: Date) => {
    return filteredPrintEvents.filter((e) => isSameDay(e.startTime, day))
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
                {bbStatuses[machine.id]?.state === 'RUNNING' && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (printing, ~{Math.round(bbStatuses[machine.id].remaining_time)} min)
                  </span>
                )}
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
        const dayPrints = getPrintEventsForDay(day)
        const totalEvents = dayReservations.length + dayPrints.length
        const isCurrentMonth = isSameMonth(day, monthStart)
        const isSelected = selectedDate && isSameDay(day, selectedDate)
        const isToday = isSameDay(day, new Date())
        const currentDay = day

        // Merge and sort all events by start time, show up to 3
        const allEvents: { type: 'reservation' | 'print'; time: Date; label: string; key: string }[] = [
          ...dayReservations.map((r) => ({
            type: 'reservation' as const,
            time: parseISO(r.startTime),
            label: `${format(parseISO(r.startTime), 'h:mm a')} ${r.machine?.name}`,
            key: r.id,
          })),
          ...dayPrints.map((p) => ({
            type: 'print' as const,
            time: p.startTime,
            label: `${format(p.startTime, 'h:mm a')} ${p.machineName}`,
            key: p.id,
          })),
        ].sort((a, b) => a.time.getTime() - b.time.getTime())

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
              {allEvents.slice(0, 3).map((event) => (
                <div
                  key={event.key}
                  className={`text-xs rounded px-1 py-0.5 truncate ${
                    event.type === 'print'
                      ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400'
                      : 'bg-primary/20 text-primary'
                  }`}
                  title={event.label}
                >
                  {event.label}
                </div>
              ))}
              {totalEvents > 3 && (
                <div className="text-xs text-muted-foreground">
                  +{totalEvents - 3} more
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
  const selectedDayPrints = selectedDate ? getPrintEventsForDay(selectedDate) : []

  const handleReservationCreated = (reservation: Reservation) => {
    setReservations([...reservations, reservation])
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-muted-foreground">Schedule and manage reservations</p>
        </div>
        {printEvents.length > 0 && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-primary/20" />
              <span>Reservations</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-cyan-500/20" />
              <span>Print Jobs</span>
            </div>
          </div>
        )}
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
              (selectedDayReservations.length > 0 || selectedDayPrints.length > 0) ? (
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
                  {selectedDayPrints.length > 0 && selectedDayReservations.length > 0 && (
                    <div className="border-t pt-2" />
                  )}
                  {selectedDayPrints.map((printEvt) => (
                    <div
                      key={printEvt.id}
                      className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium flex items-center gap-1.5">
                            <Printer className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                            {printEvt.machineName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(printEvt.startTime, 'h:mm a')} -{' '}
                            {format(printEvt.endTime, 'h:mm a')}
                          </p>
                        </div>
                        <Badge variant={
                          printEvt.status === 'printing' ? 'default' :
                          printEvt.status === 'completed' ? 'success' :
                          printEvt.status === 'failed' ? 'destructive' : 'secondary'
                        }>
                          {printEvt.status}
                        </Badge>
                      </div>
                      <p className="text-sm mt-2 truncate" title={printEvt.printName}>{printEvt.printName}</p>
                      {printEvt.createdBy && (
                        <p className="text-xs text-muted-foreground mt-1">
                          By {printEvt.createdBy}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No events for this day
                </p>
              )
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Click on a day to see its events
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
        bbStatuses={bbStatuses}
      />
    </div>
  )
}
