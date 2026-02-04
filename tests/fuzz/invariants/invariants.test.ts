/**
 * Tests for invariant checkers.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  dateIsValid,
  timeIsValid,
  dateTimeIsValid,
  durationIsPositive,
  completionEndAfterStart,
  cyclingIndexInBounds,
  chainDepthWithinLimit,
  chainNoCycles,
  withinMinutesOnlyForMustBeWithin,
  withinMinutesNonNegative,
  allDayExcludedFromReflow,
  fixedItemsNotMoved,
  lockedSeriesNotModified,
  transactionIsolation,
  transactionCommitMakesVisible,
  transactionRollbackDiscardsChanges,
  checkAllInvariants,
} from './index'
import {
  localDateGen,
  localTimeGen,
  localDateTimeGen,
  durationGen,
  completionValidGen,
  relationalConstraintGen,
  mustBeWithinConstraintGen,
  seriesIdGen,
  linkGen,
} from '../generators'
import { makeLocalDate, makeLocalTime, makeLocalDateTime } from '../lib/utils'
import type { LocalDate, LocalTime, LocalDateTime, Duration, SeriesId, Link, RelationalConstraint, Completion } from '../lib/types'

// ============================================================================
// Date/Time Invariant Tests
// ============================================================================

describe('Invariants - Date Validation', () => {
  it('Property #417: valid dates pass dateIsValid', () => {
    fc.assert(
      fc.property(localDateGen(), (date) => {
        const result = dateIsValid(date)
        expect(result.passed).toBe(true)
        expect(result.violations).toHaveLength(0)
      })
    )
  })

  it('invalid month fails dateIsValid', () => {
    const invalidDate = '2024-13-15' as LocalDate // Month 13
    const result = dateIsValid(invalidDate)
    expect(result.passed).toBe(false)
    expect(result.violations.some((v) => v.message.includes('Month'))).toBe(true)
  })

  it('invalid day fails dateIsValid', () => {
    const invalidDate = '2024-02-30' as LocalDate // Feb 30
    const result = dateIsValid(invalidDate)
    expect(result.passed).toBe(false)
    expect(result.violations.some((v) => v.message.includes('Day'))).toBe(true)
  })
})

describe('Invariants - Time Validation', () => {
  it('Property #418: valid times pass timeIsValid', () => {
    fc.assert(
      fc.property(localTimeGen(), (time) => {
        const result = timeIsValid(time)
        expect(result.passed).toBe(true)
        expect(result.violations).toHaveLength(0)
      })
    )
  })

  it('invalid hours fails timeIsValid', () => {
    const invalidTime = '25:00' as LocalTime
    const result = timeIsValid(invalidTime)
    expect(result.passed).toBe(false)
  })

  it('invalid minutes fails timeIsValid', () => {
    const invalidTime = '12:60' as LocalTime
    const result = timeIsValid(invalidTime)
    expect(result.passed).toBe(false)
  })
})

describe('Invariants - DateTime Validation', () => {
  it('Property #419: valid dateTimes pass dateTimeIsValid', () => {
    fc.assert(
      fc.property(localDateTimeGen(), (dateTime) => {
        const result = dateTimeIsValid(dateTime)
        expect(result.passed).toBe(true)
        expect(result.violations).toHaveLength(0)
      })
    )
  })
})

describe('Invariants - Duration Validation', () => {
  it('Property #420: positive durations pass durationIsPositive', () => {
    fc.assert(
      fc.property(durationGen({ min: 1, max: 480 }), (duration) => {
        const result = durationIsPositive(duration)
        expect(result.passed).toBe(true)
        expect(result.violations).toHaveLength(0)
      })
    )
  })

  it('zero duration fails durationIsPositive', () => {
    const result = durationIsPositive(0 as Duration)
    expect(result.passed).toBe(false)
  })

  it('negative duration fails durationIsPositive', () => {
    const result = durationIsPositive(-10 as Duration)
    expect(result.passed).toBe(false)
  })
})

// ============================================================================
// Completion Invariant Tests
// ============================================================================

describe('Invariants - Completion Validation', () => {
  it('Property #423: valid completions pass completionEndAfterStart', () => {
    fc.assert(
      fc.property(completionValidGen(), (completion) => {
        const result = completionEndAfterStart(completion)
        expect(result.passed).toBe(true)
        expect(result.violations).toHaveLength(0)
      })
    )
  })

  it('completion with endTime before startTime fails', () => {
    const badCompletion: Completion = {
      id: 'test' as any,
      seriesId: 'series-1' as SeriesId,
      instanceDate: makeLocalDate(2024, 6, 15),
      startTime: makeLocalDateTime(makeLocalDate(2024, 6, 15), makeLocalTime(10, 0)),
      endTime: makeLocalDateTime(makeLocalDate(2024, 6, 15), makeLocalTime(9, 0)), // Before start!
      actualDuration: 60 as Duration,
      notes: undefined,
    }
    const result = completionEndAfterStart(badCompletion)
    expect(result.passed).toBe(false)
  })
})

// ============================================================================
// Cycling Invariant Tests
// ============================================================================

describe('Invariants - Cycling Validation', () => {
  it('Property #424: valid cycling index passes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 10 }),
        (index, items) => {
          const result = cyclingIndexInBounds(index, items)
          expect(result.passed).toBe(true)
        }
      )
    )
  })

  it('negative cycling index fails', () => {
    const result = cyclingIndexInBounds(-1, ['a', 'b', 'c'])
    expect(result.passed).toBe(false)
  })

  it('empty items array fails', () => {
    const result = cyclingIndexInBounds(0, [])
    expect(result.passed).toBe(false)
  })
})

// ============================================================================
// Chain Invariant Tests
// ============================================================================

describe('Invariants - Chain Validation', () => {
  it('Property #425: shallow chain passes depth check', () => {
    const links = new Map<SeriesId, Link>()
    links.set('series-2' as SeriesId, {
      parentSeriesId: 'series-1' as SeriesId,
      childSeriesId: 'series-2' as SeriesId,
      targetDistance: 30,
      earlyWobble: 5,
      lateWobble: 5,
    })
    links.set('series-3' as SeriesId, {
      parentSeriesId: 'series-2' as SeriesId,
      childSeriesId: 'series-3' as SeriesId,
      targetDistance: 30,
      earlyWobble: 5,
      lateWobble: 5,
    })

    const result = chainDepthWithinLimit(links, 'series-3' as SeriesId)
    expect(result.passed).toBe(true)
  })

  it('Property #426: acyclic chain passes cycle check', () => {
    const links = new Map<SeriesId, Link>()
    links.set('series-2' as SeriesId, {
      parentSeriesId: 'series-1' as SeriesId,
      childSeriesId: 'series-2' as SeriesId,
      targetDistance: 30,
      earlyWobble: 5,
      lateWobble: 5,
    })

    const result = chainNoCycles(links, 'series-2' as SeriesId)
    expect(result.passed).toBe(true)
  })

  it('cyclic chain fails cycle check', () => {
    const links = new Map<SeriesId, Link>()
    // Create a cycle: 1 -> 2 -> 3 -> 1
    links.set('series-2' as SeriesId, {
      parentSeriesId: 'series-1' as SeriesId,
      childSeriesId: 'series-2' as SeriesId,
      targetDistance: 30,
      earlyWobble: 5,
      lateWobble: 5,
    })
    links.set('series-3' as SeriesId, {
      parentSeriesId: 'series-2' as SeriesId,
      childSeriesId: 'series-3' as SeriesId,
      targetDistance: 30,
      earlyWobble: 5,
      lateWobble: 5,
    })
    links.set('series-1' as SeriesId, {
      parentSeriesId: 'series-3' as SeriesId,
      childSeriesId: 'series-1' as SeriesId,
      targetDistance: 30,
      earlyWobble: 5,
      lateWobble: 5,
    })

    const result = chainNoCycles(links, 'series-1' as SeriesId)
    expect(result.passed).toBe(false)
  })
})

// ============================================================================
// Constraint Invariant Tests
// ============================================================================

describe('Invariants - Constraint Validation', () => {
  it('Property #427: mustBeWithin has withinMinutes', () => {
    fc.assert(
      fc.property(mustBeWithinConstraintGen(), (constraint) => {
        const result = withinMinutesOnlyForMustBeWithin(constraint)
        expect(result.passed).toBe(true)
      })
    )
  })

  it('Property #428: withinMinutes is non-negative', () => {
    fc.assert(
      fc.property(mustBeWithinConstraintGen(), (constraint) => {
        const result = withinMinutesNonNegative(constraint)
        expect(result.passed).toBe(true)
      })
    )
  })

  it('non-mustBeWithin with withinMinutes fails', () => {
    const badConstraint: RelationalConstraint = {
      id: 'constraint-1' as any,
      sourceTarget: { tag: 'test' },
      destTarget: { tag: 'other' },
      type: 'mustBeBefore',
      withinMinutes: 30, // Should not be present!
    }
    const result = withinMinutesOnlyForMustBeWithin(badConstraint)
    expect(result.passed).toBe(false)
  })
})

// ============================================================================
// Reflow Invariant Tests
// ============================================================================

describe('Invariants - Reflow Validation', () => {
  it('Property #429: all-day items at midnight pass', () => {
    const items = [
      {
        seriesId: 'series-1' as SeriesId,
        date: makeLocalDate(2024, 6, 15),
        time: makeLocalDateTime(makeLocalDate(2024, 6, 15), makeLocalTime(0, 0)),
        isAllDay: true,
        isFixed: false,
      },
    ]
    const result = allDayExcludedFromReflow(items)
    expect(result.passed).toBe(true)
  })

  it('all-day items with non-midnight time fail', () => {
    const items = [
      {
        seriesId: 'series-1' as SeriesId,
        date: makeLocalDate(2024, 6, 15),
        time: makeLocalDateTime(makeLocalDate(2024, 6, 15), makeLocalTime(10, 30)),
        isAllDay: true,
        isFixed: false,
      },
    ]
    const result = allDayExcludedFromReflow(items)
    expect(result.passed).toBe(false)
    expect(result.violations[0].invariant).toBe('allDayExcludedFromReflow')
  })

  it('Property #430: fixed items at ideal time pass', () => {
    const idealTime = makeLocalDateTime(makeLocalDate(2024, 6, 15), makeLocalTime(14, 0))
    const items = [
      {
        seriesId: 'series-1' as SeriesId,
        date: makeLocalDate(2024, 6, 15),
        time: idealTime,
        isAllDay: false,
        isFixed: true,
        idealTime,
      },
    ]
    const result = fixedItemsNotMoved(items)
    expect(result.passed).toBe(true)
  })

  it('fixed items moved from ideal time fail', () => {
    const idealTime = makeLocalDateTime(makeLocalDate(2024, 6, 15), makeLocalTime(14, 0))
    const actualTime = makeLocalDateTime(makeLocalDate(2024, 6, 15), makeLocalTime(15, 0))
    const items = [
      {
        seriesId: 'series-1' as SeriesId,
        date: makeLocalDate(2024, 6, 15),
        time: actualTime,
        isAllDay: false,
        isFixed: true,
        idealTime,
      },
    ]
    const result = fixedItemsNotMoved(items)
    expect(result.passed).toBe(false)
    expect(result.violations[0].invariant).toBe('fixedItemsNotMoved')
  })

  it('Property #422: locked series with no changes passes', () => {
    const result = lockedSeriesNotModified('series-1' as SeriesId, true, false)
    expect(result.passed).toBe(true)
  })

  it('locked series with changes fails', () => {
    const result = lockedSeriesNotModified('series-1' as SeriesId, true, true)
    expect(result.passed).toBe(false)
    expect(result.violations[0].invariant).toBe('lockedSeriesNotModified')
  })

  it('unlocked series with changes passes', () => {
    const result = lockedSeriesNotModified('series-1' as SeriesId, false, true)
    expect(result.passed).toBe(true)
  })
})

// ============================================================================
// Transaction Invariant Tests (Task #421)
// ============================================================================

describe('Invariants - Transaction Isolation', () => {
  it('Property #421: uncommitted writes not visible externally', () => {
    const txState = {
      isInTransaction: true,
      transactionDepth: 1,
      uncommittedReads: new Set<string>(),
      uncommittedWrites: new Set(['write-1', 'write-2']),
    }

    // External reads should NOT see uncommitted writes
    const externalReads = new Set(['write-1']) // This would be a violation
    const internalReads = new Set<string>()

    const result = transactionIsolation(txState, externalReads, internalReads)
    expect(result.passed).toBe(false)
    expect(result.violations[0].invariant).toBe('transactionIsolation')
  })

  it('valid transaction state passes', () => {
    const txState = {
      isInTransaction: true,
      transactionDepth: 1,
      uncommittedReads: new Set<string>(),
      uncommittedWrites: new Set(['write-1']),
    }

    // External reads don't see uncommitted writes - this is correct
    const externalReads = new Set(['other-read'])
    const internalReads = new Set(['write-1'])

    const result = transactionIsolation(txState, externalReads, internalReads)
    expect(result.passed).toBe(true)
  })

  it('negative transaction depth fails', () => {
    const txState = {
      isInTransaction: false,
      transactionDepth: -1,
      uncommittedReads: new Set<string>(),
      uncommittedWrites: new Set<string>(),
    }

    const result = transactionIsolation(txState, new Set(), new Set())
    expect(result.passed).toBe(false)
    expect(result.violations.some((v) => v.message.includes('negative'))).toBe(true)
  })

  it('not in transaction but depth > 0 fails', () => {
    const txState = {
      isInTransaction: false,
      transactionDepth: 1,
      uncommittedReads: new Set<string>(),
      uncommittedWrites: new Set<string>(),
    }

    const result = transactionIsolation(txState, new Set(), new Set())
    expect(result.passed).toBe(false)
  })

  it('transactionCommitMakesVisible - committed writes visible', () => {
    const preCommitWrites = new Set(['write-1', 'write-2'])
    const postCommitReads = new Set(['write-1', 'write-2', 'other'])

    const result = transactionCommitMakesVisible(preCommitWrites, postCommitReads)
    expect(result.passed).toBe(true)
  })

  it('transactionCommitMakesVisible - missing write fails', () => {
    const preCommitWrites = new Set(['write-1', 'write-2'])
    const postCommitReads = new Set(['write-1']) // Missing write-2

    const result = transactionCommitMakesVisible(preCommitWrites, postCommitReads)
    expect(result.passed).toBe(false)
  })

  it('transactionRollbackDiscardsChanges - rolled back writes not visible', () => {
    const preRollbackWrites = new Set(['write-1', 'write-2'])
    const postRollbackReads = new Set(['other-read']) // Does not include rolled back writes

    const result = transactionRollbackDiscardsChanges(preRollbackWrites, postRollbackReads)
    expect(result.passed).toBe(true)
  })

  it('transactionRollbackDiscardsChanges - visible after rollback fails', () => {
    const preRollbackWrites = new Set(['write-1'])
    const postRollbackReads = new Set(['write-1']) // Still visible after rollback!

    const result = transactionRollbackDiscardsChanges(preRollbackWrites, postRollbackReads)
    expect(result.passed).toBe(false)
  })
})

// ============================================================================
// Aggregate Invariant Check Tests
// ============================================================================

describe('Invariants - Aggregate Check', () => {
  it('checkAllInvariants with valid state passes', () => {
    fc.assert(
      fc.property(
        fc.array(localDateGen(), { maxLength: 5 }),
        fc.array(localTimeGen(), { maxLength: 5 }),
        fc.array(durationGen({ min: 1, max: 120 }), { maxLength: 5 }),
        (dates, times, durations) => {
          const result = checkAllInvariants({
            dates,
            times,
            durations,
          })
          expect(result.passed).toBe(true)
        }
      )
    )
  })

  it('checkAllInvariants with invalid data fails', () => {
    const result = checkAllInvariants({
      durations: [0 as Duration, -5 as Duration],
    })
    expect(result.passed).toBe(false)
    expect(result.violations.length).toBe(2)
  })
})

// ============================================================================
// Invariant Checking Integration Tests (Task #434)
// ============================================================================

import {
  createViolationReport,
  formatViolationReport,
  assertNoViolations,
} from './index'

describe('Invariants - Framework Integration', () => {
  it('Property #434: violation reporter creates detailed reports', () => {
    const result = checkAllInvariants({
      durations: [0 as Duration, -5 as Duration],
    })

    const report = createViolationReport(result)

    // Report should have summary
    expect(report.summary).toContain('violation')
    expect(report.totalViolations).toBe(2)

    // Report should categorize by invariant type
    expect(report.violationsByInvariant.get('durationIsPositive')).toBe(2)

    // Details should be provided
    expect(report.details.length).toBe(2)
    expect(report.details[0].invariant).toBe('durationIsPositive')
    expect(report.details[0].severity).toBe('error')
  })

  it('formatViolationReport produces readable output', () => {
    const result = checkAllInvariants({
      dates: ['2024-13-01' as LocalDate], // Invalid month
    })

    const report = createViolationReport(result)
    const formatted = formatViolationReport(report)

    // Should contain section headers
    expect(formatted).toContain('INVARIANT VIOLATION REPORT')
    expect(formatted).toContain('DETAILS')

    // Should contain violation info
    expect(formatted).toContain('dateIsValid')
    expect(formatted).toContain('Month')
  })

  it('assertNoViolations throws on violations', () => {
    const result = checkAllInvariants({
      durations: [-1 as Duration],
    })

    expect(() => assertNoViolations(result)).toThrow(Error)
    expect(() => assertNoViolations(result, 'test context')).toThrow(Error)
  })

  it('assertNoViolations passes for valid state', () => {
    const result = checkAllInvariants({
      durations: [30 as Duration, 60 as Duration],
      dates: [makeLocalDate(2024, 6, 15)],
    })

    expect(() => assertNoViolations(result)).not.toThrow()
  })

  it('Property: invariant checking can be used in property tests', () => {
    fc.assert(
      fc.property(
        fc.array(localDateGen(), { maxLength: 10 }),
        fc.array(localTimeGen(), { maxLength: 10 }),
        fc.array(durationGen({ min: 1, max: 120 }), { maxLength: 10 }),
        (dates, times, durations) => {
          const result = checkAllInvariants({
            dates,
            times,
            durations,
          })

          // Using assertNoViolations integrates with property testing
          assertNoViolations(result, 'property test')
        }
      )
    )
  })

  it('violation report includes timestamp', () => {
    const result = checkAllInvariants({})
    const report = createViolationReport(result)

    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it('passing state produces clean report', () => {
    const result = checkAllInvariants({
      dates: [makeLocalDate(2024, 6, 15)],
    })

    const report = createViolationReport(result)

    expect(report.summary).toBe('All invariants passed')
    expect(report.totalViolations).toBe(0)
    expect(report.details.length).toBe(0)
  })
})
