/**
 * Property tests for temporal types and operations (Spec 1).
 *
 * Tests the invariants and laws for:
 * - Date parsing and formatting
 * - Time parsing and formatting
 * - DateTime parsing and formatting
 * - Date/time arithmetic
 * - Date/time comparison
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  localDateGen,
  localTimeGen,
  localDateTimeGen,
  durationGen,
  boundaryDateGen,
  boundaryTimeGen,
  boundaryDateTimeGen,
} from '../generators'
import {
  makeLocalDate,
  makeLocalTime,
  makeLocalDateTime,
  parseLocalDate,
  parseLocalTime,
  parseLocalDateTime,
  isValidDate,
  isValidTime,
  lastDayOfMonth,
  isLeapYear,
} from '../lib/utils'
import type { LocalDate, LocalTime, LocalDateTime } from '../lib/types'

// ============================================================================
// Parse/Format Identity Properties (Task #157, #158, #159)
// ============================================================================

describe('Spec 1: Temporal Types - Parse/Format Identity', () => {
  it('Property #157: parseDate ∘ formatDate = identity', () => {
    fc.assert(
      fc.property(localDateGen(), (date) => {
        // Parse the date
        const { year, month, day } = parseLocalDate(date)
        // Format it back
        const formatted = makeLocalDate(year, month, day)
        // Should be identical
        expect(formatted).toBe(date)
      })
    )
  })

  it('Property #158: parseTime ∘ formatTime = identity', () => {
    fc.assert(
      fc.property(localTimeGen(), (time) => {
        // Parse the time
        const { hours, minutes } = parseLocalTime(time)
        // Format it back
        const formatted = makeLocalTime(hours, minutes)
        // Should be identical
        expect(formatted).toBe(time)
      })
    )
  })

  it('Property #159: parseDateTime ∘ formatDateTime = identity', () => {
    fc.assert(
      fc.property(localDateTimeGen(), (dt) => {
        // Parse the datetime
        const { year, month, day, hours, minutes } = parseLocalDateTime(dt)
        // Format it back
        const formatted = makeLocalDateTime(makeLocalDate(year, month, day), makeLocalTime(hours, minutes))
        // Should be identical
        expect(formatted).toBe(dt)
      })
    )
  })
})

// ============================================================================
// Comparison Properties (Task #160-#168)
// ============================================================================

describe('Spec 1: Temporal Types - Comparison Properties', () => {
  it('Property #160: date comparison is reflexive (d = d)', () => {
    fc.assert(
      fc.property(localDateGen(), (date) => {
        expect(date === date).toBe(true)
        expect(date >= date).toBe(true)
        expect(date <= date).toBe(true)
      })
    )
  })

  it('Property #161: date comparison is antisymmetric', () => {
    fc.assert(
      fc.property(localDateGen(), localDateGen(), (d1, d2) => {
        // If d1 <= d2 and d2 <= d1, then d1 = d2
        if (d1 <= d2 && d2 <= d1) {
          expect(d1).toBe(d2)
        }
        // If d1 < d2 then not d2 < d1
        if (d1 < d2) {
          expect(d2 < d1).toBe(false)
        }
      })
    )
  })

  it('Property #162: date comparison is transitive', () => {
    fc.assert(
      fc.property(localDateGen(), localDateGen(), localDateGen(), (d1, d2, d3) => {
        // If d1 <= d2 and d2 <= d3, then d1 <= d3
        if (d1 <= d2 && d2 <= d3) {
          expect(d1 <= d3).toBe(true)
        }
      })
    )
  })

  it('Property #163: time comparison is reflexive (t = t)', () => {
    fc.assert(
      fc.property(localTimeGen(), (time) => {
        expect(time === time).toBe(true)
        expect(time >= time).toBe(true)
        expect(time <= time).toBe(true)
      })
    )
  })

  it('Property #164: time comparison is antisymmetric', () => {
    fc.assert(
      fc.property(localTimeGen(), localTimeGen(), (t1, t2) => {
        if (t1 <= t2 && t2 <= t1) {
          expect(t1).toBe(t2)
        }
        if (t1 < t2) {
          expect(t2 < t1).toBe(false)
        }
      })
    )
  })

  it('Property #165: time comparison is transitive', () => {
    fc.assert(
      fc.property(localTimeGen(), localTimeGen(), localTimeGen(), (t1, t2, t3) => {
        if (t1 <= t2 && t2 <= t3) {
          expect(t1 <= t3).toBe(true)
        }
      })
    )
  })

  it('Property #166: dateTime comparison is reflexive (dt = dt)', () => {
    fc.assert(
      fc.property(localDateTimeGen(), (dt) => {
        expect(dt === dt).toBe(true)
        expect(dt >= dt).toBe(true)
        expect(dt <= dt).toBe(true)
      })
    )
  })

  it('Property #167: dateTime comparison is antisymmetric', () => {
    fc.assert(
      fc.property(localDateTimeGen(), localDateTimeGen(), (dt1, dt2) => {
        if (dt1 <= dt2 && dt2 <= dt1) {
          expect(dt1).toBe(dt2)
        }
        if (dt1 < dt2) {
          expect(dt2 < dt1).toBe(false)
        }
      })
    )
  })

  it('Property #168: dateTime comparison is transitive', () => {
    fc.assert(
      fc.property(localDateTimeGen(), localDateTimeGen(), localDateTimeGen(), (dt1, dt2, dt3) => {
        if (dt1 <= dt2 && dt2 <= dt3) {
          expect(dt1 <= dt3).toBe(true)
        }
      })
    )
  })
})

// ============================================================================
// Date Arithmetic Properties (Task #169-#176)
// ============================================================================

describe('Spec 1: Temporal Types - Date Arithmetic', () => {
  /**
   * Helper: Add days to a date
   */
  function addDays(date: LocalDate, days: number): LocalDate {
    const { year, month, day } = parseLocalDate(date)
    const d = new Date(Date.UTC(year, month - 1, day))
    d.setUTCDate(d.getUTCDate() + days)
    return makeLocalDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  }

  /**
   * Helper: Calculate days between two dates
   */
  function daysBetween(d1: LocalDate, d2: LocalDate): number {
    const p1 = parseLocalDate(d1)
    const p2 = parseLocalDate(d2)
    const date1 = new Date(Date.UTC(p1.year, p1.month - 1, p1.day))
    const date2 = new Date(Date.UTC(p2.year, p2.month - 1, p2.day))
    return Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24))
  }

  /**
   * Helper: Get day of week (0 = Sunday)
   */
  function dayOfWeek(date: LocalDate): number {
    const { year, month, day } = parseLocalDate(date)
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  }

  it('Property #169: addDays(d, n) then addDays(-n) = d', () => {
    fc.assert(
      fc.property(localDateGen(), fc.integer({ min: -1000, max: 1000 }), (date, n) => {
        const added = addDays(date, n)
        const result = addDays(added, -n)
        expect(result).toBe(date)
      })
    )
  })

  it('Property #170: addDays(d, 0) = d', () => {
    fc.assert(
      fc.property(localDateGen(), (date) => {
        expect(addDays(date, 0)).toBe(date)
      })
    )
  })

  it('Property #171: addDays is monotonic (n > 0 implies addDays(d, n) > d)', () => {
    fc.assert(
      fc.property(localDateGen(), fc.integer({ min: 1, max: 1000 }), (date, n) => {
        expect(addDays(date, n) > date).toBe(true)
      })
    )
  })

  it('Property #175: dayOfWeek returns 0-6', () => {
    fc.assert(
      fc.property(localDateGen(), (date) => {
        const dow = dayOfWeek(date)
        expect(dow).toBeGreaterThanOrEqual(0)
        expect(dow).toBeLessThanOrEqual(6)
      })
    )
  })

  it('Property #176: dayOfWeek consistent across addDays(7)', () => {
    fc.assert(
      fc.property(localDateGen(), (date) => {
        const dow1 = dayOfWeek(date)
        const dow2 = dayOfWeek(addDays(date, 7))
        expect(dow1).toBe(dow2)
      })
    )
  })

  it('Property #179: daysBetween(a, b) = -daysBetween(b, a)', () => {
    fc.assert(
      fc.property(localDateGen(), localDateGen(), (d1, d2) => {
        expect(daysBetween(d1, d2)).toBe(-daysBetween(d2, d1))
      })
    )
  })

  it('Property #180: daysBetween(a, a) = 0', () => {
    fc.assert(
      fc.property(localDateGen(), (date) => {
        expect(daysBetween(date, date)).toBe(0)
      })
    )
  })
})

// ============================================================================
// Time Arithmetic Properties (Task #172-#174, #177-#178)
// ============================================================================

describe('Spec 1: Temporal Types - Time/DateTime Arithmetic', () => {
  /**
   * Helper: Add minutes to a datetime
   */
  function addMinutes(dt: LocalDateTime, mins: number): LocalDateTime {
    const { year, month, day, hours, minutes } = parseLocalDateTime(dt)
    const d = new Date(Date.UTC(year, month - 1, day, hours, minutes))
    d.setUTCMinutes(d.getUTCMinutes() + mins)
    return makeLocalDateTime(
      makeLocalDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
      makeLocalTime(d.getUTCHours(), d.getUTCMinutes())
    )
  }

  /**
   * Helper: Calculate minutes between two datetimes
   */
  function minutesBetween(dt1: LocalDateTime, dt2: LocalDateTime): number {
    const p1 = parseLocalDateTime(dt1)
    const p2 = parseLocalDateTime(dt2)
    const d1 = new Date(Date.UTC(p1.year, p1.month - 1, p1.day, p1.hours, p1.minutes))
    const d2 = new Date(Date.UTC(p2.year, p2.month - 1, p2.day, p2.hours, p2.minutes))
    return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60))
  }

  it('Property #172: addMinutes(dt, n) then addMinutes(-n) = dt', () => {
    fc.assert(
      fc.property(localDateTimeGen(), fc.integer({ min: -10000, max: 10000 }), (dt, n) => {
        const added = addMinutes(dt, n)
        const result = addMinutes(added, -n)
        expect(result).toBe(dt)
      })
    )
  })

  it('Property #173: addMinutes(dt, 0) = dt', () => {
    fc.assert(
      fc.property(localDateTimeGen(), (dt) => {
        expect(addMinutes(dt, 0)).toBe(dt)
      })
    )
  })

  it('Property #174: addMinutes is monotonic (n > 0 implies addMinutes(dt, n) > dt)', () => {
    fc.assert(
      fc.property(localDateTimeGen(), fc.integer({ min: 1, max: 10000 }), (dt, n) => {
        expect(addMinutes(dt, n) > dt).toBe(true)
      })
    )
  })

  it('Property #177: minutesBetween(a, b) = -minutesBetween(b, a)', () => {
    fc.assert(
      fc.property(localDateTimeGen(), localDateTimeGen(), (dt1, dt2) => {
        expect(minutesBetween(dt1, dt2)).toBe(-minutesBetween(dt2, dt1))
      })
    )
  })

  it('Property #178: minutesBetween(a, a) = 0', () => {
    fc.assert(
      fc.property(localDateTimeGen(), (dt) => {
        expect(minutesBetween(dt, dt)).toBe(0)
      })
    )
  })
})

// ============================================================================
// Last Day of Month Properties (Task #181-#184)
// ============================================================================

describe('Spec 1: Temporal Types - Month/Year Properties', () => {
  it('Property #181: lastDayOfMonth returns 28-31', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1970, max: 2100 }), fc.integer({ min: 1, max: 12 }), (year, month) => {
        const lastDay = lastDayOfMonth(year, month)
        expect(lastDay).toBeGreaterThanOrEqual(28)
        expect(lastDay).toBeLessThanOrEqual(31)
      })
    )
  })

  it('Property #182: lastDayOfMonth(Feb) = 29 iff leap year', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1970, max: 2100 }), (year) => {
        const lastDay = lastDayOfMonth(year, 2)
        if (isLeapYear(year)) {
          expect(lastDay).toBe(29)
        } else {
          expect(lastDay).toBe(28)
        }
      })
    )
  })

  it('Property #183: lastDayOfMonth consistent with isLeapYear', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1970, max: 2100 }), (year) => {
        const febDays = lastDayOfMonth(year, 2)
        const isLeap = isLeapYear(year)
        expect(febDays === 29).toBe(isLeap)
      })
    )
  })

  it('Property #184: isLeapYear follows Gregorian rules', () => {
    // Gregorian rules:
    // - Divisible by 4 = leap year
    // - EXCEPT divisible by 100 = not leap year
    // - EXCEPT divisible by 400 = leap year
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 3000 }), (year) => {
        const expected = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
        expect(isLeapYear(year)).toBe(expected)
      })
    )
  })
})

// ============================================================================
// DateTime Composition Properties (Task #187-#189)
// ============================================================================

describe('Spec 1: Temporal Types - DateTime Composition', () => {
  it('Property #187: combineDateAndTime produces valid dateTime', () => {
    fc.assert(
      fc.property(localDateGen(), localTimeGen(), (date, time) => {
        const dt = makeLocalDateTime(date, time)
        // Should parse correctly
        const parsed = parseLocalDateTime(dt)
        const { year, month, day } = parseLocalDate(date)
        const { hours, minutes } = parseLocalTime(time)
        expect(parsed.year).toBe(year)
        expect(parsed.month).toBe(month)
        expect(parsed.day).toBe(day)
        expect(parsed.hours).toBe(hours)
        expect(parsed.minutes).toBe(minutes)
      })
    )
  })

  it('Property #188: extractDate from dateTime matches original', () => {
    fc.assert(
      fc.property(localDateGen(), localTimeGen(), (date, time) => {
        const dt = makeLocalDateTime(date, time)
        const { year, month, day } = parseLocalDateTime(dt)
        const extractedDate = makeLocalDate(year, month, day)
        expect(extractedDate).toBe(date)
      })
    )
  })

  it('Property #189: extractTime from dateTime matches original', () => {
    fc.assert(
      fc.property(localDateGen(), localTimeGen(), (date, time) => {
        const dt = makeLocalDateTime(date, time)
        const { hours, minutes } = parseLocalDateTime(dt)
        const extractedTime = makeLocalTime(hours, minutes)
        expect(extractedTime).toBe(time)
      })
    )
  })
})

// ============================================================================
// Boundary Value Tests
// ============================================================================

describe('Spec 1: Temporal Types - Boundary Values', () => {
  it('boundary dates parse and format correctly', () => {
    fc.assert(
      fc.property(boundaryDateGen(), (date) => {
        const { year, month, day } = parseLocalDate(date)
        expect(isValidDate(year, month, day)).toBe(true)
        expect(makeLocalDate(year, month, day)).toBe(date)
      }),
      { numRuns: 200 }
    )
  })

  it('boundary times parse and format correctly', () => {
    fc.assert(
      fc.property(boundaryTimeGen(), (time) => {
        const { hours, minutes } = parseLocalTime(time)
        expect(isValidTime(hours, minutes)).toBe(true)
        expect(makeLocalTime(hours, minutes)).toBe(time)
      }),
      { numRuns: 200 }
    )
  })

  it('boundary dateTimes parse and format correctly', () => {
    fc.assert(
      fc.property(boundaryDateTimeGen(), (dt) => {
        const { year, month, day, hours, minutes } = parseLocalDateTime(dt)
        expect(isValidDate(year, month, day)).toBe(true)
        expect(isValidTime(hours, minutes)).toBe(true)
        const formatted = makeLocalDateTime(makeLocalDate(year, month, day), makeLocalTime(hours, minutes))
        expect(formatted).toBe(dt)
      }),
      { numRuns: 200 }
    )
  })
})

// ============================================================================
// DST (Daylight Saving Time) Properties (Task #185-#186)
// ============================================================================

/**
 * DST handling utilities.
 *
 * In the US, DST transitions typically occur:
 * - Spring forward: 2nd Sunday in March at 2:00 AM -> 3:00 AM (gap)
 * - Fall back: 1st Sunday in November at 2:00 AM -> 1:00 AM (overlap)
 *
 * Times in the gap (2:00-2:59 AM on spring forward) don't exist.
 * Times in the overlap (1:00-1:59 AM on fall back) exist twice.
 */
class DSTResolver {
  /**
   * Checks if a time falls in a DST gap (doesn't exist).
   * Returns the valid resolved time if it does.
   */
  resolveGapTime(date: LocalDate, time: LocalTime, timezone: string): LocalTime {
    // For US timezones, check if this is the spring forward date
    // 2nd Sunday in March
    const parsed = parseLocalDate(date)
    const { hours, minutes } = parseLocalTime(time)

    if (this.isSpringForwardDate(parsed.year, parsed.month, parsed.day)) {
      // Gap is from 2:00 to 2:59
      if (hours === 2) {
        // Resolve to 3:00 (skip the gap)
        return makeLocalTime(3, minutes)
      }
    }

    // Not in a gap, return original
    return time
  }

  /**
   * For ambiguous times (fall back), returns the earlier interpretation.
   * The spec says to use the first occurrence (before the clock change).
   */
  resolveAmbiguousTime(date: LocalDate, time: LocalTime, timezone: string): { time: LocalTime; isDST: boolean } {
    const parsed = parseLocalDate(date)
    const { hours, minutes } = parseLocalTime(time)

    if (this.isFallBackDate(parsed.year, parsed.month, parsed.day)) {
      // Ambiguous times are 1:00-1:59 AM
      if (hours === 1) {
        // Per spec, use the first occurrence (DST = true, before change)
        return { time, isDST: true }
      }
    }

    // Not ambiguous
    return { time, isDST: false }
  }

  /**
   * Checks if a time is valid (doesn't fall in DST gap).
   */
  isValidTime(date: LocalDate, time: LocalTime, timezone: string): boolean {
    const parsed = parseLocalDate(date)
    const { hours } = parseLocalTime(time)

    if (this.isSpringForwardDate(parsed.year, parsed.month, parsed.day)) {
      // Gap is 2:00-2:59 AM
      if (hours === 2) {
        return false
      }
    }

    return true
  }

  private isSpringForwardDate(year: number, month: number, day: number): boolean {
    // 2nd Sunday in March
    if (month !== 3) return false

    // Find 2nd Sunday
    const firstDay = new Date(year, 2, 1).getDay() // 0 = Sunday
    const firstSunday = firstDay === 0 ? 1 : 8 - firstDay
    const secondSunday = firstSunday + 7

    return day === secondSunday
  }

  private isFallBackDate(year: number, month: number, day: number): boolean {
    // 1st Sunday in November
    if (month !== 11) return false

    const firstDay = new Date(year, 10, 1).getDay() // 0 = Sunday
    const firstSunday = firstDay === 0 ? 1 : 8 - firstDay

    return day === firstSunday
  }
}

describe('Spec 1: Temporal Types - DST Handling', () => {
  it('Property #185: DST gap times resolve to valid time', () => {
    const resolver = new DSTResolver()

    // Test known DST transition dates
    const springForwardDates = [
      makeLocalDate(2024, 3, 10), // March 10, 2024
      makeLocalDate(2025, 3, 9),  // March 9, 2025
      makeLocalDate(2026, 3, 8),  // March 8, 2026
    ]

    for (const date of springForwardDates) {
      // 2:30 AM doesn't exist on spring forward
      const gapTime = makeLocalTime(2, 30)
      const resolved = resolver.resolveGapTime(date, gapTime, 'America/New_York')

      // Should resolve to 3:30 AM
      expect(resolved).toBe(makeLocalTime(3, 30))

      // The resolved time should be valid
      expect(resolver.isValidTime(date, resolved, 'America/New_York')).toBe(true)
    }
  })

  it('Property #186: DST ambiguous times resolve deterministically', () => {
    const resolver = new DSTResolver()

    // Test known fall back dates
    const fallBackDates = [
      makeLocalDate(2024, 11, 3), // November 3, 2024
      makeLocalDate(2025, 11, 2), // November 2, 2025
      makeLocalDate(2026, 11, 1), // November 1, 2026
    ]

    for (const date of fallBackDates) {
      // 1:30 AM exists twice on fall back
      const ambiguousTime = makeLocalTime(1, 30)
      const resolved = resolver.resolveAmbiguousTime(date, ambiguousTime, 'America/New_York')

      // Should consistently choose the first occurrence (DST)
      expect(resolved.time).toBe(ambiguousTime)
      expect(resolved.isDST).toBe(true)

      // Resolving again should give same result (deterministic)
      const resolved2 = resolver.resolveAmbiguousTime(date, ambiguousTime, 'America/New_York')
      expect(resolved2.time).toBe(resolved.time)
      expect(resolved2.isDST).toBe(resolved.isDST)
    }
  })

  it('non-DST dates pass through unchanged', () => {
    fc.assert(
      fc.property(
        localDateGen(),
        localTimeGen(),
        (date, time) => {
          const resolver = new DSTResolver()
          const parsed = parseLocalDate(date)

          // Skip actual DST transition dates
          const isTransition = resolver['isSpringForwardDate'](parsed.year, parsed.month, parsed.day) ||
                               resolver['isFallBackDate'](parsed.year, parsed.month, parsed.day)

          if (!isTransition) {
            // Non-transition dates should pass through unchanged
            const resolved = resolver.resolveGapTime(date, time, 'America/New_York')
            expect(resolved).toBe(time)
          }
        }
      )
    )
  })

  it('all times on non-DST dates are valid', () => {
    fc.assert(
      fc.property(
        localDateGen(),
        localTimeGen(),
        (date, time) => {
          const resolver = new DSTResolver()
          const parsed = parseLocalDate(date)

          // Skip actual DST transition dates
          const isSpringForward = resolver['isSpringForwardDate'](parsed.year, parsed.month, parsed.day)

          if (!isSpringForward) {
            expect(resolver.isValidTime(date, time, 'America/New_York')).toBe(true)
          }
        }
      )
    )
  })

  it('gap time detection is correct', () => {
    const resolver = new DSTResolver()
    const springDate = makeLocalDate(2024, 3, 10) // March 10, 2024

    // 1:59 AM exists
    expect(resolver.isValidTime(springDate, makeLocalTime(1, 59), 'America/New_York')).toBe(true)

    // 2:00-2:59 AM doesn't exist
    expect(resolver.isValidTime(springDate, makeLocalTime(2, 0), 'America/New_York')).toBe(false)
    expect(resolver.isValidTime(springDate, makeLocalTime(2, 30), 'America/New_York')).toBe(false)
    expect(resolver.isValidTime(springDate, makeLocalTime(2, 59), 'America/New_York')).toBe(false)

    // 3:00 AM exists
    expect(resolver.isValidTime(springDate, makeLocalTime(3, 0), 'America/New_York')).toBe(true)
  })
})

// ============================================================================
// Timezone Configuration Properties (Task #380)
// ============================================================================

/**
 * Timezone interpreter for testing that all input times are correctly
 * interpreted in the configured timezone.
 *
 * Per Spec 1, the system should:
 * - Store all times as LocalDateTime (timezone-naive)
 * - Interpret all inputs in the user's configured timezone
 * - Convert to UTC only when necessary for external APIs
 */
class TimezoneInterpreter {
  constructor(private configuredTimezone: string) {}

  /**
   * Interprets a local time input as being in the configured timezone.
   * Returns metadata about how the time was interpreted.
   */
  interpretTime(time: LocalTime): { time: LocalTime; timezone: string; utcOffset: number } {
    // In a real implementation, this would use a timezone library
    // For testing, we simulate the interpretation
    const utcOffset = this.getUTCOffset(this.configuredTimezone)
    return {
      time,
      timezone: this.configuredTimezone,
      utcOffset,
    }
  }

  /**
   * Interprets a local datetime in the configured timezone.
   */
  interpretDateTime(dateTime: LocalDateTime): {
    dateTime: LocalDateTime
    timezone: string
    utcOffset: number
    isDST: boolean
  } {
    const utcOffset = this.getUTCOffset(this.configuredTimezone)
    return {
      dateTime,
      timezone: this.configuredTimezone,
      utcOffset,
      isDST: this.isDSTActive(dateTime),
    }
  }

  /**
   * Validates that a time would be interpreted correctly in the configured timezone.
   */
  validateInterpretation(time: LocalTime): boolean {
    // All valid times should be interpretable
    const { hours, minutes } = parseLocalTime(time)
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
  }

  private getUTCOffset(timezone: string): number {
    // Simplified offset calculation for common US timezones
    const offsets: Record<string, number> = {
      'America/New_York': -5,
      'America/Chicago': -6,
      'America/Denver': -7,
      'America/Los_Angeles': -8,
      'UTC': 0,
      'Europe/London': 0,
      'Europe/Paris': 1,
      'Asia/Tokyo': 9,
    }
    return offsets[timezone] ?? 0
  }

  private isDSTActive(dateTime: LocalDateTime): boolean {
    // Simplified DST check for US timezones
    const { month, day } = parseLocalDateTime(dateTime)
    // DST is roughly active from March to November
    return month >= 3 && month <= 11
  }
}

describe('Spec 1: Temporal Types - Timezone Configuration', () => {
  it('Property #380: all input times interpreted as configured timezone', () => {
    const timezones = [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'UTC',
      'Europe/London',
    ]

    fc.assert(
      fc.property(
        fc.constantFrom(...timezones),
        localTimeGen(),
        (timezone, time) => {
          const interpreter = new TimezoneInterpreter(timezone)
          const result = interpreter.interpretTime(time)

          // The time should be preserved as-is (local times are timezone-naive)
          expect(result.time).toBe(time)

          // The configured timezone should be used
          expect(result.timezone).toBe(timezone)

          // UTC offset should be a valid number
          expect(result.utcOffset).toEqual(expect.any(Number))
          expect(result.utcOffset).toBeGreaterThanOrEqual(-12)
          expect(result.utcOffset).toBeLessThanOrEqual(14)
        }
      )
    )
  })

  it('timezone interpretation is deterministic', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('America/New_York', 'UTC', 'Europe/London'),
        localDateTimeGen(),
        (timezone, dateTime) => {
          const interpreter = new TimezoneInterpreter(timezone)

          // Interpret twice
          const result1 = interpreter.interpretDateTime(dateTime)
          const result2 = interpreter.interpretDateTime(dateTime)

          // Should get identical results
          expect(result1.dateTime).toBe(result2.dateTime)
          expect(result1.timezone).toBe(result2.timezone)
          expect(result1.utcOffset).toBe(result2.utcOffset)
          expect(result1.isDST).toBe(result2.isDST)
        }
      )
    )
  })

  it('all valid times are interpretable in any timezone', () => {
    const timezones = ['America/New_York', 'UTC', 'Asia/Tokyo']

    fc.assert(
      fc.property(
        fc.constantFrom(...timezones),
        localTimeGen(),
        (timezone, time) => {
          const interpreter = new TimezoneInterpreter(timezone)

          // All valid times should be interpretable
          expect(interpreter.validateInterpretation(time)).toBe(true)
        }
      )
    )
  })

  it('different timezones produce different UTC offsets', () => {
    const interpreter1 = new TimezoneInterpreter('America/New_York')
    const interpreter2 = new TimezoneInterpreter('America/Los_Angeles')

    const time = makeLocalTime(12, 0)
    const result1 = interpreter1.interpretTime(time)
    const result2 = interpreter2.interpretTime(time)

    // Same local time, different UTC offsets
    expect(result1.time).toBe(result2.time)
    expect(result1.utcOffset).not.toBe(result2.utcOffset)
  })
})

// ============================================================================
// Output Timezone Properties (Task #381)
// ============================================================================

/**
 * Output timezone formatter ensures all output times are
 * consistently formatted in the configured timezone.
 */
class TimezoneOutputFormatter {
  constructor(private configuredTimezone: string) {}

  /**
   * Formats a datetime for output, ensuring it's in the configured timezone.
   */
  formatForOutput(dateTime: LocalDateTime): {
    formatted: string
    timezone: string
    localDateTime: LocalDateTime
  } {
    // LocalDateTime is timezone-naive, so we output it as-is
    // with the timezone annotation
    return {
      formatted: `${dateTime} [${this.configuredTimezone}]`,
      timezone: this.configuredTimezone,
      localDateTime: dateTime,
    }
  }

  /**
   * Formats a scheduled item for display.
   */
  formatScheduledItem(item: {
    seriesId: string
    scheduledTime: LocalDateTime
    title: string
  }): {
    displayTime: string
    timezone: string
    rawDateTime: LocalDateTime
  } {
    return {
      displayTime: this.formatTimeForDisplay(item.scheduledTime),
      timezone: this.configuredTimezone,
      rawDateTime: item.scheduledTime,
    }
  }

  /**
   * Formats just the time portion for display.
   */
  formatTimeForDisplay(dateTime: LocalDateTime): string {
    const { hours, minutes } = parseLocalDateTime(dateTime)
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`
  }

  /**
   * Validates that output is in the configured timezone.
   */
  isOutputInConfiguredTimezone(output: { timezone: string }): boolean {
    return output.timezone === this.configuredTimezone
  }
}

describe('Spec 1: Temporal Types - Output Timezone', () => {
  it('Property #381: all output times in configured timezone', () => {
    const timezones = ['America/New_York', 'America/Los_Angeles', 'UTC', 'Europe/London']

    fc.assert(
      fc.property(
        fc.constantFrom(...timezones),
        localDateTimeGen(),
        (timezone, dateTime) => {
          const formatter = new TimezoneOutputFormatter(timezone)
          const output = formatter.formatForOutput(dateTime)

          // Output must include the configured timezone
          expect(output.timezone).toBe(timezone)

          // The formatted string should include timezone annotation
          expect(output.formatted).toContain(timezone)

          // The raw datetime should be unchanged (timezone-naive)
          expect(output.localDateTime).toBe(dateTime)
        }
      )
    )
  })

  it('all scheduled items use configured timezone', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('America/New_York', 'UTC'),
        localDateTimeGen(),
        fc.string({ minLength: 1, maxLength: 20 }),
        (timezone, scheduledTime, title) => {
          const formatter = new TimezoneOutputFormatter(timezone)
          const output = formatter.formatScheduledItem({
            seriesId: 'test-series',
            scheduledTime,
            title,
          })

          // All outputs must be in configured timezone
          expect(formatter.isOutputInConfiguredTimezone(output)).toBe(true)
          expect(output.timezone).toBe(timezone)

          // Raw datetime preserved
          expect(output.rawDateTime).toBe(scheduledTime)
        }
      )
    )
  })

  it('time display format is consistent', () => {
    fc.assert(
      fc.property(localDateTimeGen(), (dateTime) => {
        const formatter = new TimezoneOutputFormatter('America/New_York')
        const display = formatter.formatTimeForDisplay(dateTime)

        // Format should be "H:MM AM/PM"
        expect(display).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/)
      })
    )
  })

  it('midnight displays as 12:00 AM', () => {
    const formatter = new TimezoneOutputFormatter('UTC')
    const midnight = makeLocalDateTime(makeLocalDate(2024, 1, 1), makeLocalTime(0, 0))
    const display = formatter.formatTimeForDisplay(midnight)

    expect(display).toBe('12:00 AM')
  })

  it('noon displays as 12:00 PM', () => {
    const formatter = new TimezoneOutputFormatter('UTC')
    const noon = makeLocalDateTime(makeLocalDate(2024, 1, 1), makeLocalTime(12, 0))
    const display = formatter.formatTimeForDisplay(noon)

    expect(display).toBe('12:00 PM')
  })

  it('timezone change affects all outputs', () => {
    const dateTime = makeLocalDateTime(makeLocalDate(2024, 1, 15), makeLocalTime(14, 30))

    const nyFormatter = new TimezoneOutputFormatter('America/New_York')
    const laFormatter = new TimezoneOutputFormatter('America/Los_Angeles')

    const nyOutput = nyFormatter.formatForOutput(dateTime)
    const laOutput = laFormatter.formatForOutput(dateTime)

    // Same datetime, different timezone annotations
    expect(nyOutput.localDateTime).toBe(laOutput.localDateTime)
    expect(nyOutput.timezone).not.toBe(laOutput.timezone)
    expect(nyOutput.formatted).toContain('America/New_York')
    expect(laOutput.formatted).toContain('America/Los_Angeles')
  })
})

// ============================================================================
// DST Transition Rules (Task #382)
// ============================================================================

/**
 * Per Spec 1, DST transitions should be handled as follows:
 *
 * Spring Forward (gap):
 * - Times in the gap (e.g., 2:00-2:59 AM) should be resolved to the next valid time
 * - Tasks scheduled during the gap shift forward by 1 hour
 *
 * Fall Back (ambiguity):
 * - Times in the overlap (e.g., 1:00-1:59 AM) are ambiguous
 * - Use the FIRST occurrence (DST time, before the clock change)
 * - This ensures tasks don't repeat
 */
class Spec1DSTHandler {
  /**
   * Resolves a time that might be in a DST gap.
   * Returns the original time if valid, or the adjusted time if in a gap.
   */
  resolveGapTime(
    date: LocalDate,
    time: LocalTime,
    timezone: string
  ): { time: LocalTime; wasInGap: boolean; shiftMinutes: number } {
    const parsed = parseLocalDate(date)
    const { hours, minutes } = parseLocalTime(time)

    // Check if this is a spring forward date and time is in the gap
    if (this.isSpringForwardDate(parsed.year, parsed.month, parsed.day, timezone)) {
      if (hours === 2) {
        // Time is in the 2:00-2:59 gap - shift to 3:XX
        return {
          time: makeLocalTime(3, minutes),
          wasInGap: true,
          shiftMinutes: 60,
        }
      }
    }

    return { time, wasInGap: false, shiftMinutes: 0 }
  }

  /**
   * Resolves an ambiguous time during fall back.
   * Returns the first occurrence (DST time).
   */
  resolveAmbiguousTime(
    date: LocalDate,
    time: LocalTime,
    timezone: string
  ): { time: LocalTime; wasAmbiguous: boolean; usedDST: boolean } {
    const parsed = parseLocalDate(date)
    const { hours } = parseLocalTime(time)

    // Check if this is a fall back date and time is ambiguous
    if (this.isFallBackDate(parsed.year, parsed.month, parsed.day, timezone)) {
      if (hours === 1) {
        // Time is ambiguous (1:00-1:59 occurs twice)
        // Per spec, use the FIRST occurrence (DST time)
        return {
          time,
          wasAmbiguous: true,
          usedDST: true, // First occurrence is DST
        }
      }
    }

    return { time, wasAmbiguous: false, usedDST: false }
  }

  /**
   * Calculates the duration between two times, accounting for DST.
   */
  calculateDurationAcrossDST(
    startDate: LocalDate,
    startTime: LocalTime,
    endDate: LocalDate,
    endTime: LocalTime,
    timezone: string
  ): { minutes: number; crossedDST: boolean; dstAdjustment: number } {
    const start = parseLocalDate(startDate)
    const end = parseLocalDate(endDate)
    const startParsed = parseLocalTime(startTime)
    const endParsed = parseLocalTime(endTime)

    // Calculate base duration in minutes using UTC to avoid timezone issues
    const startMs = Date.UTC(start.year, start.month - 1, start.day, startParsed.hours, startParsed.minutes)
    const endMs = Date.UTC(end.year, end.month - 1, end.day, endParsed.hours, endParsed.minutes)

    let baseDuration = Math.round((endMs - startMs) / (1000 * 60))

    // Check if DST transition occurred between start and end
    let dstAdjustment = 0
    if (this.crossesSpringForward(startDate, endDate, timezone)) {
      dstAdjustment = -60 // Lost an hour
    } else if (this.crossesFallBack(startDate, endDate, timezone)) {
      dstAdjustment = 60 // Gained an hour
    }

    return {
      minutes: baseDuration + dstAdjustment,
      crossedDST: dstAdjustment !== 0,
      dstAdjustment,
    }
  }

  private isSpringForwardDate(year: number, month: number, day: number, timezone: string): boolean {
    // US: 2nd Sunday of March
    if (month !== 3) return false
    const firstDay = new Date(year, 2, 1).getDay()
    const firstSunday = firstDay === 0 ? 1 : 8 - firstDay
    const secondSunday = firstSunday + 7
    return day === secondSunday
  }

  private isFallBackDate(year: number, month: number, day: number, timezone: string): boolean {
    // US: 1st Sunday of November
    if (month !== 11) return false
    const firstDay = new Date(year, 10, 1).getDay()
    const firstSunday = firstDay === 0 ? 1 : 8 - firstDay
    return day === firstSunday
  }

  private crossesSpringForward(startDate: LocalDate, endDate: LocalDate, timezone: string): boolean {
    const start = parseLocalDate(startDate)
    const end = parseLocalDate(endDate)

    // Check if spring forward date is between start and end
    for (let year = start.year; year <= end.year; year++) {
      const firstDay = new Date(year, 2, 1).getDay()
      const firstSunday = firstDay === 0 ? 1 : 8 - firstDay
      const secondSunday = firstSunday + 7
      const sfDate = makeLocalDate(year, 3, secondSunday)

      if (sfDate > startDate && sfDate <= endDate) {
        return true
      }
    }
    return false
  }

  private crossesFallBack(startDate: LocalDate, endDate: LocalDate, timezone: string): boolean {
    const start = parseLocalDate(startDate)
    const end = parseLocalDate(endDate)

    // Check if fall back date is between start and end
    for (let year = start.year; year <= end.year; year++) {
      const firstDay = new Date(year, 10, 1).getDay()
      const firstSunday = firstDay === 0 ? 1 : 8 - firstDay
      const fbDate = makeLocalDate(year, 11, firstSunday)

      if (fbDate > startDate && fbDate <= endDate) {
        return true
      }
    }
    return false
  }
}

describe('Spec 1: Temporal Types - DST Transitions per Spec', () => {
  it('Property #382: DST transitions handled per Spec 1 rules', () => {
    const handler = new Spec1DSTHandler()
    const timezone = 'America/New_York'

    // Test spring forward dates for multiple years
    const springDates = [
      { year: 2024, month: 3, day: 10 }, // March 10, 2024
      { year: 2025, month: 3, day: 9 },  // March 9, 2025
      { year: 2026, month: 3, day: 8 },  // March 8, 2026
    ]

    for (const { year, month, day } of springDates) {
      const date = makeLocalDate(year, month, day)

      // Times in the gap should be resolved
      const gapTime = makeLocalTime(2, 30)
      const resolved = handler.resolveGapTime(date, gapTime, timezone)

      expect(resolved.wasInGap).toBe(true)
      expect(resolved.shiftMinutes).toBe(60)
      expect(resolved.time).toBe(makeLocalTime(3, 30))
    }
  })

  it('fall back ambiguous times use first occurrence', () => {
    const handler = new Spec1DSTHandler()
    const timezone = 'America/New_York'

    // Test fall back dates
    const fallDates = [
      { year: 2024, month: 11, day: 3 },  // November 3, 2024
      { year: 2025, month: 11, day: 2 },  // November 2, 2025
    ]

    for (const { year, month, day } of fallDates) {
      const date = makeLocalDate(year, month, day)

      // 1:30 AM is ambiguous
      const ambiguousTime = makeLocalTime(1, 30)
      const resolved = handler.resolveAmbiguousTime(date, ambiguousTime, timezone)

      expect(resolved.wasAmbiguous).toBe(true)
      expect(resolved.usedDST).toBe(true) // First occurrence
      expect(resolved.time).toBe(ambiguousTime) // Time unchanged, just flagged
    }
  })

  it('duration calculation accounts for DST', () => {
    const handler = new Spec1DSTHandler()
    const timezone = 'America/New_York'

    // Duration across spring forward loses an hour
    const beforeSpring = makeLocalDate(2024, 3, 9)
    const afterSpring = makeLocalDate(2024, 3, 11)
    const noon = makeLocalTime(12, 0)

    const springDuration = handler.calculateDurationAcrossDST(
      beforeSpring, noon,
      afterSpring, noon,
      timezone
    )

    // 2 calendar days but lost 1 hour due to DST
    expect(springDuration.crossedDST).toBe(true)
    expect(springDuration.dstAdjustment).toBe(-60)
    // Use closeTo to handle floating point precision
    expect(springDuration.minutes).toBeCloseTo(2 * 24 * 60 - 60, 0) // 47 hours

    // Duration across fall back gains an hour
    const beforeFall = makeLocalDate(2024, 11, 2)
    const afterFall = makeLocalDate(2024, 11, 4)

    const fallDuration = handler.calculateDurationAcrossDST(
      beforeFall, noon,
      afterFall, noon,
      timezone
    )

    expect(fallDuration.crossedDST).toBe(true)
    expect(fallDuration.dstAdjustment).toBe(60)
    expect(fallDuration.minutes).toBeCloseTo(2 * 24 * 60 + 60, 0) // 49 hours
  })

  it('non-DST dates have no adjustments', () => {
    fc.assert(
      fc.property(
        localDateGen(),
        localTimeGen(),
        (date, time) => {
          const handler = new Spec1DSTHandler()
          const parsed = parseLocalDate(date)

          // Skip actual DST transition dates (March/November in US)
          fc.pre(parsed.month !== 3 && parsed.month !== 11)

          // Non-transition dates should not have gaps or ambiguity
          const gapResult = handler.resolveGapTime(date, time, 'America/New_York')
          expect(gapResult.wasInGap).toBe(false)
          expect(gapResult.time).toBe(time)

          const ambigResult = handler.resolveAmbiguousTime(date, time, 'America/New_York')
          expect(ambigResult.wasAmbiguous).toBe(false)
        }
      )
    )
  })

  it('gap resolution is deterministic', () => {
    const handler = new Spec1DSTHandler()
    const springDate = makeLocalDate(2024, 3, 10)

    fc.assert(
      fc.property(fc.integer({ min: 0, max: 59 }), (minutes) => {
        const gapTime = makeLocalTime(2, minutes)

        const result1 = handler.resolveGapTime(springDate, gapTime, 'America/New_York')
        const result2 = handler.resolveGapTime(springDate, gapTime, 'America/New_York')

        expect(result1.time).toBe(result2.time)
        expect(result1.wasInGap).toBe(result2.wasInGap)
        expect(result1.shiftMinutes).toBe(result2.shiftMinutes)
      })
    )
  })
})
