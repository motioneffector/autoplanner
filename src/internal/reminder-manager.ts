/**
 * Reminder Manager
 *
 * Stateful reminder management. Owns reminders, remindersBySeriesMap,
 * and reminderAcks Maps. Handles creation, pending checks, acknowledgement,
 * and offset queries.
 *
 * Event emission (reminderDue) is handled via an injected callback — the
 * orchestrator owns the event system.
 */

import type { LocalDate, LocalTime, LocalDateTime } from '../time-date'
import { addDays, makeDateTime, makeTime, dateOf } from '../time-date'
import type { Adapter } from '../adapter'
import type { FullSeries, PendingReminder } from '../public-api'
import type { CompletionReader, ExceptionReader, InternalReminder, ReminderReader } from './types'
import { uuid, normalizeTime, subtractMinutes, getPatternDates } from './helpers'

type ReminderManagerDeps = {
  adapter: Adapter
  getFullSeries: (id: string) => Promise<FullSeries | null>
  completionReader: CompletionReader
  exceptionReader: ExceptionReader
  onReminderDue: (reminder: PendingReminder) => void
}

export function createReminderManager(deps: ReminderManagerDeps) {
  const { adapter, getFullSeries, completionReader, exceptionReader, onReminderDue } = deps

  const reminders = new Map<string, InternalReminder>()
  const remindersBySeriesMap = new Map<string, string[]>()
  const reminderAcks = new Map<string, Set<string>>()

  // ========== Reader ==========

  const reader: ReminderReader = {
    get(id: string): InternalReminder | undefined {
      const r = reminders.get(id)
      return r ? { ...r } : undefined
    },
    getBySeriesId(seriesId: string): string[] {
      return [...(remindersBySeriesMap.get(seriesId) || [])]
    },
  }

  // ========== Operations ==========

  async function create(seriesId: string, options: { type: string; offset?: number }): Promise<string> {
    const id = uuid()
    const reminder: InternalReminder = {
      id,
      seriesId,
      type: options.type,
      offset: typeof options.offset === 'number' ? options.offset : 0,
    }
    reminders.set(id, reminder)
    reminderAcks.set(id, new Set())

    if (!remindersBySeriesMap.has(seriesId)) remindersBySeriesMap.set(seriesId, [])
    remindersBySeriesMap.get(seriesId)!.push(id)

    await adapter.createReminder({
      id,
      seriesId,
      minutesBefore: typeof options.offset === 'number' ? options.offset : 0,
      label: options.type || '',
    })
    return id
  }

  async function getPending(asOf: LocalDateTime): Promise<PendingReminder[]> {
    const pending: PendingReminder[] = []
    const asOfDate = dateOf(asOf)

    for (const [id, reminder] of reminders) {
      const s = await getFullSeries(reminder.seriesId)
      if (!s) continue

      const acks = reminderAcks.get(id) || new Set()
      const seriesStart = s.startDate || ('2000-01-01' as LocalDate)

      for (const pattern of s.patterns) {
        // Only check today and tomorrow (not yesterday — yesterday's reminders are expired)
        const checkStart = asOfDate
        const checkEnd = addDays(asOfDate, 2)
        const dates = getPatternDates(pattern, checkStart, checkEnd, seriesStart)

        for (const date of dates) {
          const exKey = `${reminder.seriesId}:${date}`
          const exception = exceptionReader.getByKey(exKey)
          if (exception?.type === 'cancelled') continue
          if (completionReader.hasCompletionForKey(reminder.seriesId, date)) continue

          // Calculate fire time
          let instanceTime: LocalDateTime
          if (exception?.type === 'rescheduled' && exception.newTime) {
            instanceTime = exception.newTime
          } else if (pattern.allDay) {
            instanceTime = makeDateTime(date, makeTime(0, 0, 0))
          } else {
            const patternTime = normalizeTime((pattern?.time || '09:00:00') as LocalTime)
            instanceTime = makeDateTime(date, patternTime)
          }

          const offsetMins = typeof reminder.offset === 'number' ? reminder.offset : 0
          const fireTime = subtractMinutes(instanceTime, offsetMins)

          if ((fireTime as string) <= (asOf as string)) {
            const ackKey = `${date}:${id}`
            if (!acks.has(ackKey)) {
              pending.push({
                id: reminder.id,
                seriesId: reminder.seriesId,
                type: reminder.type,
                ...(reminder.offset != null ? { offset: reminder.offset } : {}),
                offsetMinutes: offsetMins,
                instanceDate: date,
              })
            }
          }
        }
      }
    }

    return pending
  }

  async function check(asOf: LocalDateTime): Promise<void> {
    const pending = await getPending(asOf)
    for (const reminder of pending) {
      onReminderDue(reminder)
    }
  }

  async function acknowledge(id: string, asOf: LocalDateTime): Promise<void> {
    if (!reminderAcks.has(id)) reminderAcks.set(id, new Set())
    const acks = reminderAcks.get(id)!
    const asOfDate = dateOf(asOf)

    const reminder = reminders.get(id)
    if (reminder) {
      const s = await getFullSeries(reminder.seriesId)
      if (s) {
        const seriesStart = s.startDate || ('2000-01-01' as LocalDate)
        for (const pattern of s.patterns) {
          const checkStart = addDays(asOfDate, -1)
          const checkEnd = addDays(asOfDate, 2)
          const dates = getPatternDates(pattern, checkStart, checkEnd, seriesStart)
          for (const date of dates) {
            acks.add(`${date}:${id}`)
            await adapter.acknowledgeReminder(id, date, asOf)
          }
        }
      }
    }
  }

  function getOffsetsForSeries(seriesId: string): number[] {
    const ids = remindersBySeriesMap.get(seriesId) || []
    const offsets: number[] = []
    for (const rid of ids) {
      const r = reminders.get(rid)
      if (r && r.offset != null) offsets.push(typeof r.offset === 'number' ? r.offset : 0)
    }
    return offsets
  }

  // ========== Hydration ==========

  async function hydrate(): Promise<void> {
    // Hydrate reminders
    const allReminders = await adapter.getAllReminders()
    for (const r of allReminders) {
      if (!reminders.has(r.id)) {
        reminders.set(r.id, {
          id: r.id,
          seriesId: r.seriesId,
          type: r.label,
          offset: r.minutesBefore,
        })
        if (!reminderAcks.has(r.id)) reminderAcks.set(r.id, new Set())
        if (!remindersBySeriesMap.has(r.seriesId)) remindersBySeriesMap.set(r.seriesId, [])
        if (!remindersBySeriesMap.get(r.seriesId)!.includes(r.id)) {
          remindersBySeriesMap.get(r.seriesId)!.push(r.id)
        }
      }
    }

    // Hydrate reminder acks
    const today = new Date().toISOString().slice(0, 10) as LocalDate
    const ackStart = addDays(today, -30)
    const ackEnd = addDays(today, 30)
    const allAcks = await adapter.getReminderAcksInRange(ackStart, ackEnd)
    for (const ack of allAcks) {
      if (!reminderAcks.has(ack.reminderId)) reminderAcks.set(ack.reminderId, new Set())
      reminderAcks.get(ack.reminderId)!.add(`${ack.instanceDate}:${ack.reminderId}`)
    }
  }

  return {
    reader,
    create,
    getPending,
    check,
    acknowledge,
    getOffsetsForSeries,
    hydrate,
  }
}
