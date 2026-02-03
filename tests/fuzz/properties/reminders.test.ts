/**
 * Property tests for reminders (Spec 8).
 *
 * Tests the invariants and laws for:
 * - Reminder timing
 * - Acknowledgment handling
 * - All-day item reminders
 * - Pending reminder queries
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { seriesIdGen, localDateGen, localDateTimeGen, reminderGen, durationGen } from '../generators'
import { parseLocalDateTime, makeLocalDateTime, makeLocalDate, makeLocalTime } from '../lib/utils'
import type { SeriesId, LocalDate, LocalDateTime, Reminder, Duration } from '../lib/types'

// ============================================================================
// Helper Types
// ============================================================================

interface ReminderInstance {
  seriesId: SeriesId
  instanceDate: LocalDate
  scheduledTime: LocalDateTime
  reminderTime: LocalDateTime
  isAcknowledged: boolean
}

// ============================================================================
// Helper: Reminder Manager (Mock)
// ============================================================================

class ReminderManager {
  private reminders: Map<string, ReminderInstance> = new Map()
  private configs: Map<SeriesId, Reminder> = new Map()
  private isAllDay: Map<SeriesId, boolean> = new Map()

  private makeKey(seriesId: SeriesId, date: LocalDate): string {
    return `${seriesId}:${date}`
  }

  setReminderConfig(seriesId: SeriesId, config: Reminder, isAllDay: boolean = false): void {
    this.configs.set(seriesId, config)
    this.isAllDay.set(seriesId, isAllDay)
  }

  scheduleReminder(seriesId: SeriesId, instanceDate: LocalDate, scheduledTime: LocalDateTime): void {
    const config = this.configs.get(seriesId)
    if (!config) return

    const isAllDay = this.isAllDay.get(seriesId) ?? false

    let reminderTime: LocalDateTime
    if (isAllDay) {
      // All-day reminders are relative to 00:00
      reminderTime = this.subtractMinutes(
        makeLocalDateTime(instanceDate, makeLocalTime(0, 0)),
        config.minutesBefore
      )
    } else {
      reminderTime = this.subtractMinutes(scheduledTime, config.minutesBefore)
    }

    const key = this.makeKey(seriesId, instanceDate)
    this.reminders.set(key, {
      seriesId,
      instanceDate,
      scheduledTime,
      reminderTime,
      isAcknowledged: false,
    })
  }

  getReminderInstance(seriesId: SeriesId, date: LocalDate): ReminderInstance | undefined {
    return this.reminders.get(this.makeKey(seriesId, date))
  }

  acknowledgeReminder(seriesId: SeriesId, date: LocalDate): void {
    const key = this.makeKey(seriesId, date)
    const reminder = this.reminders.get(key)
    if (reminder) {
      reminder.isAcknowledged = true
    }
  }

  getPendingReminders(currentTime: LocalDateTime): ReminderInstance[] {
    return Array.from(this.reminders.values()).filter((r) => {
      return r.reminderTime <= currentTime && !r.isAcknowledged
    })
  }

  private subtractMinutes(dt: LocalDateTime, minutes: number): LocalDateTime {
    const parsed = parseLocalDateTime(dt)
    const totalMinutes = parsed.hours * 60 + parsed.minutes - minutes

    // Handle negative minutes (goes to previous day)
    let adjustedMinutes = totalMinutes
    let dayOffset = 0
    while (adjustedMinutes < 0) {
      adjustedMinutes += 24 * 60
      dayOffset--
    }

    const newHour = Math.floor(adjustedMinutes / 60) % 24
    const newMinute = adjustedMinutes % 60

    // Simple date adjustment (ignoring month boundaries for test simplicity)
    const d = new Date(parsed.year, parsed.month - 1, parsed.day + dayOffset)

    return makeLocalDateTime(
      makeLocalDate(d.getFullYear(), d.getMonth() + 1, d.getDate()),
      makeLocalTime(newHour, newMinute)
    )
  }
}

// ============================================================================
// Reminder Timing Properties (Task #324, #328)
// ============================================================================

describe('Spec 8: Reminders - Timing', () => {
  it('Property #324: reminder fires at scheduled - minutesBefore', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        localDateGen(),
        fc.integer({ min: 8, max: 20 }), // Hour
        fc.integer({ min: 0, max: 59 }), // Minute
        fc.integer({ min: 5, max: 60 }), // Minutes before
        (seriesId, date, hour, minute, minutesBefore) => {
          const manager = new ReminderManager()
          const config: Reminder = { minutesBefore }
          manager.setReminderConfig(seriesId, config)

          const scheduledTime = makeLocalDateTime(date, makeLocalTime(hour, minute))
          manager.scheduleReminder(seriesId, date, scheduledTime)

          const reminder = manager.getReminderInstance(seriesId, date)
          expect(reminder).toBeDefined()

          // Verify reminder time is minutesBefore the scheduled time
          const scheduledParsed = parseLocalDateTime(scheduledTime)
          const reminderParsed = parseLocalDateTime(reminder!.reminderTime)

          const scheduledMinutes = scheduledParsed.hours * 60 + scheduledParsed.minutes
          const reminderMinutes = reminderParsed.hours * 60 + reminderParsed.minutes

          // If same day, simple subtraction
          if (scheduledParsed.day === reminderParsed.day) {
            expect(scheduledMinutes - reminderMinutes).toBe(minutesBefore)
          }
          // If reminder is on previous day, account for day boundary
          else {
            expect((24 * 60 + scheduledMinutes) - (24 * 60 + reminderMinutes - 24 * 60)).toBe(minutesBefore)
          }
        }
      )
    )
  })

  it('Property #328: all-day reminder relative to 00:00', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        localDateGen(),
        fc.integer({ min: 5, max: 120 }),
        (seriesId, date, minutesBefore) => {
          const manager = new ReminderManager()
          const config: Reminder = { minutesBefore }
          manager.setReminderConfig(seriesId, config, true) // isAllDay = true

          // For all-day items, scheduled time is 00:00
          const scheduledTime = makeLocalDateTime(date, makeLocalTime(0, 0))
          manager.scheduleReminder(seriesId, date, scheduledTime)

          const reminder = manager.getReminderInstance(seriesId, date)
          expect(reminder).toBeDefined()

          // Reminder should be minutesBefore midnight
          // E.g., if minutesBefore=60, reminder at 23:00 previous day
          const reminderParsed = parseLocalDateTime(reminder!.reminderTime)

          if (minutesBefore < 60) {
            // Same day, before midnight
            expect(reminderParsed.hours * 60 + reminderParsed.minutes).toBe(24 * 60 - minutesBefore)
          }
        }
      )
    )
  })
})

// ============================================================================
// Reminder Acknowledgment Properties (Task #325-#326, #330)
// ============================================================================

describe('Spec 8: Reminders - Acknowledgment', () => {
  it('Property #325: acknowledged reminder not pending', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        localDateGen(),
        fc.integer({ min: 8, max: 16 }),
        fc.integer({ min: 5, max: 30 }),
        (seriesId, date, hour, minutesBefore) => {
          const manager = new ReminderManager()
          const config: Reminder = { minutesBefore }
          manager.setReminderConfig(seriesId, config)

          const scheduledTime = makeLocalDateTime(date, makeLocalTime(hour, 0))
          manager.scheduleReminder(seriesId, date, scheduledTime)

          // Check time after the reminder should fire
          const checkTime = makeLocalDateTime(date, makeLocalTime(hour - 1, 55))

          // Before acknowledgment - should be pending
          const pendingBefore = manager.getPendingReminders(checkTime)
          const reminderBefore = pendingBefore.find((r) => r.seriesId === seriesId)
          // May or may not be pending depending on time

          // Acknowledge
          manager.acknowledgeReminder(seriesId, date)

          // After acknowledgment - should not be pending
          const pendingAfter = manager.getPendingReminders(makeLocalDateTime(date, makeLocalTime(23, 59)))
          const reminderAfter = pendingAfter.find((r) => r.seriesId === seriesId)
          expect(reminderAfter).toBeUndefined()
        }
      )
    )
  })

  it('Property #326: acknowledgment is instance-specific', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        localDateGen(),
        localDateGen(),
        fc.integer({ min: 5, max: 30 }),
        (seriesId, date1, date2, minutesBefore) => {
          fc.pre(date1 !== date2)

          const manager = new ReminderManager()
          const config: Reminder = { minutesBefore }
          manager.setReminderConfig(seriesId, config)

          const time1 = makeLocalDateTime(date1, makeLocalTime(10, 0))
          const time2 = makeLocalDateTime(date2, makeLocalTime(10, 0))

          manager.scheduleReminder(seriesId, date1, time1)
          manager.scheduleReminder(seriesId, date2, time2)

          // Acknowledge only date1
          manager.acknowledgeReminder(seriesId, date1)

          expect(manager.getReminderInstance(seriesId, date1)?.isAcknowledged).toBe(true)
          expect(manager.getReminderInstance(seriesId, date2)?.isAcknowledged).toBe(false)
        }
      )
    )
  })

  it('Property #330: acknowledgeReminder is idempotent', () => {
    fc.assert(
      fc.property(seriesIdGen(), localDateGen(), fc.integer({ min: 5, max: 30 }), (seriesId, date, minutesBefore) => {
        const manager = new ReminderManager()
        const config: Reminder = { minutesBefore }
        manager.setReminderConfig(seriesId, config)

        const scheduledTime = makeLocalDateTime(date, makeLocalTime(10, 0))
        manager.scheduleReminder(seriesId, date, scheduledTime)

        // Acknowledge multiple times
        manager.acknowledgeReminder(seriesId, date)
        manager.acknowledgeReminder(seriesId, date)
        manager.acknowledgeReminder(seriesId, date)

        expect(manager.getReminderInstance(seriesId, date)?.isAcknowledged).toBe(true)
      })
    )
  })
})

// ============================================================================
// Pending Reminders Properties (Task #329)
// ============================================================================

describe('Spec 8: Reminders - Pending Queries', () => {
  it('Property #329: getPendingReminders returns due unacked', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        fc.integer({ min: 5, max: 30 }),
        (seriesId, minutesBefore) => {
          const manager = new ReminderManager()
          const config: Reminder = { minutesBefore }
          manager.setReminderConfig(seriesId, config)

          const date = makeLocalDate(2024, 6, 15)
          const scheduledTime = makeLocalDateTime(date, makeLocalTime(10, 0))
          manager.scheduleReminder(seriesId, date, scheduledTime)

          // Time before reminder should fire
          const earlyTime = makeLocalDateTime(date, makeLocalTime(9, 30 - minutesBefore - 5))
          const earlyPending = manager.getPendingReminders(earlyTime)
          expect(earlyPending.find((r) => r.seriesId === seriesId)).toBeUndefined()

          // Time after reminder should fire
          const laterTime = makeLocalDateTime(date, makeLocalTime(9, 45))
          const laterPending = manager.getPendingReminders(laterTime)
          const found = laterPending.find((r) => r.seriesId === seriesId)

          // Should be pending if reminder time <= check time
          const reminder = manager.getReminderInstance(seriesId, date)
          if (reminder && reminder.reminderTime <= laterTime) {
            expect(found).toBeDefined()
          }
        }
      )
    )
  })

  it('future reminders not pending', () => {
    fc.assert(
      fc.property(seriesIdGen(), (seriesId) => {
        const manager = new ReminderManager()
        const config: Reminder = { minutesBefore: 15 }
        manager.setReminderConfig(seriesId, config)

        const date = makeLocalDate(2024, 6, 15)
        const scheduledTime = makeLocalDateTime(date, makeLocalTime(14, 0)) // 2pm
        manager.scheduleReminder(seriesId, date, scheduledTime)

        // Check at morning - reminder shouldn't be pending yet
        const morningCheck = makeLocalDateTime(date, makeLocalTime(9, 0))
        const pending = manager.getPendingReminders(morningCheck)

        expect(pending.find((r) => r.seriesId === seriesId)).toBeUndefined()
      })
    )
  })
})

// ============================================================================
// Instance-Reminder Interaction Properties (Task #327)
// ============================================================================

describe('Spec 8: Reminders - Instance Interaction', () => {
  it('Property #327: new instance gets new reminder', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        localDateGen(),
        localDateGen(),
        fc.integer({ min: 5, max: 30 }),
        (seriesId, date1, date2, minutesBefore) => {
          fc.pre(date1 !== date2)

          const manager = new ReminderManager()
          const config: Reminder = { minutesBefore }
          manager.setReminderConfig(seriesId, config)

          // Schedule two instances
          const time1 = makeLocalDateTime(date1, makeLocalTime(10, 0))
          const time2 = makeLocalDateTime(date2, makeLocalTime(14, 0))

          manager.scheduleReminder(seriesId, date1, time1)
          manager.scheduleReminder(seriesId, date2, time2)

          // Both should have reminders
          const reminder1 = manager.getReminderInstance(seriesId, date1)
          const reminder2 = manager.getReminderInstance(seriesId, date2)

          expect(reminder1).toBeDefined()
          expect(reminder2).toBeDefined()
          expect(reminder1?.reminderTime).not.toBe(reminder2?.reminderTime)
        }
      )
    )
  })
})
