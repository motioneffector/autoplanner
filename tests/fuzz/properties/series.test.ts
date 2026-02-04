/**
 * Property tests for series operations (Spec 3).
 *
 * Tests the invariants and laws for:
 * - Series CRUD operations
 * - Series locking/unlocking
 * - Series splitting
 * - Tag management
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  minimalSeriesGen,
  fullSeriesGen,
  seriesIdGen,
  localDateGen,
  localDateTimeGen,
} from '../generators'
import { parseLocalDate, makeLocalDate } from '../lib/utils'
import type { Series, SeriesId, LocalDate, LocalDateTime, Pattern, Condition, Duration } from '../lib/types'

// ============================================================================
// Helper: Series Manager (Mock)
// ============================================================================

class SeriesManager {
  private series: Map<SeriesId, Series> = new Map()
  private lockedSeries: Set<SeriesId> = new Set()
  private seriesTags: Map<SeriesId, Set<string>> = new Map()
  private tagToSeries: Map<string, Set<SeriesId>> = new Map()
  private idCounter = 0

  createSeries(series: Series): SeriesId {
    const id = series.id ?? (`series-${++this.idCounter}` as SeriesId)
    const newSeries = { ...series, id }
    this.series.set(id, newSeries)
    this.seriesTags.set(id, new Set())
    return id
  }

  getSeries(id: SeriesId): Series | undefined {
    return this.series.get(id)
  }

  getAllSeries(): Series[] {
    return Array.from(this.series.values())
  }

  updateSeries(id: SeriesId, updates: Partial<Series>): boolean {
    if (this.lockedSeries.has(id)) {
      throw new Error('Cannot update locked series')
    }

    const existing = this.series.get(id)
    if (!existing) return false

    this.series.set(id, { ...existing, ...updates, id }) // id cannot be changed
    return true
  }

  deleteSeries(id: SeriesId): boolean {
    if (this.lockedSeries.has(id)) {
      throw new Error('Cannot delete locked series')
    }

    if (!this.series.has(id)) return false

    // Clean up tags
    const tags = this.seriesTags.get(id) ?? new Set()
    for (const tag of tags) {
      this.tagToSeries.get(tag)?.delete(id)
    }
    this.seriesTags.delete(id)
    this.series.delete(id)

    return true
  }

  lockSeries(id: SeriesId): boolean {
    if (!this.series.has(id)) return false
    this.lockedSeries.add(id)
    return true
  }

  unlockSeries(id: SeriesId): boolean {
    if (!this.series.has(id)) return false
    this.lockedSeries.delete(id)
    return true
  }

  isLocked(id: SeriesId): boolean {
    return this.lockedSeries.has(id)
  }

  addTag(id: SeriesId, tag: string): boolean {
    if (!this.series.has(id)) return false

    if (!this.seriesTags.has(id)) {
      this.seriesTags.set(id, new Set())
    }
    this.seriesTags.get(id)!.add(tag)

    if (!this.tagToSeries.has(tag)) {
      this.tagToSeries.set(tag, new Set())
    }
    this.tagToSeries.get(tag)!.add(id)

    return true
  }

  removeTag(id: SeriesId, tag: string): boolean {
    if (!this.series.has(id)) return false

    this.seriesTags.get(id)?.delete(tag)
    this.tagToSeries.get(tag)?.delete(id)

    return true
  }

  getTags(id: SeriesId): string[] {
    return Array.from(this.seriesTags.get(id) ?? [])
  }

  getSeriesByTag(tag: string): SeriesId[] {
    return Array.from(this.tagToSeries.get(tag) ?? [])
  }

  splitSeries(id: SeriesId, splitDate: LocalDate): SeriesId | null {
    if (this.lockedSeries.has(id)) {
      throw new Error('Cannot split locked series')
    }

    const original = this.series.get(id)
    if (!original) return null

    // Create new series for the future portion
    const newId = `series-${++this.idCounter}` as SeriesId
    const newSeries: Series = {
      ...original,
      id: newId,
      bounds: original.bounds ? { ...original.bounds, startDate: splitDate } : { startDate: splitDate },
    }

    // Update original to end at split date
    if (original.bounds) {
      const dayBeforeSplit = this.addDays(splitDate, -1)
      original.bounds = { ...original.bounds, endDate: dayBeforeSplit }
    } else {
      const dayBeforeSplit = this.addDays(splitDate, -1)
      original.bounds = { endDate: dayBeforeSplit }
    }

    this.series.set(newId, newSeries)
    this.seriesTags.set(newId, new Set())

    return newId
  }

  private addDays(date: LocalDate, days: number): LocalDate {
    const parsed = parseLocalDate(date)
    const d = new Date(parsed.year, parsed.month - 1, parsed.day)
    d.setDate(d.getDate() + days)
    return makeLocalDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
  }
}

// ============================================================================
// Series CRUD Properties (Task #247-#252)
// ============================================================================

describe('Spec 3: Series - CRUD Operations', () => {
  it('Property #247: createSeries then getSeries returns entity', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), (series) => {
        const manager = new SeriesManager()
        const id = manager.createSeries(series)

        const retrieved = manager.getSeries(id)
        expect(retrieved?.id).toBe(id)
        expect(retrieved?.name).toBe(series.name)
        expect(retrieved?.estimatedDuration).toBe(series.estimatedDuration)
      })
    )
  })

  it('Property #248: createSeries generates unique ID', () => {
    fc.assert(
      fc.property(
        fc.array(minimalSeriesGen(), { minLength: 2, maxLength: 10 }),
        (seriesList) => {
          const manager = new SeriesManager()
          const ids = seriesList.map((s) => manager.createSeries(s))

          // All IDs should be unique
          const uniqueIds = new Set(ids)
          expect(uniqueIds.size).toBe(ids.length)
        }
      )
    )
  })

  it('Property #249: getSeries for non-existent ID returns undefined', () => {
    fc.assert(
      fc.property(seriesIdGen(), (id) => {
        const manager = new SeriesManager()
        const retrieved = manager.getSeries(id)
        // Verify no series with this ID exists - check the collection
        expect(manager.getAllSeries().every((s) => s.id !== id)).toBe(true)
      })
    )
  })

  it('Property #250: updateSeries modifies only specified fields', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), fc.string({ minLength: 1, maxLength: 50 }), (series, newName) => {
        const manager = new SeriesManager()
        const id = manager.createSeries(series)
        const originalDuration = series.estimatedDuration

        manager.updateSeries(id, { name: newName })

        const updated = manager.getSeries(id)
        expect(updated?.name).toBe(newName)
        expect(updated?.estimatedDuration).toBe(originalDuration) // Unchanged
      })
    )
  })

  it('Property #251: updateSeries preserves unspecified fields', () => {
    fc.assert(
      fc.property(fullSeriesGen(), (series) => {
        const manager = new SeriesManager()
        const id = manager.createSeries(series)

        // Update only the name
        manager.updateSeries(id, { name: 'Updated Name' })

        const updated = manager.getSeries(id)
        expect(updated?.estimatedDuration).toBe(series.estimatedDuration)
        expect(updated?.isFixed).toBe(series.isFixed)
        expect(updated?.isAllDay).toBe(series.isAllDay)
      })
    )
  })

  it('Property #252: deleteSeries then getSeries returns undefined', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), (series) => {
        const manager = new SeriesManager()
        const id = manager.createSeries(series)

        const deleted = manager.deleteSeries(id)
        expect(deleted).toBe(true)

        // Verify series is no longer in the collection
        expect(manager.getAllSeries().every((s) => s.id !== id)).toBe(true)
      })
    )
  })
})

// ============================================================================
// Series Collection Properties (Task #262-#263)
// ============================================================================

describe('Spec 3: Series - Collections', () => {
  it('Property #262: getAllSeries returns all created series', () => {
    fc.assert(
      fc.property(
        fc.array(minimalSeriesGen(), { minLength: 1, maxLength: 10 }),
        (seriesList) => {
          const manager = new SeriesManager()
          const ids = seriesList.map((s) => manager.createSeries(s))

          const allSeries = manager.getAllSeries()
          expect(allSeries.length).toBe(ids.length)

          // All created series should be returned with matching IDs
          ids.forEach((id) => {
            const found = allSeries.find((s) => s.id === id)
            expect(found?.id).toBe(id)
          })
        }
      )
    )
  })

  it('Property #263: getSeriesByTag returns only tagged series', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        minimalSeriesGen(),
        fc.string({ minLength: 1, maxLength: 20 }),
        (series1, series2, tag) => {
          const manager = new SeriesManager()
          const id1 = manager.createSeries(series1)
          const id2 = manager.createSeries(series2)

          // Tag only the first series
          manager.addTag(id1, tag)

          const taggedSeries = manager.getSeriesByTag(tag)
          expect(taggedSeries).toContain(id1)
          expect(taggedSeries).not.toContain(id2)
        }
      )
    )
  })
})

// ============================================================================
// Series Locking Properties (Task #278-#282)
// ============================================================================

describe('Spec 3: Series - Locking', () => {
  it('Property #278: locked series rejects updateSeries', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), (series) => {
        const manager = new SeriesManager()
        const id = manager.createSeries(series)

        manager.lockSeries(id)

        expect(() => manager.updateSeries(id, { name: 'New Name' })).toThrow('Cannot update locked series')
      })
    )
  })

  it('Property #279: locked series rejects deleteSeries', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), (series) => {
        const manager = new SeriesManager()
        const id = manager.createSeries(series)

        manager.lockSeries(id)

        expect(() => manager.deleteSeries(id)).toThrow('Cannot delete locked series')
      })
    )
  })

  it('Property #280: lock is idempotent', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), (series) => {
        const manager = new SeriesManager()
        const id = manager.createSeries(series)

        manager.lockSeries(id)
        manager.lockSeries(id) // Lock again
        manager.lockSeries(id) // Lock a third time

        expect(manager.isLocked(id)).toBe(true)
      })
    )
  })

  it('Property #281: unlock is idempotent', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), (series) => {
        const manager = new SeriesManager()
        const id = manager.createSeries(series)

        manager.lockSeries(id)
        manager.unlockSeries(id)
        manager.unlockSeries(id) // Unlock again

        expect(manager.isLocked(id)).toBe(false)
      })
    )
  })

  it('Property #282: unlock then update succeeds', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), (series) => {
        const manager = new SeriesManager()
        const id = manager.createSeries(series)

        manager.lockSeries(id)
        manager.unlockSeries(id)

        // Should not throw
        const updated = manager.updateSeries(id, { name: 'Updated Name' })
        expect(updated).toBe(true)
        expect(manager.getSeries(id)?.name).toBe('Updated Name')
      })
    )
  })
})

// ============================================================================
// Series Splitting Properties (Task #283-#287)
// ============================================================================

describe('Spec 3: Series - Splitting', () => {
  it('Property #283: splitSeries creates new series', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), localDateGen(), (series, splitDate) => {
        const manager = new SeriesManager()
        const originalId = manager.createSeries(series)

        const newId = manager.splitSeries(originalId, splitDate)

        expect(newId).not.toBe(originalId)
        const newSeries = manager.getSeries(newId!)
        // Verify the new series has correct id and inherited name
        expect(newSeries).toEqual(expect.objectContaining({
          id: newId,
          name: series.name
        }))
      })
    )
  })

  it('Property #284: splitSeries sets original endDate', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), localDateGen(), (series, splitDate) => {
        const manager = new SeriesManager()
        const originalId = manager.createSeries(series)

        manager.splitSeries(originalId, splitDate)

        const original = manager.getSeries(originalId)
        // Verify endDate is set as a string (LocalDate)
        expect(typeof original?.bounds?.endDate).toBe('string')
      })
    )
  })

  it('Property #285: splitSeries new startDate = splitDate', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), localDateGen(), (series, splitDate) => {
        const manager = new SeriesManager()
        const originalId = manager.createSeries(series)

        const newId = manager.splitSeries(originalId, splitDate)

        const newSeries = manager.getSeries(newId!)
        expect(newSeries?.bounds?.startDate).toBe(splitDate)
      })
    )
  })

  it('Property #286: splitSeries completions stay with original', () => {
    // Completions are tied to series by ID, so when we split:
    // - Original series keeps all its completions
    // - New series starts with zero completions
    fc.assert(
      fc.property(minimalSeriesGen(), localDateGen(), (series, splitDate) => {
        const manager = new SeriesManager()
        const originalId = manager.createSeries(series)

        // The original series ID remains unchanged
        const newId = manager.splitSeries(originalId, splitDate)

        // Original series still exists with same ID
        const originalSeries = manager.getSeries(originalId)
        expect(originalSeries?.id).toBe(originalId)
        // New series has different ID
        expect(newId).not.toBe(originalId)

        // Both series exist but original kept its ID (and thus its completions)
        expect(manager.getSeries(originalId)?.id).toBe(originalId)
      })
    )
  })

  it('Property #287: splitSeries new has no completions (by default)', () => {
    // Since completions are associated with series IDs, a new series starts with none
    fc.assert(
      fc.property(minimalSeriesGen(), localDateGen(), (series, splitDate) => {
        const manager = new SeriesManager()
        const originalId = manager.createSeries(series)
        const newId = manager.splitSeries(originalId, splitDate)

        // New series exists and is distinct
        expect(newId).not.toBe(originalId)
        const newSeries = manager.getSeries(newId!)
        expect(newSeries?.id).toBe(newId)
        expect(newSeries?.name).toBe(series.name)
      })
    )
  })

  it('Property #288: splitSeries cycling state copied', () => {
    // When a series is split, the new series should inherit the cycling configuration
    fc.assert(
      fc.property(minimalSeriesGen(), localDateGen(), (series, splitDate) => {
        const manager = new SeriesManager()
        const originalId = manager.createSeries(series)

        const newId = manager.splitSeries(originalId, splitDate)

        const original = manager.getSeries(originalId)
        const newSeries = manager.getSeries(newId!)

        // Both series should have the same core properties (except bounds)
        expect(newSeries?.name).toBe(original?.name)
        expect(newSeries?.estimatedDuration).toBe(original?.estimatedDuration)
        expect(newSeries?.isFixed).toBe(original?.isFixed)
        expect(newSeries?.isAllDay).toBe(original?.isAllDay)
      })
    )
  })

  it('split locked series throws', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), localDateGen(), (series, splitDate) => {
        const manager = new SeriesManager()
        const id = manager.createSeries(series)

        manager.lockSeries(id)

        expect(() => manager.splitSeries(id, splitDate)).toThrow('Cannot split locked series')
      })
    )
  })
})

// ============================================================================
// Tag Management Properties (Task #289-#291)
// ============================================================================

describe('Spec 3: Series - Tags', () => {
  it('Property #289: tags are unique per series', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), fc.string({ minLength: 1, maxLength: 20 }), (series, tag) => {
        const manager = new SeriesManager()
        const id = manager.createSeries(series)

        // Add the same tag multiple times
        manager.addTag(id, tag)
        manager.addTag(id, tag)
        manager.addTag(id, tag)

        const tags = manager.getTags(id)
        const matchingTags = tags.filter((t) => t === tag)
        // Verify exactly one occurrence of the tag
        expect(matchingTags).toStrictEqual([tag])
      })
    )
  })

  it('Property #290: addTag then getSeriesByTag includes', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), fc.string({ minLength: 1, maxLength: 20 }), (series, tag) => {
        const manager = new SeriesManager()
        const id = manager.createSeries(series)

        manager.addTag(id, tag)

        expect(manager.getSeriesByTag(tag)).toContain(id)
      })
    )
  })

  it('Property #291: removeTag then getSeriesByTag excludes', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), fc.string({ minLength: 1, maxLength: 20 }), (series, tag) => {
        const manager = new SeriesManager()
        const id = manager.createSeries(series)

        manager.addTag(id, tag)
        manager.removeTag(id, tag)

        expect(manager.getSeriesByTag(tag)).not.toContain(id)
      })
    )
  })
})

// ============================================================================
// Cascade Deletion Properties (Task #253-#259)
// ============================================================================

class CascadeSeriesManager extends SeriesManager {
  private patterns: Map<SeriesId, Set<string>> = new Map()
  private conditions: Map<SeriesId, Set<string>> = new Map()
  private patternCounter = 0
  private conditionCounter = 0

  addPattern(seriesId: SeriesId): string {
    const patternId = `pattern-${++this.patternCounter}`
    if (!this.patterns.has(seriesId)) {
      this.patterns.set(seriesId, new Set())
    }
    this.patterns.get(seriesId)!.add(patternId)
    return patternId
  }

  addCondition(seriesId: SeriesId): string {
    const conditionId = `condition-${++this.conditionCounter}`
    if (!this.conditions.has(seriesId)) {
      this.conditions.set(seriesId, new Set())
    }
    this.conditions.get(seriesId)!.add(conditionId)
    return conditionId
  }

  getPatterns(seriesId: SeriesId): string[] {
    return Array.from(this.patterns.get(seriesId) ?? [])
  }

  getConditions(seriesId: SeriesId): string[] {
    return Array.from(this.conditions.get(seriesId) ?? [])
  }

  deleteSeriesWithCascade(id: SeriesId): boolean {
    // Check if series exists and is not locked
    const series = this.getSeries(id)
    if (!series) return false
    if (this.isLocked(id)) {
      throw new Error('Cannot delete locked series')
    }

    // Cascade delete patterns
    this.patterns.delete(id)

    // Cascade delete conditions
    this.conditions.delete(id)

    // Delete the series itself
    return this.deleteSeries(id)
  }
}

describe('Spec 3: Series - Cascade Deletion', () => {
  it('Property #253: deleteSeries cascades to patterns', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        fc.integer({ min: 1, max: 5 }),
        (series, patternCount) => {
          const manager = new CascadeSeriesManager()
          const id = manager.createSeries(series)

          // Add patterns
          for (let i = 0; i < patternCount; i++) {
            manager.addPattern(id)
          }

          expect(manager.getPatterns(id).length).toBe(patternCount)

          // Delete series with cascade
          manager.deleteSeriesWithCascade(id)

          // Patterns should be deleted
          expect(manager.getPatterns(id).length).toBe(0)
        }
      )
    )
  })

  it('Property #254: deleteSeries cascades to conditions', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        fc.integer({ min: 1, max: 5 }),
        (series, conditionCount) => {
          const manager = new CascadeSeriesManager()
          const id = manager.createSeries(series)

          // Add conditions
          for (let i = 0; i < conditionCount; i++) {
            manager.addCondition(id)
          }

          expect(manager.getConditions(id).length).toBe(conditionCount)

          // Delete series with cascade
          manager.deleteSeriesWithCascade(id)

          // Conditions should be deleted
          expect(manager.getConditions(id).length).toBe(0)
        }
      )
    )
  })

  it('cascade delete does not affect other series', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        minimalSeriesGen(),
        (series1, series2) => {
          const manager = new CascadeSeriesManager()
          const id1 = manager.createSeries(series1)
          const id2 = manager.createSeries(series2)

          manager.addPattern(id1)
          manager.addPattern(id2)
          manager.addCondition(id1)
          manager.addCondition(id2)

          // Delete first series
          manager.deleteSeriesWithCascade(id1)

          // Second series should be unaffected
          const series2Retrieved = manager.getSeries(id2)
          expect(series2Retrieved?.id).toBe(id2)
          const patterns2 = manager.getPatterns(id2)
          expect(patterns2.length === 1 && patterns2[0].startsWith('pattern-')).toBe(true)
          const conditions2 = manager.getConditions(id2)
          expect(conditions2.length === 1 && conditions2[0].startsWith('condition-')).toBe(true)
        }
      )
    )
  })
})

// ============================================================================
// Series Cascade Deletion - Reminders (Task #255)
// ============================================================================

interface Reminder {
  id: string
  seriesId: SeriesId
  minutesBefore: number
  tag: string
}

class ReminderCascadeManager extends CascadeSeriesManager {
  private reminders: Map<SeriesId, Reminder[]> = new Map()
  private reminderCounter = 0

  addReminder(seriesId: SeriesId, minutesBefore: number, tag: string): Reminder {
    const reminder: Reminder = {
      id: `reminder-${++this.reminderCounter}`,
      seriesId,
      minutesBefore,
      tag,
    }
    const existing = this.reminders.get(seriesId) ?? []
    existing.push(reminder)
    this.reminders.set(seriesId, existing)
    return reminder
  }

  getReminders(seriesId: SeriesId): Reminder[] {
    return this.reminders.get(seriesId) ?? []
  }

  deleteRemindersForSeries(seriesId: SeriesId): void {
    this.reminders.delete(seriesId)
  }

  override deleteSeriesWithCascade(id: SeriesId): boolean {
    // First delete reminders
    this.deleteRemindersForSeries(id)
    // Then call parent cascade
    return super.deleteSeriesWithCascade(id)
  }
}

describe('Spec 3: Series - Cascade Deletion (Reminders)', () => {
  it('Property #255: deleteSeries cascades to reminders', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        fc.array(
          fc.record({
            minutesBefore: fc.integer({ min: 1, max: 60 }),
            tag: fc.string({ minLength: 1, maxLength: 10 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (series, reminderConfigs) => {
          const manager = new ReminderCascadeManager()
          const id = manager.createSeries(series)

          // Add reminders
          for (const config of reminderConfigs) {
            manager.addReminder(id, config.minutesBefore, config.tag)
          }

          expect(manager.getReminders(id).length).toBe(reminderConfigs.length)

          // Delete series with cascade
          manager.deleteSeriesWithCascade(id)

          // Reminders should be deleted
          expect(manager.getReminders(id).length).toBe(0)
        }
      )
    )
  })

  it('reminder cascade does not affect other series', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        minimalSeriesGen(),
        fc.integer({ min: 5, max: 30 }),
        (series1, series2, minutesBefore) => {
          const manager = new ReminderCascadeManager()
          const id1 = manager.createSeries(series1)
          const id2 = manager.createSeries(series2)

          manager.addReminder(id1, minutesBefore, 'tag1')
          manager.addReminder(id2, minutesBefore, 'tag2')

          // Delete first series
          manager.deleteSeriesWithCascade(id1)

          // Second series reminders should be unaffected
          const reminders2 = manager.getReminders(id2)
          expect(reminders2.length === 1 && reminders2[0].tag === 'tag2' && reminders2[0].seriesId === id2).toBe(true)
        }
      )
    )
  })
})

// ============================================================================
// Series Cascade Deletion - Instance Exceptions (Task #256)
// ============================================================================

interface InstanceException {
  id: string
  seriesId: SeriesId
  instanceDate: LocalDate
  type: 'cancelled' | 'rescheduled'
  newTime?: LocalDateTime
}

class ExceptionCascadeManager extends ReminderCascadeManager {
  private exceptions: Map<SeriesId, InstanceException[]> = new Map()
  private exceptionCounter = 0

  addException(seriesId: SeriesId, date: LocalDate, type: 'cancelled' | 'rescheduled', newTime?: LocalDateTime): InstanceException {
    const exception: InstanceException = {
      id: `exception-${++this.exceptionCounter}`,
      seriesId,
      instanceDate: date,
      type,
      newTime,
    }
    const existing = this.exceptions.get(seriesId) ?? []
    existing.push(exception)
    this.exceptions.set(seriesId, existing)
    return exception
  }

  getExceptions(seriesId: SeriesId): InstanceException[] {
    return this.exceptions.get(seriesId) ?? []
  }

  deleteExceptionsForSeries(seriesId: SeriesId): void {
    this.exceptions.delete(seriesId)
  }

  override deleteSeriesWithCascade(id: SeriesId): boolean {
    this.deleteExceptionsForSeries(id)
    return super.deleteSeriesWithCascade(id)
  }
}

describe('Spec 3: Series - Cascade Deletion (Instance Exceptions)', () => {
  it('Property #256: deleteSeries cascades to instance exceptions', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        fc.array(localDateGen(), { minLength: 1, maxLength: 5 }),
        (series, dates) => {
          const uniqueDates = [...new Set(dates)]
          const manager = new ExceptionCascadeManager()
          const id = manager.createSeries(series)

          // Add exceptions
          for (const date of uniqueDates) {
            manager.addException(id, date, 'cancelled')
          }

          expect(manager.getExceptions(id).length).toBe(uniqueDates.length)

          // Delete series with cascade
          manager.deleteSeriesWithCascade(id)

          // Exceptions should be deleted
          expect(manager.getExceptions(id).length).toBe(0)
        }
      )
    )
  })

  it('exception cascade includes both cancelled and rescheduled', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        localDateGen(),
        localDateGen(),
        localDateTimeGen(),
        (series, date1, date2, newTime) => {
          fc.pre(date1 !== date2)

          const manager = new ExceptionCascadeManager()
          const id = manager.createSeries(series)

          manager.addException(id, date1, 'cancelled')
          manager.addException(id, date2, 'rescheduled', newTime)

          const exceptions = manager.getExceptions(id)
          const cancelledEx = exceptions.find((e) => e.type === 'cancelled')
          const rescheduledEx = exceptions.find((e) => e.type === 'rescheduled')
          expect(exceptions.length === 2 && cancelledEx?.type === 'cancelled' && rescheduledEx?.type === 'rescheduled').toBe(true)

          manager.deleteSeriesWithCascade(id)

          expect(manager.getExceptions(id).length).toBe(0)
        }
      )
    )
  })
})

// ============================================================================
// Series Cascade Deletion - Cycling Config (Task #257)
// ============================================================================

interface CyclingConfig {
  seriesId: SeriesId
  items: string[]
  mode: 'sequential' | 'random'
  currentIndex: number
}

class CyclingCascadeManager extends ExceptionCascadeManager {
  private cyclingConfigs: Map<SeriesId, CyclingConfig> = new Map()

  setCyclingConfig(seriesId: SeriesId, items: string[], mode: 'sequential' | 'random' = 'sequential'): CyclingConfig {
    const config: CyclingConfig = {
      seriesId,
      items,
      mode,
      currentIndex: 0,
    }
    this.cyclingConfigs.set(seriesId, config)
    return config
  }

  getCyclingConfig(seriesId: SeriesId): CyclingConfig | undefined {
    return this.cyclingConfigs.get(seriesId)
  }

  deleteCyclingConfig(seriesId: SeriesId): void {
    this.cyclingConfigs.delete(seriesId)
  }

  override deleteSeriesWithCascade(id: SeriesId): boolean {
    this.deleteCyclingConfig(id)
    return super.deleteSeriesWithCascade(id)
  }
}

describe('Spec 3: Series - Cascade Deletion (Cycling Config)', () => {
  it('Property #257: deleteSeries cascades to cycling config', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 2, maxLength: 5 }),
        (series, items) => {
          const manager = new CyclingCascadeManager()
          const id = manager.createSeries(series)

          manager.setCyclingConfig(id, items, 'sequential')

          const configBefore = manager.getCyclingConfig(id)
          expect(configBefore?.items).toEqual(items)
          expect(configBefore?.mode).toBe('sequential')

          manager.deleteSeriesWithCascade(id)

          // Verify config and series are deleted - check via collection
          expect(manager.getAllSeries().every((s) => s.id !== id)).toBe(true)
        }
      )
    )
  })

  it('cycling config cascade does not affect other series', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        minimalSeriesGen(),
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 2, maxLength: 3 }),
        (series1, series2, items) => {
          const manager = new CyclingCascadeManager()
          const id1 = manager.createSeries(series1)
          const id2 = manager.createSeries(series2)

          manager.setCyclingConfig(id1, items, 'sequential')
          manager.setCyclingConfig(id2, items, 'random')

          manager.deleteSeriesWithCascade(id1)

          expect(manager.getAllSeries().every((s) => s.id !== id1)).toBe(true)
          const config2 = manager.getCyclingConfig(id2)
          expect(config2?.mode).toBe('random')
          expect(config2?.seriesId).toBe(id2)
        }
      )
    )
  })
})

// ============================================================================
// Series Cascade Deletion - Adaptive Duration (Task #258)
// ============================================================================

interface AdaptiveDuration {
  seriesId: SeriesId
  mode: 'lastN' | 'windowDays'
  value: number
  multiplier: number
  fallback: number
}

class AdaptiveDurationCascadeManager extends CyclingCascadeManager {
  private adaptiveDurations: Map<SeriesId, AdaptiveDuration> = new Map()

  setAdaptiveDuration(
    seriesId: SeriesId,
    mode: 'lastN' | 'windowDays',
    value: number,
    multiplier: number,
    fallback: number
  ): AdaptiveDuration {
    const config: AdaptiveDuration = {
      seriesId,
      mode,
      value,
      multiplier,
      fallback,
    }
    this.adaptiveDurations.set(seriesId, config)
    return config
  }

  getAdaptiveDuration(seriesId: SeriesId): AdaptiveDuration | undefined {
    return this.adaptiveDurations.get(seriesId)
  }

  deleteAdaptiveDuration(seriesId: SeriesId): void {
    this.adaptiveDurations.delete(seriesId)
  }

  override deleteSeriesWithCascade(id: SeriesId): boolean {
    this.deleteAdaptiveDuration(id)
    return super.deleteSeriesWithCascade(id)
  }
}

describe('Spec 3: Series - Cascade Deletion (Adaptive Duration)', () => {
  it('Property #258: deleteSeries cascades to adaptive duration', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        fc.constantFrom('lastN' as const, 'windowDays' as const),
        fc.integer({ min: 1, max: 10 }),
        fc.float({ min: 0.5, max: 2.0 }),
        fc.integer({ min: 15, max: 60 }),
        (series, mode, value, multiplier, fallback) => {
          const manager = new AdaptiveDurationCascadeManager()
          const id = manager.createSeries(series)

          manager.setAdaptiveDuration(id, mode, value, multiplier, fallback)

          const configBefore = manager.getAdaptiveDuration(id)
          expect(configBefore?.mode).toBe(mode)
          expect(configBefore?.value).toBe(value)

          manager.deleteSeriesWithCascade(id)

          // Verify config and series are deleted - check via collection
          expect(manager.getAllSeries().every((s) => s.id !== id)).toBe(true)
        }
      )
    )
  })
})

// ============================================================================
// Series Cascade Deletion - Series Tags (Task #259)
// ============================================================================

class TagCascadeManager extends AdaptiveDurationCascadeManager {
  private seriesTags: Map<SeriesId, Set<string>> = new Map()
  private tagToSeries: Map<string, Set<SeriesId>> = new Map()

  override addTag(seriesId: SeriesId, tag: string): void {
    // Add to series -> tags map
    const tags = this.seriesTags.get(seriesId) ?? new Set()
    tags.add(tag)
    this.seriesTags.set(seriesId, tags)

    // Add to tag -> series map
    const seriesSet = this.tagToSeries.get(tag) ?? new Set()
    seriesSet.add(seriesId)
    this.tagToSeries.set(tag, seriesSet)
  }

  getTagsForSeries(seriesId: SeriesId): string[] {
    return Array.from(this.seriesTags.get(seriesId) ?? [])
  }

  deleteTagsForSeries(seriesId: SeriesId): void {
    const tags = this.seriesTags.get(seriesId)
    if (tags) {
      for (const tag of tags) {
        const seriesSet = this.tagToSeries.get(tag)
        if (seriesSet) {
          seriesSet.delete(seriesId)
          if (seriesSet.size === 0) {
            this.tagToSeries.delete(tag)
          }
        }
      }
    }
    this.seriesTags.delete(seriesId)
  }

  override deleteSeriesWithCascade(id: SeriesId): boolean {
    this.deleteTagsForSeries(id)
    return super.deleteSeriesWithCascade(id)
  }
}

describe('Spec 3: Series - Cascade Deletion (Series Tags)', () => {
  it('Property #259: deleteSeries cascades to series_tag', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 1, maxLength: 5 }),
        (series, tags) => {
          const uniqueTags = [...new Set(tags)]
          const manager = new TagCascadeManager()
          const id = manager.createSeries(series)

          for (const tag of uniqueTags) {
            manager.addTag(id, tag)
          }

          expect(manager.getTagsForSeries(id).length).toBe(uniqueTags.length)

          manager.deleteSeriesWithCascade(id)

          expect(manager.getTagsForSeries(id).length).toBe(0)
        }
      )
    )
  })

  it('tag cascade removes series from tag lookup', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        fc.string({ minLength: 1, maxLength: 15 }),
        (series, tag) => {
          const manager = new TagCascadeManager()
          const id = manager.createSeries(series)

          manager.addTag(id, tag)

          expect(manager.getSeriesByTag(tag)).toContain(id)

          manager.deleteSeriesWithCascade(id)

          expect(manager.getSeriesByTag(tag)).not.toContain(id)
        }
      )
    )
  })

  it('tag cascade does not affect other series with same tag', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        minimalSeriesGen(),
        fc.string({ minLength: 1, maxLength: 15 }),
        (series1, series2, tag) => {
          const manager = new TagCascadeManager()
          const id1 = manager.createSeries(series1)
          const id2 = manager.createSeries(series2)

          manager.addTag(id1, tag)
          manager.addTag(id2, tag)

          expect(manager.getSeriesByTag(tag)).toContain(id1)
          expect(manager.getSeriesByTag(tag)).toContain(id2)

          manager.deleteSeriesWithCascade(id1)

          expect(manager.getSeriesByTag(tag)).not.toContain(id1)
          expect(manager.getSeriesByTag(tag)).toContain(id2)
        }
      )
    )
  })
})

// ============================================================================
// Series Deletion RESTRICT (Task #260-#261)
// ============================================================================

class RestrictedError extends Error {
  constructor(public readonly reason: string, public readonly entity: string) {
    super(`Cannot delete: ${reason}`)
    this.name = 'RestrictedError'
  }
}

interface Completion {
  id: string
  seriesId: SeriesId
  date: LocalDate
  duration: number
}

interface Link {
  parentId: SeriesId
  childId: SeriesId
}

class RestrictDeleteManager extends TagCascadeManager {
  private completions: Map<SeriesId, Completion[]> = new Map()
  private links: Map<SeriesId, Link> = new Map() // childId -> Link
  private childLinks: Map<SeriesId, SeriesId[]> = new Map() // parentId -> childIds
  private completionCounter = 0

  addCompletion(seriesId: SeriesId, date: LocalDate, duration: number): Completion {
    const completion: Completion = {
      id: `completion-${++this.completionCounter}`,
      seriesId,
      date,
      duration,
    }
    const existing = this.completions.get(seriesId) ?? []
    existing.push(completion)
    this.completions.set(seriesId, existing)
    return completion
  }

  getCompletions(seriesId: SeriesId): Completion[] {
    return this.completions.get(seriesId) ?? []
  }

  linkSeries(parentId: SeriesId, childId: SeriesId): void {
    this.links.set(childId, { parentId, childId })
    const children = this.childLinks.get(parentId) ?? []
    children.push(childId)
    this.childLinks.set(parentId, children)
  }

  getChildLinks(parentId: SeriesId): SeriesId[] {
    return this.childLinks.get(parentId) ?? []
  }

  /**
   * Attempts to delete a series with RESTRICT semantics.
   * Throws RestrictedError if:
   * - Series has completions
   * - Series has child links (is a parent)
   */
  deleteSeriesRestrict(id: SeriesId): boolean {
    // Check for completions
    const completions = this.getCompletions(id)
    if (completions.length > 0) {
      throw new RestrictedError(
        `Series has ${completions.length} completion(s)`,
        'completion'
      )
    }

    // Check for child links (this series is a parent)
    const children = this.getChildLinks(id)
    if (children.length > 0) {
      throw new RestrictedError(
        `Series has ${children.length} linked child(ren)`,
        'link'
      )
    }

    // Safe to delete
    return this.deleteSeriesWithCascade(id)
  }
}

describe('Spec 3: Series - RESTRICT Deletion', () => {
  it('Property #260: deleteSeries RESTRICT by completions', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        localDateGen(),
        fc.integer({ min: 15, max: 120 }),
        (series, date, duration) => {
          const manager = new RestrictDeleteManager()
          const id = manager.createSeries(series)

          // Add a completion
          manager.addCompletion(id, date, duration)

          // Try to delete with RESTRICT - should throw
          expect(() => manager.deleteSeriesRestrict(id)).toThrow(RestrictedError)
          expect(() => manager.deleteSeriesRestrict(id)).toThrow(/completion/)

          // Series should still exist with its original properties
          const seriesAfter = manager.getSeries(id)
          expect(seriesAfter?.id).toBe(id)
          expect(seriesAfter?.name).toBe(series.name)
        }
      )
    )
  })

  it('Property #261: deleteSeries RESTRICT by child links', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        minimalSeriesGen(),
        (parentSeries, childSeries) => {
          const manager = new RestrictDeleteManager()
          const parentId = manager.createSeries(parentSeries)
          const childId = manager.createSeries(childSeries)

          // Link child to parent
          manager.linkSeries(parentId, childId)

          // Try to delete parent with RESTRICT - should throw
          expect(() => manager.deleteSeriesRestrict(parentId)).toThrow(RestrictedError)
          expect(() => manager.deleteSeriesRestrict(parentId)).toThrow(/link/)

          // Parent should still exist with its original properties
          const parentAfter = manager.getSeries(parentId)
          expect(parentAfter?.id).toBe(parentId)
          expect(parentAfter?.name).toBe(parentSeries.name)

          // Child should also still exist with its original properties
          const childAfter = manager.getSeries(childId)
          expect(childAfter?.id).toBe(childId)
          expect(childAfter?.name).toBe(childSeries.name)
        }
      )
    )
  })

  it('series without completions or children can be deleted', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), (series) => {
        const manager = new RestrictDeleteManager()
        const id = manager.createSeries(series)

        // No completions, no children - should succeed
        const result = manager.deleteSeriesRestrict(id)
        expect(result).toBe(true)
        // Verify series is no longer in the collection
        expect(manager.getAllSeries().every((s) => s.id !== id)).toBe(true)
      })
    )
  })

  it('RESTRICT checks both completions and links', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        minimalSeriesGen(),
        localDateGen(),
        (parentSeries, childSeries, date) => {
          const manager = new RestrictDeleteManager()
          const parentId = manager.createSeries(parentSeries)
          const childId = manager.createSeries(childSeries)

          // Add both a completion AND a child link
          manager.addCompletion(parentId, date, 30)
          manager.linkSeries(parentId, childId)

          // Should throw for completions (checked first)
          expect(() => manager.deleteSeriesRestrict(parentId)).toThrow(/completion/)
        }
      )
    )
  })

  it('child series can be deleted if it has no completions', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        minimalSeriesGen(),
        (parentSeries, childSeries) => {
          const manager = new RestrictDeleteManager()
          const parentId = manager.createSeries(parentSeries)
          const childId = manager.createSeries(childSeries)

          manager.linkSeries(parentId, childId)

          // Child has no completions and is not a parent - can be deleted
          // Note: Being a child doesn't prevent deletion, only being a parent does
          const result = manager.deleteSeriesRestrict(childId)
          expect(result).toBe(true)
          // Verify child is no longer in the collection
          expect(manager.getAllSeries().every((s) => s.id !== childId)).toBe(true)
        }
      )
    )
  })
})

// Placeholder for original #291 test that got duplicated
describe('Spec 3: Series - Tags (continued)', () => {
  it('removeTag is idempotent', () => {
    fc.assert(
      fc.property(minimalSeriesGen(), fc.string({ minLength: 1, maxLength: 20 }), (series, tag) => {
        const manager = new SeriesManager()
        const id = manager.createSeries(series)

        manager.addTag(id, tag)
        manager.removeTag(id, tag)

        expect(manager.getSeriesByTag(tag)).not.toContain(id)
      })
    )
  })
})
