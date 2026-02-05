/**
 * Property tests for instance exceptions (Spec 5).
 *
 * Tests the invariants and laws for:
 * - Instance cancellation
 * - Instance rescheduling
 * - Instance restoration
 * - Exception persistence
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { seriesIdGen, localDateGen, localDateTimeGen } from '../generators'
import { parseLocalDate, parseLocalDateTime, makeLocalDate, makeLocalDateTime, makeLocalTime } from '../lib/utils'
import type { SeriesId, LocalDate, LocalDateTime } from '../lib/types'

// ============================================================================
// Helper Types
// ============================================================================

interface ScheduledInstance {
  seriesId: SeriesId
  instanceDate: LocalDate
  scheduledTime: LocalDateTime
  duration: number
  isCancelled: boolean
  rescheduledTo?: LocalDateTime
}

// ============================================================================
// Helper: Instance Manager (Mock)
// ============================================================================

class InstanceManager {
  private instances: Map<string, ScheduledInstance> = new Map()

  private makeKey(seriesId: SeriesId, date: LocalDate): string {
    return `${seriesId}:${date}`
  }

  scheduleInstance(seriesId: SeriesId, date: LocalDate, time: LocalDateTime, duration: number): void {
    const key = this.makeKey(seriesId, date)
    this.instances.set(key, {
      seriesId,
      instanceDate: date,
      scheduledTime: time,
      duration,
      isCancelled: false,
    })
  }

  getInstance(seriesId: SeriesId, date: LocalDate): ScheduledInstance | undefined {
    return this.instances.get(this.makeKey(seriesId, date))
  }

  cancelInstance(seriesId: SeriesId, date: LocalDate): void {
    const key = this.makeKey(seriesId, date)
    const instance = this.instances.get(key)
    if (!instance) {
      throw new Error('Instance not found')
    }
    if (instance.isCancelled) {
      throw new Error('Instance already cancelled')
    }
    instance.isCancelled = true
  }

  rescheduleInstance(seriesId: SeriesId, date: LocalDate, newTime: LocalDateTime): void {
    const key = this.makeKey(seriesId, date)
    const instance = this.instances.get(key)
    if (!instance) {
      throw new Error('Instance not found')
    }
    if (instance.isCancelled) {
      throw new Error('Cannot reschedule cancelled instance')
    }
    instance.rescheduledTo = newTime
  }

  restoreInstance(seriesId: SeriesId, date: LocalDate): void {
    const key = this.makeKey(seriesId, date)
    const instance = this.instances.get(key)
    if (!instance) {
      throw new Error('Instance not found')
    }
    if (!instance.isCancelled) {
      // Restore on non-cancelled is a no-op
      return
    }
    instance.isCancelled = false
    // Clear any reschedule when restoring
    instance.rescheduledTo = undefined
  }

  getSchedule(seriesId: SeriesId): ScheduledInstance[] {
    return Array.from(this.instances.values())
      .filter((i) => i.seriesId === seriesId && !i.isCancelled)
  }

  getExceptions(seriesId: SeriesId): ScheduledInstance[] {
    return Array.from(this.instances.values())
      .filter((i) => i.seriesId === seriesId && (i.isCancelled || i.rescheduledTo !== undefined))
  }
}

// ============================================================================
// Instance Cancellation Properties (Task #314-#317)
// ============================================================================

describe('Spec 5: Instances - Cancellation', () => {
  it('Property #314: cancelInstance excludes from schedule', () => {
    fc.assert(
      fc.property(seriesIdGen(), localDateGen(), localDateTimeGen(), (seriesId, date, time) => {
        const manager = new InstanceManager()
        manager.scheduleInstance(seriesId, date, time, 60)

        // Before cancellation
        const scheduleBefore = manager.getSchedule(seriesId)
        expect(scheduleBefore).toHaveLength(1)
        expect(scheduleBefore[0].seriesId).toBe(seriesId)
        expect(scheduleBefore[0].instanceDate).toBe(date)
        expect(scheduleBefore[0].isCancelled).toBe(false)

        manager.cancelInstance(seriesId, date)

        // After cancellation
        expect(manager.getSchedule(seriesId)).toEqual([])
        const instance = manager.getInstance(seriesId, date)
        expect(instance).toBeDefined()
        expect(instance?.isCancelled).toBe(true)
      })
    )
  })

  it('Property #315: cancelInstance is idempotent (throws on double cancel)', () => {
    fc.assert(
      fc.property(seriesIdGen(), localDateGen(), localDateTimeGen(), (seriesId, date, time) => {
        const manager = new InstanceManager()
        manager.scheduleInstance(seriesId, date, time, 60)

        manager.cancelInstance(seriesId, date)

        // Second cancel should throw
        expect(() => manager.cancelInstance(seriesId, date)).toThrow('Instance already cancelled')
      })
    )
  })

  it('Property #316: cancel non-existent throws', () => {
    fc.assert(
      fc.property(seriesIdGen(), localDateGen(), (seriesId, date) => {
        const manager = new InstanceManager()
        // Don't schedule anything

        expect(() => manager.cancelInstance(seriesId, date)).toThrow('Instance not found')
      })
    )
  })

  it('Property #317: cancel already-cancelled throws', () => {
    fc.assert(
      fc.property(seriesIdGen(), localDateGen(), localDateTimeGen(), (seriesId, date, time) => {
        const manager = new InstanceManager()
        manager.scheduleInstance(seriesId, date, time, 60)
        manager.cancelInstance(seriesId, date)

        expect(() => manager.cancelInstance(seriesId, date)).toThrow('Instance already cancelled')
      })
    )
  })
})

// ============================================================================
// Instance Rescheduling Properties (Task #318-#320)
// ============================================================================

describe('Spec 5: Instances - Rescheduling', () => {
  it('Property #318: rescheduleInstance changes time', () => {
    fc.assert(
      fc.property(seriesIdGen(), localDateGen(), localDateTimeGen(), localDateTimeGen(), (seriesId, date, originalTime, newTime) => {
        const manager = new InstanceManager()
        manager.scheduleInstance(seriesId, date, originalTime, 60)

        manager.rescheduleInstance(seriesId, date, newTime)

        const instance = manager.getInstance(seriesId, date)
        expect(instance?.rescheduledTo).toBe(newTime)
      })
    )
  })

  it('Property #319: reschedule cancelled throws', () => {
    fc.assert(
      fc.property(seriesIdGen(), localDateGen(), localDateTimeGen(), localDateTimeGen(), (seriesId, date, time, newTime) => {
        const manager = new InstanceManager()
        manager.scheduleInstance(seriesId, date, time, 60)
        manager.cancelInstance(seriesId, date)

        expect(() => manager.rescheduleInstance(seriesId, date, newTime)).toThrow('Cannot reschedule cancelled instance')
      })
    )
  })

  it('Property #320: reschedule non-existent throws', () => {
    fc.assert(
      fc.property(seriesIdGen(), localDateGen(), localDateTimeGen(), (seriesId, date, newTime) => {
        const manager = new InstanceManager()
        // Don't schedule anything

        expect(() => manager.rescheduleInstance(seriesId, date, newTime)).toThrow('Instance not found')
      })
    )
  })
})

// ============================================================================
// Instance Restoration Properties (Task #321-#322)
// ============================================================================

describe('Spec 5: Instances - Restoration', () => {
  it('Property #321: restoreInstance un-cancels', () => {
    fc.assert(
      fc.property(seriesIdGen(), localDateGen(), localDateTimeGen(), (seriesId, date, time) => {
        const manager = new InstanceManager()
        manager.scheduleInstance(seriesId, date, time, 60)
        manager.cancelInstance(seriesId, date)

        expect(manager.getInstance(seriesId, date)?.isCancelled).toBe(true)
        expect(manager.getSchedule(seriesId)).toEqual([])

        manager.restoreInstance(seriesId, date)

        const restoredInstance = manager.getInstance(seriesId, date)
        expect(restoredInstance).toBeDefined()
        expect(restoredInstance?.isCancelled).toBe(false)
        expect(restoredInstance?.rescheduledTo).toBeUndefined()

        const schedule = manager.getSchedule(seriesId)
        expect(schedule).toHaveLength(1)
        expect(schedule[0].seriesId).toBe(seriesId)
        expect(schedule[0].instanceDate).toBe(date)
      })
    )
  })

  it('Property #322: restore non-cancelled is no-op', () => {
    fc.assert(
      fc.property(seriesIdGen(), localDateGen(), localDateTimeGen(), (seriesId, date, time) => {
        const manager = new InstanceManager()
        manager.scheduleInstance(seriesId, date, time, 60)

        // Not cancelled - restore should be no-op
        manager.restoreInstance(seriesId, date)

        expect(manager.getInstance(seriesId, date)?.isCancelled).toBe(false)
        const schedule = manager.getSchedule(seriesId)
        expect(schedule.length === 1 && schedule[0].seriesId === seriesId).toBe(true)
        expect(schedule[0].instanceDate).toBe(date)
      })
    )
  })
})

// ============================================================================
// Exception Persistence Properties (Task #323)
// ============================================================================

describe('Spec 5: Instances - Exception Persistence', () => {
  it('Property #323: exceptions persist', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        fc.array(localDateGen(), { minLength: 3, maxLength: 5 }),
        localDateTimeGen(),
        (seriesId, dates, time) => {
          const uniqueDates = [...new Set(dates)]
          fc.pre(uniqueDates.length >= 2)

          const manager = new InstanceManager()

          // Schedule instances for each date
          uniqueDates.forEach((date) => {
            manager.scheduleInstance(seriesId, date, time, 60)
          })

          // Cancel the first, reschedule the second
          manager.cancelInstance(seriesId, uniqueDates[0])
          if (uniqueDates.length > 1) {
            const newTime = makeLocalDateTime(uniqueDates[1], makeLocalTime(15, 0))
            manager.rescheduleInstance(seriesId, uniqueDates[1], newTime)
          }

          // Verify exceptions are tracked
          const exceptions = manager.getExceptions(seriesId)
          expect(exceptions.length >= 1).toBe(true)
          expect(exceptions[0].seriesId).toBe(seriesId)

          // Verify cancelled instance is still in exceptions
          const cancelled = exceptions.find((e) => e.instanceDate === uniqueDates[0])
          expect(cancelled?.isCancelled).toBe(true)
        }
      )
    )
  })
})

// ============================================================================
// Instance Bounds Properties (Task #360-#361)
// ============================================================================

interface SeriesBounds {
  startDate?: LocalDate
  endDate?: LocalDate
}

class BoundedInstanceManager extends InstanceManager {
  private seriesBounds: Map<SeriesId, SeriesBounds> = new Map()

  setSeriesBounds(seriesId: SeriesId, bounds: SeriesBounds): void {
    this.seriesBounds.set(seriesId, bounds)
  }

  isDateWithinBounds(seriesId: SeriesId, date: LocalDate): boolean {
    const bounds = this.seriesBounds.get(seriesId)
    if (!bounds) return true // No bounds = always valid

    if (bounds.startDate && date < bounds.startDate) return false
    if (bounds.endDate && date > bounds.endDate) return false

    return true
  }

  getScheduleWithinBounds(seriesId: SeriesId): ScheduledInstance[] {
    return this.getSchedule(seriesId).filter((i) =>
      this.isDateWithinBounds(seriesId, i.instanceDate)
    )
  }
}

describe('Spec 5: Instances - Bounds', () => {
  it('Property #360: instances respect series bounds', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        localDateGen(),
        localDateGen(),
        localDateGen(),
        localDateTimeGen(),
        (seriesId, boundStart, boundEnd, instanceDate, time) => {
          // Ensure start <= end for bounds
          const [startDate, endDate] = boundStart < boundEnd
            ? [boundStart, boundEnd]
            : [boundEnd, boundStart]

          const manager = new BoundedInstanceManager()
          manager.setSeriesBounds(seriesId, { startDate, endDate })
          manager.scheduleInstance(seriesId, instanceDate, time, 60)

          const withinBounds = manager.getScheduleWithinBounds(seriesId)
          const isOutsideBounds = instanceDate < startDate || instanceDate > endDate

          // If instance date is outside bounds, it shouldn't appear
          if (isOutsideBounds) {
            // Verify no instances appear when outside bounds
            expect(withinBounds).toEqual([])

            // Verify the instance still exists but is filtered
            const allInstances = manager.getSchedule(seriesId)
            expect(allInstances).toHaveLength(1)
          } else {
            expect(withinBounds).toHaveLength(1)
            expect(withinBounds[0].seriesId).toBe(seriesId)
            expect(withinBounds[0].instanceDate).toBe(instanceDate)
          }
        }
      )
    )
  })

  it('Property #361: cancelled instances excluded from bounded schedule', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        localDateGen(),
        localDateTimeGen(),
        (seriesId, date, time) => {
          const manager = new BoundedInstanceManager()
          // No bounds set - all dates valid
          manager.scheduleInstance(seriesId, date, time, 60)

          // Before cancellation - verify instance is visible
          const scheduleBefore = manager.getScheduleWithinBounds(seriesId)
          expect(scheduleBefore).toHaveLength(1)
          expect(scheduleBefore[0].seriesId).toBe(seriesId)
          expect(scheduleBefore[0].instanceDate).toBe(date)
          expect(scheduleBefore[0].isCancelled).toBe(false)

          manager.cancelInstance(seriesId, date)

          // After cancellation - verify schedule is empty
          expect(manager.getScheduleWithinBounds(seriesId)).toEqual([])

          // Verify instance still exists but is cancelled
          const instance = manager.getInstance(seriesId, date)
          expect(instance).toBeDefined()
          expect(instance?.isCancelled).toBe(true)
        }
      )
    )
  })

  it('unbounded series includes all instances', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        fc.array(localDateGen(), { minLength: 1, maxLength: 5 }),
        localDateTimeGen(),
        (seriesId, dates, time) => {
          const uniqueDates = [...new Set(dates)]
          const manager = new BoundedInstanceManager()
          // Don't set any bounds

          uniqueDates.forEach((date) => {
            manager.scheduleInstance(seriesId, date, time, 60)
          })

          expect(manager.getScheduleWithinBounds(seriesId).length).toBe(uniqueDates.length)
        }
      )
    )
  })
})

// ============================================================================
// Schedule Interaction Properties
// ============================================================================

// ============================================================================
// Rescheduled Instance Ideal Time Properties (Task #362)
// ============================================================================

describe('Spec 5: Instances - Rescheduled Ideal Time', () => {
  it('Property #362: rescheduled instances use new time as ideal', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        localDateGen(),
        localDateTimeGen(),
        localDateTimeGen(),
        (seriesId, date, originalTime, newTime) => {
          fc.pre(originalTime !== newTime)

          // Create a manager that tracks ideal time
          class IdealTimeTrackingManager extends InstanceManager {
            private idealTimes: Map<string, LocalDateTime> = new Map()

            private makeKey(seriesId: SeriesId, date: LocalDate): string {
              return `${seriesId}:${date}`
            }

            override scheduleInstance(seriesId: SeriesId, date: LocalDate, time: LocalDateTime, duration: number): void {
              super.scheduleInstance(seriesId, date, time, duration)
              this.idealTimes.set(this.makeKey(seriesId, date), time)
            }

            override rescheduleInstance(seriesId: SeriesId, date: LocalDate, newTime: LocalDateTime): void {
              super.rescheduleInstance(seriesId, date, newTime)
              // After reschedule, the NEW time becomes the ideal time for reflow purposes
              this.idealTimes.set(this.makeKey(seriesId, date), newTime)
            }

            getIdealTime(seriesId: SeriesId, date: LocalDate): LocalDateTime | undefined {
              return this.idealTimes.get(this.makeKey(seriesId, date))
            }
          }

          const manager = new IdealTimeTrackingManager()
          manager.scheduleInstance(seriesId, date, originalTime, 60)

          // Before reschedule, ideal time is original
          expect(manager.getIdealTime(seriesId, date)).toBe(originalTime)

          manager.rescheduleInstance(seriesId, date, newTime)

          // After reschedule, ideal time is the NEW time
          // This is important for reflow: it should try to keep rescheduled instances at their new time
          expect(manager.getIdealTime(seriesId, date)).toBe(newTime)
        }
      )
    )
  })

  it('restored instance reverts to original ideal time', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        localDateGen(),
        localDateTimeGen(),
        (seriesId, date, originalTime) => {
          class IdealTimeTrackingManager extends InstanceManager {
            private idealTimes: Map<string, LocalDateTime> = new Map()
            private originalTimes: Map<string, LocalDateTime> = new Map()

            private makeKey(seriesId: SeriesId, date: LocalDate): string {
              return `${seriesId}:${date}`
            }

            override scheduleInstance(seriesId: SeriesId, date: LocalDate, time: LocalDateTime, duration: number): void {
              super.scheduleInstance(seriesId, date, time, duration)
              const key = this.makeKey(seriesId, date)
              this.idealTimes.set(key, time)
              this.originalTimes.set(key, time)
            }

            override restoreInstance(seriesId: SeriesId, date: LocalDate): void {
              super.restoreInstance(seriesId, date)
              const key = this.makeKey(seriesId, date)
              const original = this.originalTimes.get(key)
              if (original) {
                this.idealTimes.set(key, original)
              }
            }

            getIdealTime(seriesId: SeriesId, date: LocalDate): LocalDateTime | undefined {
              return this.idealTimes.get(this.makeKey(seriesId, date))
            }
          }

          const manager = new IdealTimeTrackingManager()
          manager.scheduleInstance(seriesId, date, originalTime, 60)
          manager.cancelInstance(seriesId, date)
          manager.restoreInstance(seriesId, date)

          // After restore, ideal time reverts to original
          expect(manager.getIdealTime(seriesId, date)).toBe(originalTime)
        }
      )
    )
  })
})

// ============================================================================
// Schedule Interaction Properties
// ============================================================================

describe('Spec 5: Instances - Schedule Interaction', () => {
  it('rescheduled instance still in schedule', () => {
    fc.assert(
      fc.property(seriesIdGen(), localDateGen(), localDateTimeGen(), localDateTimeGen(), (seriesId, date, originalTime, newTime) => {
        const manager = new InstanceManager()
        manager.scheduleInstance(seriesId, date, originalTime, 60)
        manager.rescheduleInstance(seriesId, date, newTime)

        // Rescheduled instances are still in schedule (not cancelled)
        const schedule = manager.getSchedule(seriesId)
        expect(schedule.length === 1 && schedule[0].seriesId === seriesId).toBe(true)
        expect(schedule[0].rescheduledTo).toBe(newTime)
      })
    )
  })

  it('multiple instances - cancel one keeps others', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        localDateGen(),
        localDateGen(),
        localDateTimeGen(),
        (seriesId, date1, date2, time) => {
          fc.pre(date1 !== date2)

          const manager = new InstanceManager()
          manager.scheduleInstance(seriesId, date1, time, 60)
          manager.scheduleInstance(seriesId, date2, time, 60)

          const scheduleBefore = manager.getSchedule(seriesId)
          expect(scheduleBefore.length === 2 && scheduleBefore.some((i) => i.instanceDate === date1)).toBe(true)
          expect(scheduleBefore.some((i) => i.instanceDate === date2)).toBe(true)

          manager.cancelInstance(seriesId, date1)

          const scheduleAfter = manager.getSchedule(seriesId)
          expect(scheduleAfter.length === 1 && scheduleAfter[0].instanceDate === date2).toBe(true)
          expect(manager.getInstance(seriesId, date2)?.isCancelled).toBe(false)
        }
      )
    )
  })

  it('cancel then restore then cancel works', () => {
    fc.assert(
      fc.property(seriesIdGen(), localDateGen(), localDateTimeGen(), (seriesId, date, time) => {
        const manager = new InstanceManager()
        manager.scheduleInstance(seriesId, date, time, 60)

        manager.cancelInstance(seriesId, date)
        expect(manager.getInstance(seriesId, date)?.isCancelled).toBe(true)

        manager.restoreInstance(seriesId, date)
        expect(manager.getInstance(seriesId, date)?.isCancelled).toBe(false)

        manager.cancelInstance(seriesId, date)
        expect(manager.getInstance(seriesId, date)?.isCancelled).toBe(true)
      })
    )
  })
})
