import { useEffect, useState } from 'react'
import { Search, Download, Filter, Plus, Pencil, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button, Card, CardContent, Input, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common'
import { machineService } from '@/services/machines'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import { AddJobDialog } from '@/components/jobs/AddJobDialog'
import type { ActivityLog, Job, Machine, JobStatus } from '@/types'

const jobStatusBadgeVariants: Record<JobStatus, 'default' | 'secondary' | 'success' | 'destructive' | 'warning'> = {
  queued: 'secondary',
  running: 'default',
  completed: 'success',
  failed: 'destructive',
  cancelled: 'warning',
}

export function Logs() {
  const { user } = useAuthStore()
  const canEdit = user?.role === 'admin' || user?.role === 'operator'
  const [activeTab, setActiveTab] = useState<'jobs' | 'activity'>('jobs')
  const [jobs, setJobs] = useState<Job[]>([])
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [machineFilter, setMachineFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [, setLoading] = useState(true)
  const [showJobDialog, setShowJobDialog] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [jobsRes, activitiesRes, machinesData] = await Promise.all([
          api.get<Job[]>('/jobs'),
          api.get<ActivityLog[]>('/activity-logs'),
          machineService.getAll(),
        ])
        setJobs(jobsRes.data)
        setActivities(activitiesRes.data)
        setMachines(machinesData)
      } catch (error) {
        console.error('Failed to fetch logs:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.machine?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.user?.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesMachine = machineFilter === 'all' || job.machineId === machineFilter
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter
    return matchesSearch && matchesMachine && matchesStatus
  })

  const filteredActivities = activities.filter((activity) => {
    const matchesSearch =
      activity.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.machine?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.user?.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesMachine = machineFilter === 'all' || activity.machineId === machineFilter
    return matchesSearch && matchesMachine
  })

  const exportToCSV = () => {
    const data = activeTab === 'jobs' ? filteredJobs : filteredActivities
    const headers =
      activeTab === 'jobs'
        ? ['Name', 'Machine', 'User', 'Status', 'Start Time', 'End Time']
        : ['Action', 'Machine', 'User', 'Details', 'Timestamp']

    const rows = data.map((item) => {
      if (activeTab === 'jobs') {
        const job = item as Job
        return [
          job.name,
          job.machine?.name || '',
          job.user?.name || '',
          job.status,
          job.startTime ? format(parseISO(job.startTime), 'yyyy-MM-dd HH:mm:ss') : '',
          job.endTime ? format(parseISO(job.endTime), 'yyyy-MM-dd HH:mm:ss') : '',
        ]
      } else {
        const activity = item as ActivityLog
        return [
          activity.action,
          activity.machine?.name || '',
          activity.user?.name || '',
          activity.details || '',
          format(parseISO(activity.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        ]
      }
    })

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeTab}-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
  }

  const handleJobSaved = (job: Job) => {
    if (editingJob) {
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)))
    } else {
      setJobs((prev) => [job, ...prev])
    }
    setEditingJob(null)
  }

  const handleEditJob = (job: Job) => {
    setEditingJob(job)
    setShowJobDialog(true)
  }

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job?')) return
    try {
      await api.delete(`/jobs/${jobId}`)
      setJobs((prev) => prev.filter((j) => j.id !== jobId))
    } catch (error) {
      console.error('Failed to delete job:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jobs & Logs</h1>
          <p className="text-muted-foreground">View job history and activity logs</p>
        </div>
        <div className="flex gap-2">
          {canEdit && activeTab === 'jobs' && (
            <Button onClick={() => setShowJobDialog(true)}>
              <Plus className="h-4 w-4" />
              Add Job
            </Button>
          )}
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('jobs')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'jobs'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Jobs ({jobs.length})
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'activity'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Activity ({activities.length})
        </button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={machineFilter} onValueChange={setMachineFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
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
            {activeTab === 'jobs' && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {activeTab === 'jobs' ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">Job Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Machine</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">User</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Start</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">End</th>
                    {canEdit && <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((job) => (
                    <tr key={job.id} className="border-b last:border-0 group">
                      <td className="px-4 py-3">
                        <p className="font-medium">{job.name}</p>
                        {job.notes && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {job.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">{job.machine?.name}</td>
                      <td className="px-4 py-3 text-sm">{job.user?.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={jobStatusBadgeVariants[job.status]}>
                          {job.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {job.startTime && format(parseISO(job.startTime), 'MMM d, h:mm a')}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {job.endTime && format(parseISO(job.endTime), 'MMM d, h:mm a')}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEditJob(job)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteJob(job.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredJobs.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No jobs found</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">Action</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Machine</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">User</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Details</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.map((activity) => (
                    <tr key={activity.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{activity.action}</td>
                      <td className="px-4 py-3 text-sm">{activity.machine?.name}</td>
                      <td className="px-4 py-3 text-sm">{activity.user?.name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[300px]">
                        {activity.details}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {format(parseISO(activity.timestamp), 'MMM d, h:mm:ss a')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredActivities.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No activity logs found</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Job Dialog */}
      <AddJobDialog
        open={showJobDialog}
        onOpenChange={(open) => {
          setShowJobDialog(open)
          if (!open) setEditingJob(null)
        }}
        machines={machines}
        editingJob={editingJob}
        onSave={handleJobSaved}
      />
    </div>
  )
}
