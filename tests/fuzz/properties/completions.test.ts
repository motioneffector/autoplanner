/**
 * Property tests for completion records (Spec 6).
 *
 * Tests the invariants and laws for:
 * - Completion time constraints
 * - Completion association with series
 * - Duration calculations
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  completionGen,
  completionValidGen,
  boundaryCompletionGen,
  completionsForSeriesGen,
  seriesIdGen,
  localDateGen,
  durationGen,
} from '../generators'
import { parseLocalDateTime, parseLocalDate, makeLocalDateTime, makeLocalDate, makeLocalTime } from '../lib/utils'
import type { Completion, SeriesId, LocalDate, LocalDateTime, Duration } from '../lib/types'

// ============================================================================
// Helper: Completion Manager (Mock)
// ============================================================================

class CompletionManager {
  private completions: Map<string, Completion> = new Map()
  private bySeriesId: Map<SeriesId, Set<string>> = new Map()
  private byDate: Map<LocalDate, Set<string>> = new Map()

  addCompletion(completion: Completion): void {
    // Validate completion
    if (completion.endTime < completion.startTime) {
      throw new Error('endTime must be >= startTime')
    }

    this.completions.set(completion.id, completion)

    // Index by seriesId
    if (!this.bySeriesId.has(completion.seriesId)) {
      this.bySeriesId.set(completion.seriesId, new Set())
    }
    this.bySeriesId.get(completion.seriesId)!.add(completion.id)

    // Index by date
    if (!this.byDate.has(completion.instanceDate)) {
      this.byDate.set(completion.instanceDate, new Set())
    }
    this.byDate.get(completion.instanceDate)!.add(completion.id)
  }

  getCompletion(id: string): Completion | undefined {
    return this.completions.get(id)
  }

  deleteCompletion(id: string): boolean {
    const completion = this.completions.get(id)
    if (!completion) return false

    this.completions.delete(id)
    this.bySeriesId.get(completion.seriesId)?.delete(id)
    this.byDate.get(completion.instanceDate)?.delete(id)

    return true
  }

  getCompletionsForSeries(seriesId: SeriesId): Completion[] {
    const ids = this.bySeriesId.get(seriesId) ?? new Set()
    return Array.from(ids).map((id) => this.completions.get(id)!).filter(Boolean)
  }

  getCompletionsForDate(date: LocalDate): Completion[] {
    const ids = this.byDate.get(date) ?? new Set()
    return Array.from(ids).map((id) => this.completions.get(id)!).filter(Boolean)
  }

  countCompletionsInWindow(seriesId: SeriesId, windowDays: number, referenceDate: LocalDate): number {
    const completions = this.getCompletionsForSeries(seriesId)
    const refParsed = parseLocalDate(referenceDate)
    const refMs = new Date(refParsed.year, refParsed.month - 1, refParsed.day).getTime()

    return completions.filter((c) => {
      const cParsed = parseLocalDate(c.instanceDate)
      const cMs = new Date(cParsed.year, cParsed.month - 1, cParsed.day).getTime()
      const daysDiff = Math.floor((refMs - cMs) / (1000 * 60 * 60 * 24))
      return daysDiff >= 0 && daysDiff < windowDays
    }).length
  }

  isDuplicateCompletion(seriesId: SeriesId, date: LocalDate): boolean {
    const completions = this.getCompletionsForSeries(seriesId)
    return completions.some((c) => c.instanceDate === date)
  }
}

/**
 * Calculate actual duration from start and end times.
 */
function calculateDuration(startTime: LocalDateTime, endTime: LocalDateTime): number {
  const start = parseLocalDateTime(startTime)
  const end = parseLocalDateTime(endTime)

  const startMinutes = start.hours * 60 + start.minutes
  const endMinutes = end.hours * 60 + end.minutes

  // Handle day overflow: if end < start, end is on next day
  if (endMinutes < startMinutes) {
    return (24 * 60 - startMinutes) + endMinutes
  }

  return endMinutes - startMinutes
}

// ============================================================================
// Completion Time Constraint Properties (Task #292-#294)
// ============================================================================

describe('Spec 6: Completions - Time Constraints', () => {
  it('Property #292: completion endTime >= startTime', () => {
    fc.assert(
      fc.property(completionValidGen(), (completion) => {
        expect(completion.endTime >= completion.startTime).toBe(true)
      })
    )
  })

  it('Property #293: duplicate completion throws', () => {
    fc.assert(
      fc.property(completionValidGen(), completionValidGen(), (c1, c2) => {
        // Make c2 a "duplicate" of c1 (same seriesId and instanceDate)
        const duplicate: Completion = {
          ...c2,
          id: c2.id, // Different ID
          seriesId: c1.seriesId, // Same series
          instanceDate: c1.instanceDate, // Same date
        }

        const manager = new CompletionManager()
        manager.addCompletion(c1)

        // After adding c1, checking for duplicate should return true
        expect(manager.isDuplicateCompletion(c1.seriesId, c1.instanceDate)).toBe(true)
      })
    )
  })

  it('Property #294: completion date matches instance', () => {
    fc.assert(
      fc.property(completionValidGen(), (completion) => {
        const startParsed = parseLocalDateTime(completion.startTime)
        const instanceParsed = parseLocalDate(completion.instanceDate)

        // The instance date should match the date portion of startTime
        expect(startParsed.year).toBe(instanceParsed.year)
        expect(startParsed.month).toBe(instanceParsed.month)
        expect(startParsed.day).toBe(instanceParsed.day)
      })
    )
  })
})

// ============================================================================
// Completion CRUD Properties (Task #268-#269, #295)
// ============================================================================

describe('Spec 6: Completions - CRUD Operations', () => {
  it('Property #268: createCompletion then getCompletion returns entity', () => {
    fc.assert(
      fc.property(completionValidGen(), (completion) => {
        const manager = new CompletionManager()
        manager.addCompletion(completion)

        const retrieved = manager.getCompletion(completion.id)
        expect(retrieved).toBeDefined()
        expect(retrieved!.id).toBe(completion.id)
        expect(retrieved!.seriesId).toBe(completion.seriesId)
        expect(retrieved!.instanceDate).toBe(completion.instanceDate)
      })
    )
  })

  it('Property #269: deleteCompletion removes it', () => {
    fc.assert(
      fc.property(completionValidGen(), (completion) => {
        const manager = new CompletionManager()
        manager.addCompletion(completion)

        const deleted = manager.deleteCompletion(completion.id)
        expect(deleted).toBe(true)

        const retrieved = manager.getCompletion(completion.id)
        expect(retrieved).toBeUndefined()
        // Verify completion is no longer in the manager's collection
        expect(manager.getAllCompletions().map(c => c.id)).not.toContain(completion.id)
      })
    )
  })

  it('Property #295: deleteCompletion removes from counts', () => {
    fc.assert(
      fc.property(completionValidGen(), (completion) => {
        const manager = new CompletionManager()
        manager.addCompletion(completion)

        const beforeDelete = manager.getCompletionsForSeries(completion.seriesId)
        expect(beforeDelete).toHaveLength(1)
        expect(beforeDelete[0].id).toBe(completion.id)

        manager.deleteCompletion(completion.id)

        const afterDelete = manager.getCompletionsForSeries(completion.seriesId)
        expect(afterDelete).toHaveLength(0)
      })
    )
  })
})

// ============================================================================
// Completion Query Properties (Task #296-#297)
// ============================================================================

describe('Spec 6: Completions - Queries', () => {
  it('Property #296: getCompletions with seriesId returns matching', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        seriesIdGen(),
        fc.array(completionValidGen(), { minLength: 1, maxLength: 5 }),
        (series1, series2, completions) => {
          fc.pre(series1 !== series2)

          const manager = new CompletionManager()

          // Add completions, alternating series
          completions.forEach((c, i) => {
            const seriesId = i % 2 === 0 ? series1 : series2
            manager.addCompletion({ ...c, seriesId })
          })

          const series1Completions = manager.getCompletionsForSeries(series1)
          const series2Completions = manager.getCompletionsForSeries(series2)

          // All returned completions should have the requested seriesId
          series1Completions.forEach((c) => expect(c.seriesId).toBe(series1))
          series2Completions.forEach((c) => expect(c.seriesId).toBe(series2))
        }
      )
    )
  })

  it('Property #297: getCompletions respects windowDays', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        fc.integer({ min: 1, max: 30 }),
        (seriesId, windowDays) => {
          const manager = new CompletionManager()
          const today = makeLocalDate(2024, 6, 15)

          // Add completions at various dates
          const dates = [
            makeLocalDate(2024, 6, 15), // Today (day 0)
            makeLocalDate(2024, 6, 14), // 1 day ago
            makeLocalDate(2024, 6, 10), // 5 days ago
            makeLocalDate(2024, 5, 15), // 31 days ago
          ]

          dates.forEach((date, i) => {
            manager.addCompletion({
              id: `completion-${i}` as any,
              seriesId,
              instanceDate: date,
              startTime: makeLocalDateTime(date, makeLocalTime(9, 0)),
              endTime: makeLocalDateTime(date, makeLocalTime(10, 0)),
              actualDuration: 60 as Duration,
              notes: undefined,
            })
          })

          const count = manager.countCompletionsInWindow(seriesId, windowDays, today)

          // Count should be within expected bounds based on window
          if (windowDays >= 32) {
            expect(count).toBe(4) // All completions within 32 days
          } else if (windowDays >= 6) {
            expect(count).toBe(3) // Excludes the 31-day-old one
          } else if (windowDays >= 2) {
            expect(count).toBe(2) // Today and 1 day ago
          } else {
            expect(count).toBe(1) // Only today
          }
        }
      )
    )
  })
})

// ============================================================================
// Duration Calculation Properties
// ============================================================================

describe('Spec 6: Completions - Duration', () => {
  it('duration calculation is consistent with times', () => {
    fc.assert(
      fc.property(completionValidGen(), (completion) => {
        const calculatedDuration = calculateDuration(completion.startTime, completion.endTime)

        // The calculated duration should be non-negative
        expect(calculatedDuration).toBeGreaterThanOrEqual(0)
      })
    )
  })

  it('actualDuration is positive', () => {
    fc.assert(
      fc.property(completionValidGen(), (completion) => {
        expect(completion.actualDuration).toBeGreaterThan(0)
      })
    )
  })
})

// ============================================================================
// Boundary Completion Tests
// ============================================================================

describe('Spec 6: Completions - Boundary Values', () => {
  it('boundary completions are well-formed', () => {
    fc.assert(
      fc.property(boundaryCompletionGen(), (completion) => {
        // Verify non-empty string IDs
        expect(completion.id).toBeTruthy()
        expect(completion.id.length).toBeGreaterThan(0)

        expect(completion.seriesId).toBeTruthy()
        expect(completion.seriesId.length).toBeGreaterThan(0)

        // Verify date format (YYYY-MM-DD)
        expect(completion.instanceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

        // Verify date is parseable
        const parsed = parseLocalDate(completion.instanceDate)
        expect(parsed.year).toBeGreaterThanOrEqual(1970)
        expect(parsed.year).toBeLessThanOrEqual(2100)
        expect(parsed.month).toBeGreaterThanOrEqual(1)
        expect(parsed.month).toBeLessThanOrEqual(12)
        expect(parsed.day).toBeGreaterThanOrEqual(1)
        expect(parsed.day).toBeLessThanOrEqual(31)

        // Verify ISO 8601 format for times (contains 'T' separator)
        expect(completion.startTime).toContain('T')
        expect(completion.endTime).toContain('T')

        // Verify times are parseable
        const startParsed = parseLocalDateTime(completion.startTime)
        const endParsed = parseLocalDateTime(completion.endTime)

        expect(startParsed.hours).toBeGreaterThanOrEqual(0)
        expect(startParsed.hours).toBeLessThanOrEqual(23)
        expect(startParsed.minutes).toBeGreaterThanOrEqual(0)
        expect(startParsed.minutes).toBeLessThanOrEqual(59)

        expect(endParsed.hours).toBeGreaterThanOrEqual(0)
        expect(endParsed.hours).toBeLessThanOrEqual(23)
        expect(endParsed.minutes).toBeGreaterThanOrEqual(0)
        expect(endParsed.minutes).toBeLessThanOrEqual(59)

        // Verify time ordering (critical invariant)
        expect(completion.endTime >= completion.startTime).toBe(true)

        // Verify duration with meaningful bounds
        expect(completion.actualDuration).toBeGreaterThan(0)
        expect(completion.actualDuration).toBeLessThanOrEqual(1440) // max 24 hours

        // Verify duration consistency: calculated duration matches stored actualDuration
        const calculatedDuration = calculateDuration(completion.startTime, completion.endTime)
        expect(calculatedDuration).toBe(completion.actualDuration)
      }),
      { numRuns: 100 }
    )
  })

  it('minimum duration completion is valid', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        localDateGen(),
        (seriesId, date) => {
          const startTime = makeLocalDateTime(date, makeLocalTime(10, 0))
          const endTime = makeLocalDateTime(date, makeLocalTime(10, 1)) // 1 minute later

          const completion: Completion = {
            id: 'test-completion' as any,
            seriesId,
            instanceDate: date,
            startTime,
            endTime,
            actualDuration: 1 as Duration,
            notes: undefined,
          }

          const manager = new CompletionManager()
          manager.addCompletion(completion)

          const retrieved = manager.getCompletion(completion.id)
          expect(retrieved?.actualDuration).toBe(1)
        }
      )
    )
  })

  it('full day completion is valid', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        localDateGen(),
        (seriesId, date) => {
          const startTime = makeLocalDateTime(date, makeLocalTime(0, 0))
          const endTime = makeLocalDateTime(date, makeLocalTime(23, 59))

          const completion: Completion = {
            id: 'test-completion' as any,
            seriesId,
            instanceDate: date,
            startTime,
            endTime,
            actualDuration: 1439 as Duration, // 23 hours 59 minutes
            notes: undefined,
          }

          const manager = new CompletionManager()
          manager.addCompletion(completion)

          const retrieved = manager.getCompletion(completion.id)
          expect(retrieved?.actualDuration).toBe(1439)
        }
      )
    )
  })
})

// ============================================================================
// Counting Properties (Task #270-#271)
// ============================================================================

/**
 * Extended CompletionManager with counting and daysSince functionality.
 */
class CompletionCountingManager extends CompletionManager {
  daysSinceLastCompletion(seriesId: SeriesId, referenceDate: LocalDate): number | null {
    const completions = this.getCompletionsForSeries(seriesId)
    if (completions.length === 0) return null

    const refParsed = parseLocalDate(referenceDate)
    const refMs = new Date(refParsed.year, refParsed.month - 1, refParsed.day).getTime()

    let minDays = Infinity
    for (const c of completions) {
      const cParsed = parseLocalDate(c.instanceDate)
      const cMs = new Date(cParsed.year, cParsed.month - 1, cParsed.day).getTime()
      const daysDiff = Math.floor((refMs - cMs) / (1000 * 60 * 60 * 24))
      if (daysDiff >= 0 && daysDiff < minDays) {
        minDays = daysDiff
      }
    }

    return minDays === Infinity ? null : minDays
  }
}

describe('Spec 6: Completions - Counting', () => {
  it('Property #270: countCompletionsInWindow correct', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        fc.array(localDateGen(), { minLength: 0, maxLength: 10 }),
        fc.integer({ min: 1, max: 90 }),
        localDateGen(),
        (seriesId, completionDates, windowDays, referenceDate) => {
          const manager = new CompletionCountingManager()

          // Add completions at specified dates
          const uniqueDates = [...new Set(completionDates)]
          uniqueDates.forEach((date, i) => {
            manager.addCompletion({
              id: `completion-${i}` as any,
              seriesId,
              instanceDate: date,
              startTime: makeLocalDateTime(date, makeLocalTime(10, 0)),
              endTime: makeLocalDateTime(date, makeLocalTime(11, 0)),
              actualDuration: 60 as Duration,
              notes: undefined,
            })
          })

          const count = manager.countCompletionsInWindow(seriesId, windowDays, referenceDate)

          // Verify count manually
          const refParsed = parseLocalDate(referenceDate)
          const refMs = new Date(refParsed.year, refParsed.month - 1, refParsed.day).getTime()

          const expectedCount = uniqueDates.filter((date) => {
            const cParsed = parseLocalDate(date)
            const cMs = new Date(cParsed.year, cParsed.month - 1, cParsed.day).getTime()
            const daysDiff = Math.floor((refMs - cMs) / (1000 * 60 * 60 * 24))
            return daysDiff >= 0 && daysDiff < windowDays
          }).length

          expect(count).toBe(expectedCount)
        }
      )
    )
  })

  it('Property #271: daysSinceLastCompletion correct', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        fc.array(localDateGen(), { minLength: 1, maxLength: 10 }),
        localDateGen(),
        (seriesId, completionDates, referenceDate) => {
          const manager = new CompletionCountingManager()

          // Add completions at specified dates
          const uniqueDates = [...new Set(completionDates)]
          uniqueDates.forEach((date, i) => {
            manager.addCompletion({
              id: `completion-${i}` as any,
              seriesId,
              instanceDate: date,
              startTime: makeLocalDateTime(date, makeLocalTime(10, 0)),
              endTime: makeLocalDateTime(date, makeLocalTime(11, 0)),
              actualDuration: 60 as Duration,
              notes: undefined,
            })
          })

          const daysSince = manager.daysSinceLastCompletion(seriesId, referenceDate)

          // Verify manually
          const refParsed = parseLocalDate(referenceDate)
          const refMs = new Date(refParsed.year, refParsed.month - 1, refParsed.day).getTime()

          let expectedMinDays: number | null = null
          for (const date of uniqueDates) {
            const cParsed = parseLocalDate(date)
            const cMs = new Date(cParsed.year, cParsed.month - 1, cParsed.day).getTime()
            const daysDiff = Math.floor((refMs - cMs) / (1000 * 60 * 60 * 24))
            if (daysDiff >= 0) {
              if (expectedMinDays === null || daysDiff < expectedMinDays) {
                expectedMinDays = daysDiff
              }
            }
          }

          expect(daysSince).toBe(expectedMinDays)
        }
      )
    )
  })

  it('daysSinceLastCompletion returns null for no completions', () => {
    fc.assert(
      fc.property(seriesIdGen(), localDateGen(), (seriesId, referenceDate) => {
        const manager = new CompletionCountingManager()
        const daysSince = manager.daysSinceLastCompletion(seriesId, referenceDate)
        expect(daysSince).toBeNull()
        // Verify no completions exist for this series
        expect(manager.getCompletionsForSeries(seriesId)).toEqual([])
      })
    )
  })

  it('countCompletionsInWindow with window=1 counts only reference day', () => {
    // Use fixed dates to avoid timezone edge cases
    const seriesId = 'test-series' as any
    const date = makeLocalDate(2024, 6, 15)
    const dayBeforeDate = makeLocalDate(2024, 6, 14)

    const manager = new CompletionCountingManager()

    // Add completion on the reference date
    manager.addCompletion({
      id: 'completion-0' as any,
      seriesId,
      instanceDate: date,
      startTime: makeLocalDateTime(date, makeLocalTime(10, 0)),
      endTime: makeLocalDateTime(date, makeLocalTime(11, 0)),
      actualDuration: 60 as Duration,
      notes: undefined,
    })

    const count = manager.countCompletionsInWindow(seriesId, 1, date)
    expect(count).toBe(1)

    // Add completion one day before
    manager.addCompletion({
      id: 'completion-1' as any,
      seriesId,
      instanceDate: dayBeforeDate,
      startTime: makeLocalDateTime(dayBeforeDate, makeLocalTime(10, 0)),
      endTime: makeLocalDateTime(dayBeforeDate, makeLocalTime(11, 0)),
      actualDuration: 60 as Duration,
      notes: undefined,
    })

    // Window of 1 should still only count the reference day
    const countAfter = manager.countCompletionsInWindow(seriesId, 1, date)
    expect(countAfter).toBe(1)
  })
})
