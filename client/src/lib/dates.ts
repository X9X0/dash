import { format, parseISO } from 'date-fns'

// Helpers for the two kinds of date the API exposes:
//
//  - Date-only fields (buildDate, service-record performedAt, hour-entry date)
//    are sent as 'YYYY-MM-DD' and stored as UTC midnight. They must be
//    displayed as a calendar date, never converted to local time, otherwise
//    they shift to the previous day west of UTC.
//  - True instants (createdAt, timestamps, reservation times) keep using
//    parseISO/format from date-fns directly.

/** Today's local calendar date as 'YYYY-MM-DD' (for <input type="date"> defaults). */
export function todayDateInput(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * 'YYYY-MM-DD' for a date-only value. The stored value is UTC midnight of the
 * calendar date, so the UTC date part is the calendar date.
 */
export function toDateInput(iso: string): string {
  return iso.slice(0, 10)
}

/** Format a date-only value as a calendar date, with no timezone shift. */
export function formatDateOnly(iso: string, fmt = 'MMM d, yyyy'): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso
  return format(new Date(y, m - 1, d), fmt)
}

/** Local wall time 'YYYY-MM-DDTHH:mm' for <input type="datetime-local">. */
export function toDateTimeLocalInput(iso: string): string {
  return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm")
}

/** Convert a datetime-local input value (local wall time) into an ISO instant. */
export function fromDateTimeLocalInput(value: string): string {
  return new Date(value).toISOString()
}
