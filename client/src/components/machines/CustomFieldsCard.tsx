import { useState, useEffect } from 'react'
import { Loader2, Save, Settings2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/common'
import api from '@/services/api'
import type { MachineType, MachineCustomField, FieldSchema } from '@/types'

interface CustomFieldsCardProps {
  machineId: string
  machineType: MachineType | undefined
  canEdit: boolean
}

export function CustomFieldsCard({ machineId, machineType, canEdit }: CustomFieldsCardProps) {
  const [customFields, setCustomFields] = useState<MachineCustomField[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const fieldsSchema = machineType?.fieldsSchema || {}
  const hasFields = Object.keys(fieldsSchema).length > 0
  const fieldEntries = Object.entries(fieldsSchema)
  const INITIAL_DISPLAY_COUNT = 4
  const hasMoreFields = fieldEntries.length > INITIAL_DISPLAY_COUNT

  useEffect(() => {
    fetchCustomFields()
  }, [machineId])

  const fetchCustomFields = async () => {
    try {
      setLoading(true)
      const { data } = await api.get<MachineCustomField[]>(`/machines/${machineId}/custom-fields`)
      setCustomFields(data)

      // Initialize form data from existing values
      const initialData: Record<string, string> = {}
      data.forEach((field) => {
        initialData[field.fieldName] = field.fieldValue
      })
      setFormData(initialData)
    } catch (err) {
      console.error('Failed to fetch custom fields:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setError('')
    setSuccess(false)
    setSaving(true)

    try {
      // Convert form data to array format for API
      const fields = Object.entries(formData)
        .filter(([_, value]) => value !== '' && value !== undefined)
        .map(([fieldName, fieldValue]) => ({
          fieldName,
          fieldValue: String(fieldValue),
        }))

      const { data } = await api.put<MachineCustomField[]>(
        `/machines/${machineId}/custom-fields`,
        fields
      )

      setCustomFields(data)
      setEditing(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      setError(error.response?.data?.error || 'Failed to save custom fields')
    } finally {
      setSaving(false)
    }
  }

  const handleFieldChange = (fieldName: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }))
  }

  const getFieldValue = (fieldName: string): string => {
    return formData[fieldName] ?? ''
  }

  const renderField = (fieldName: string, schema: FieldSchema) => {
    const value = getFieldValue(fieldName)

    if (!editing) {
      // Display mode
      let displayValue = value || '-'
      if (schema.type === 'boolean') {
        displayValue = value === 'true' ? 'Yes' : value === 'false' ? 'No' : '-'
      }

      return (
        <div key={fieldName} className="flex items-center justify-between py-2">
          <span className="text-sm text-muted-foreground">{schema.label}</span>
          <span className="text-sm font-medium">{displayValue}</span>
        </div>
      )
    }

    // Edit mode
    switch (schema.type) {
      case 'boolean':
        return (
          <div key={fieldName} className="space-y-2">
            <Label className="flex items-center justify-between">
              <span>{schema.label}</span>
              {schema.required && <span className="text-xs text-destructive">*</span>}
            </Label>
            <div className="flex items-center gap-2">
              <Switch
                checked={value === 'true'}
                onCheckedChange={(checked) => handleFieldChange(fieldName, String(checked))}
              />
              <span className="text-sm text-muted-foreground">
                {value === 'true' ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        )

      case 'select':
        return (
          <div key={fieldName} className="space-y-2">
            <Label>
              {schema.label}
              {schema.required && <span className="text-xs text-destructive ml-1">*</span>}
            </Label>
            <Select
              value={value}
              onValueChange={(v) => handleFieldChange(fieldName, v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={`Select ${schema.label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {schema.options?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )

      case 'number':
        return (
          <div key={fieldName} className="space-y-2">
            <Label htmlFor={fieldName}>
              {schema.label}
              {schema.required && <span className="text-xs text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={fieldName}
              type="number"
              value={value}
              onChange={(e) => handleFieldChange(fieldName, e.target.value)}
              required={schema.required}
            />
          </div>
        )

      case 'string':
      default:
        return (
          <div key={fieldName} className="space-y-2">
            <Label htmlFor={fieldName}>
              {schema.label}
              {schema.required && <span className="text-xs text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={fieldName}
              type="text"
              value={value}
              onChange={(e) => handleFieldChange(fieldName, e.target.value)}
              required={schema.required}
            />
          </div>
        )
    }
  }

  if (!hasFields) {
    return null // Don't show card if machine type has no custom fields defined
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Custom Fields
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Custom Fields
        </CardTitle>
        {canEdit && !editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-md bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-500">
            Custom fields saved successfully
          </div>
        )}

        <div className={editing ? 'space-y-4' : 'divide-y'}>
          {(editing || expanded ? fieldEntries : fieldEntries.slice(0, INITIAL_DISPLAY_COUNT)).map(
            ([fieldName, schema]) => renderField(fieldName, schema)
          )}
        </div>

        {!editing && hasMoreFields && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-sm text-primary hover:underline mt-3 w-full justify-center"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Show {fieldEntries.length - INITIAL_DISPLAY_COUNT} more
              </>
            )}
          </button>
        )}

        {editing && (
          <div className="flex gap-2 mt-6 pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(false)
                // Reset form data to current saved values
                const resetData: Record<string, string> = {}
                customFields.forEach((field) => {
                  resetData[field.fieldName] = field.fieldValue
                })
                setFormData(resetData)
                setError('')
              }}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        )}

        {!editing && customFields.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No custom fields set
            {canEdit && (
              <>
                .{' '}
                <button
                  className="text-primary hover:underline"
                  onClick={() => setEditing(true)}
                >
                  Add some
                </button>
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
