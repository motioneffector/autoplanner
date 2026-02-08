/**
 * Reminders Module
 *
 * Reminder CRUD, fire time calculation, pending reminder queries,
 * acknowledgment management, and purging.
 */

import type { Adapter, Reminder as AdapterReminder, InstanceException } from './adapter'
import type { LocalDate, LocalDateTime, LocalTime } from './time-date'
import { addMinutes, makeDateTime, makeTime, dateOf } from './time-date'
import { expandPattern, toExpandablePattern } from './pattern-expansion'

// ============================================================================
// Types
// ============================================================================

type ReminderResult<T> = { ok: true; value: T } | { ok: false; error: { type: string; message: string } }

export type { DomainReminder, PendingReminder } from './domain-types'
import type { DomainReminder, PendingReminder } from './domain-types'

type CreateReminderInput = {
  seriesId: string
  minutesBefore: number
  tag: string
}

// ============================================================================
// Helpers
// ============================================================================

function ok<T>(value: T): ReminderResult<T> {
  return { ok: true, value }
}

function err<T>(type: string, message: string): ReminderResult<T> {
  return { ok: false, error: { type, message } }
}

function toDomain(r: AdapterReminder): DomainReminder {
  return {
    id: r.id,
    seriesId: r.seriesId,
    minutesBefore: r.minutesBefore,
    tag: r.label,
  }
}

// ============================================================================
// Public API
// ============================================================================

export function calculateFireTime(instanceTime: LocalDateTime, minutesBefore: number): LocalDateTime {
  return addMinutes(instanceTime, -minutesBefore)
}

export async function createReminder(
  adapter: Adapter,
  input: CreateReminderInput
): Promise<ReminderResult<{ id: string }>> {
  if (input.minutesBefore < 0) {
    return err('ValidationError', 'minutesBefore must be >= 0')
  }
  if (!input.tag) {
    return err('ValidationError', 'tag must be non-empty')
  }

  const series = await adapter.getSeries(input.seriesId)
  if (!series) {
    return err('NotFoundError', `Series '${input.seriesId}' not found`)
  }

  const id = crypto.randomUUID()
  await adapter.createReminder({
    id,
    seriesId: input.seriesId,
    minutesBefore: input.minutesBefore,
    label: input.tag,
  })

  return ok({ id })
}

export async function getReminder(
  adapter: Adapter,
  id: string
): Promise<DomainReminder | null> {
  const r = await adapter.getReminder(id)
  if (!r) return null
  return toDomain(r)
}

export async function getRemindersBySeries(
  adapter: Adapter,
  seriesId: string
): Promise<DomainReminder[]> {
  const reminders = await adapter.getRemindersBySeries(seriesId)
  return reminders.map(toDomain)
}

export async function updateReminder(
  adapter: Adapter,
  id: string,
  changes: { minutesBefore?: number; tag?: string }
): Promise<void> {
  const adapterChanges: Partial<AdapterReminder> = {}
  if (changes.minutesBefore !== undefined) {
    adapterChanges.minutesBefore = changes.minutesBefore
  }
  if (changes.tag !== undefined) {
    adapterChanges.label = changes.tag
  }
  await adapter.updateReminder(id, adapterChanges)
}

export async function deleteReminder(
  adapter: Adapter,
  id: string
): Promise<ReminderResult<void>> {
  await adapter.deleteReminder(id)
  return ok(undefined as void)
}

export async function getPendingReminders(
  adapter: Adapter,
  opts: { asOf: LocalDateTime; range: { start: LocalDate; end: LocalDate } }
): Promise<PendingReminder[]> {
  const allReminders = await adapter.getAllReminders()
  if (allReminders.length === 0) return []

  // Group reminders by series
  const bySeriesId = new Map<string, AdapterReminder[]>()
  for (const r of allReminders) {
    const list = bySeriesId.get(r.seriesId) || []
    list.push(r)
    bySeriesId.set(r.seriesId, list)
  }

  const pending: PendingReminder[] = []

  for (const [seriesId, seriesReminders] of bySeriesId) {
    const series = await adapter.getSeries(seriesId)
    if (!series) continue

    // Determine effective range (intersect with series date bounds)
    const effectiveStart: LocalDate =
      series.startDate && series.startDate > opts.range.start ? series.startDate : opts.range.start
    const effectiveEnd: LocalDate =
      series.endDate && series.endDate < opts.range.end
        ? series.endDate
        : opts.range.end

    if (effectiveStart > effectiveEnd) continue

    // Expand patterns to get instance dates
    const patterns = await adapter.getPatternsBySeries(seriesId)
    const allDates = new Set<LocalDate>()

    const seriesStart: LocalDate = series.startDate ?? opts.range.start
    for (const p of patterns) {
      const expanded = expandPattern(
        toExpandablePattern(p, seriesStart),
        { start: effectiveStart, end: effectiveEnd },
        seriesStart
      )
      for (const d of expanded) {
        allDates.add(d)
      }
    }

    // Get exceptions for this series
    const exceptions = await adapter.getExceptionsBySeries(seriesId)
    const exceptionMap = new Map<string, InstanceException>()
    for (const e of exceptions) {
      exceptionMap.set(e.originalDate as string, e)
    }

    // Get completions for this series
    const completions = await adapter.getCompletionsBySeries(seriesId)
    const completionDates = new Set<string>(
      completions.map((c) => c.instanceDate as string)
    )

    for (const date of [...allDates].sort()) {
      const exception = exceptionMap.get(date as string)

      // Skip cancelled instances
      if (exception?.type === 'cancelled') continue

      // Skip completed instances
      if (completionDates.has(date as string)) continue

      // Determine instance time
      let instanceTime: LocalDateTime
      if (exception?.type === 'rescheduled') {
        instanceTime = exception.newTime!
      } else if (series['allDay'] || series['timeOfDay'] === 'allDay') {
        instanceTime = makeDateTime(date, makeTime(0, 0, 0))
      } else {
        instanceTime = makeDateTime(date, series['timeOfDay'] as LocalTime)
      }

      // Check each reminder for this series
      for (const r of seriesReminders) {
        const fireTime = calculateFireTime(instanceTime, r.minutesBefore)

        // Fire time must be <= asOf
        if ((fireTime as string) > (opts.asOf as string)) continue

        // Check if acknowledged
        const isAcked = await adapter.isReminderAcknowledged(r.id, date)
        if (isAcked) continue

        pending.push({
          reminderId: r.id,
          seriesId,
          instanceDate: date,
          tag: r.label,
        })
      }
    }
  }

  return pending
}

export async function acknowledgeReminder(
  adapter: Adapter,
  reminderId: string,
  instanceDate: LocalDate
): Promise<ReminderResult<{ acknowledgedAt: string }>> {
  const reminder = await adapter.getReminder(reminderId)
  if (!reminder) {
    return err('NotFoundError', `Reminder '${reminderId}' not found`)
  }

  const acknowledgedAt = new Date().toISOString() as LocalDateTime
  await adapter.acknowledgeReminder(reminderId, instanceDate, acknowledgedAt)

  return ok({ acknowledgedAt: acknowledgedAt as string })
}

export async function isReminderAcknowledged(
  adapter: Adapter,
  reminderId: string,
  instanceDate: LocalDate
): Promise<boolean> {
  return adapter.isReminderAcknowledged(reminderId, instanceDate)
}

export async function purgeOldAcknowledgments(
  adapter: Adapter,
  opts: { olderThan: number; asOf: LocalDate }
): Promise<void> {
  // Calculate the cutoff date: asOf - olderThan days
  // Anything with instanceDate < cutoff gets purged
  const { addDays } = await import('./time-date')
  const cutoff = addDays(opts.asOf, -opts.olderThan)
  await adapter.purgeOldReminderAcks(cutoff)
}
