/**
 * Segment 02: Pattern Expansion Tests
 *
 * Tests pattern expansion - a pure function that takes a pattern definition,
 * date range, and series start date, and produces the set of dates on which
 * instances occur.
 *
 * Covers all 13 pattern types plus composition operations.
 */

import { describe, it, expect } from 'vitest'
import {
  // Pattern types
  daily,
  everyNDays,
  weekly,
  everyNWeeks,
  monthly,
  lastDayOfMonth,
  yearly,
  weekdays,
  weekdaysOnly,
  weekendsOnly,
  nthWeekdayOfMonth,
  lastWeekdayOfMonth,
  nthToLastWeekdayOfMonth,
  // Composition
  unionPatterns,
  exceptPatterns,
  // Core function
  expandPattern,
  // Errors
  InvalidPatternError,
  InvalidRangeError,
  // Types
  type Pattern,
  type DateRange,
  type LocalDate,
} from '../src/pattern-expansion'

import { dayOfWeek, daysBetween, addDays, dayOf, daysInMonth, yearOf, monthOf } from '../src/time-date'

// ============================================================================
// 1. DAILY PATTERN
// ============================================================================

describe('Daily Pattern', () => {
  describe('Unit Tests', () => {
    it('daily 7-day range produces 7 dates', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
      const result = expandPattern(daily(), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(7)
    })

    it('daily single day produces 1 date', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-02' as LocalDate }
      const result = expandPattern(daily(), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(1)
      expect(result.has('2024-01-01' as LocalDate)).toBe(true)
    })

    it('daily month boundary', () => {
      const range: DateRange = { start: '2024-01-30' as LocalDate, end: '2024-02-03' as LocalDate }
      const result = expandPattern(daily(), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(4)
      expect(result.has('2024-01-30' as LocalDate)).toBe(true)
      expect(result.has('2024-01-31' as LocalDate)).toBe(true)
      expect(result.has('2024-02-01' as LocalDate)).toBe(true)
      expect(result.has('2024-02-02' as LocalDate)).toBe(true)
    })

    it('daily year boundary', () => {
      const range: DateRange = { start: '2023-12-30' as LocalDate, end: '2024-01-03' as LocalDate }
      const result = expandPattern(daily(), range, '2023-01-01' as LocalDate)
      expect(result.size).toBe(4)
    })

    it('daily leap year Feb', () => {
      const range: DateRange = { start: '2024-02-28' as LocalDate, end: '2024-03-02' as LocalDate }
      const result = expandPattern(daily(), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(3)
      expect(result.has('2024-02-29' as LocalDate)).toBe(true)
    })

    it('daily non-leap Feb', () => {
      const range: DateRange = { start: '2023-02-28' as LocalDate, end: '2023-03-02' as LocalDate }
      const result = expandPattern(daily(), range, '2023-01-01' as LocalDate)
      expect(result.size).toBe(2)
    })
  })

  describe('Property-Based Tests', () => {
    it('daily count equals exclusive range span', () => {
      const testCases = [
        { start: '2024-01-01', end: '2024-02-01' },
        { start: '2024-02-01', end: '2024-03-01' },
        { start: '2024-03-15', end: '2024-04-16' },
      ]
      for (const tc of testCases) {
        const range: DateRange = { start: tc.start as LocalDate, end: tc.end as LocalDate }
        const result = expandPattern(daily(), range, '2024-01-01' as LocalDate)
        const expected = daysBetween(tc.start as LocalDate, tc.end as LocalDate)
        expect(result.size).toBe(expected)
      }
    })

    it('daily contains all dates in range', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-11' as LocalDate }
      const result = expandPattern(daily(), range, '2024-01-01' as LocalDate)
      let d = range.start
      while (d < range.end) {
        expect(result.has(d)).toBe(true)
        d = addDays(d, 1)
      }
    })
  })
})

// ============================================================================
// 2. EVERY N DAYS PATTERN
// ============================================================================

describe('Every N Days Pattern', () => {
  describe('Unit Tests', () => {
    it('everyNDays(2) over January produces 16 dates', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const result = expandPattern(everyNDays(2), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(16)
      expect(result.has('2024-01-01' as LocalDate)).toBe(true)
      expect(result.has('2024-01-03' as LocalDate)).toBe(true)
      expect(result.has('2024-01-31' as LocalDate)).toBe(true)
    })

    it('everyNDays(3) over January produces 11 dates', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const result = expandPattern(everyNDays(3), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(11)
    })

    it('everyNDays anchor includes series start', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-11' as LocalDate }
      const result = expandPattern(everyNDays(2), range, '2024-01-01' as LocalDate)
      expect(result.has('2024-01-01' as LocalDate)).toBe(true)
    })

    it('everyNDays phase from mid-month', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const result = expandPattern(everyNDays(3), range, '2024-01-05' as LocalDate)
      expect(result.has('2024-01-05' as LocalDate)).toBe(true)
      expect(result.has('2024-01-08' as LocalDate)).toBe(true)
      expect(result.has('2024-01-11' as LocalDate)).toBe(true)
      expect(result.has('2024-01-01' as LocalDate)).toBe(false)
    })

    it('everyNDays start after range returns empty', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-11' as LocalDate }
      const result = expandPattern(everyNDays(2), range, '2024-01-15' as LocalDate)
      expect(result.size).toBe(0)
    })

    it('everyNDays n > range span', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-11' as LocalDate }
      const result = expandPattern(everyNDays(30), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(1)
      expect(result.has('2024-01-01' as LocalDate)).toBe(true)
    })

    it('everyNDays(1) equals daily', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
      const every1 = expandPattern(everyNDays(1), range, '2024-01-01' as LocalDate)
      const dailyResult = expandPattern(daily(), range, '2024-01-01' as LocalDate)
      expect(every1.size).toBe(dailyResult.size)
    })
  })

  describe('Property-Based Tests', () => {
    it('everyNDays periodicity', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-04-01' as LocalDate }
      const n = 5
      const result = expandPattern(everyNDays(n), range, '2024-01-01' as LocalDate)
      for (const d of result) {
        const next = addDays(d, n)
        if (next < range.end) {
          expect(result.has(next)).toBe(true)
        }
      }
    })

    it('everyNDays phase - all dates congruent to seriesStart mod n', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-03-01' as LocalDate }
      const n = 7
      const seriesStart = '2024-01-03' as LocalDate
      const result = expandPattern(everyNDays(n), range, seriesStart)
      for (const d of result) {
        const diff = daysBetween(seriesStart, d)
        expect(diff % n).toBe(0)
      }
    })

    it('everyNDays includes anchor when in range', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const seriesStart = '2024-01-10' as LocalDate
      const result = expandPattern(everyNDays(3), range, seriesStart)
      expect(result.has(seriesStart)).toBe(true)
    })
  })
})

// ============================================================================
// 3. WEEKLY PATTERN
// ============================================================================

describe('Weekly Pattern', () => {
  describe('Unit Tests', () => {
    it('weekly Mon start produces 5 Mondays', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const result = expandPattern(weekly(), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(5)
      for (const d of result) {
        expect(dayOfWeek(d)).toBe('mon')
      }
    })

    it('weekly Fri start', () => {
      const range: DateRange = { start: '2024-01-05' as LocalDate, end: '2024-02-03' as LocalDate }
      const result = expandPattern(weekly(), range, '2024-01-05' as LocalDate)
      expect(result.size).toBe(5)
      for (const d of result) {
        expect(dayOfWeek(d)).toBe('fri')
      }
    })

    it('weekly across year boundary', () => {
      const range: DateRange = { start: '2023-12-25' as LocalDate, end: '2024-01-16' as LocalDate }
      const result = expandPattern(weekly(), range, '2023-12-25' as LocalDate)
      for (const d of result) {
        expect(dayOfWeek(d)).toBe('mon')
      }
    })
  })

  describe('Property-Based Tests', () => {
    it('weekly all same weekday as seriesStart', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-04-01' as LocalDate }
      const seriesStart = '2024-01-03' as LocalDate // Wednesday
      const result = expandPattern(weekly(), range, seriesStart)
      const expectedWeekday = dayOfWeek(seriesStart)
      for (const d of result) {
        expect(dayOfWeek(d)).toBe(expectedWeekday)
      }
    })

    it('weekly consecutive dates are 7 days apart', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-04-01' as LocalDate }
      const result = expandPattern(weekly(), range, '2024-01-01' as LocalDate)
      const sorted = [...result].sort()
      for (let i = 1; i < sorted.length; i++) {
        expect(daysBetween(sorted[i - 1] as LocalDate, sorted[i] as LocalDate)).toBe(7)
      }
    })
  })
})

// ============================================================================
// 4. EVERY N WEEKS PATTERN
// ============================================================================

describe('Every N Weeks Pattern', () => {
  describe('Unit Tests', () => {
    it('everyNWeeks(2) bi-weekly', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-03-01' as LocalDate }
      const result = expandPattern(everyNWeeks(2), range, '2024-01-01' as LocalDate)
      expect(result.size).toBeGreaterThanOrEqual(4)
      expect(result.size).toBeLessThanOrEqual(5)
    })

    it('everyNWeeks explicit weekday', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const result = expandPattern(everyNWeeks(2, 'wed'), range, '2024-01-01' as LocalDate)
      for (const d of result) {
        expect(dayOfWeek(d)).toBe('wed')
      }
    })

    it('everyNWeeks(1) same as weekly', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const seriesStart = '2024-01-01' as LocalDate
      const everyWeek = expandPattern(everyNWeeks(1), range, seriesStart)
      const weeklyResult = expandPattern(weekly(), range, seriesStart)
      expect(everyWeek.size).toBe(weeklyResult.size)
    })

    it('everyNWeeks default weekday uses start weekday', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const seriesStart = '2024-01-03' as LocalDate // Wednesday
      const result = expandPattern(everyNWeeks(2), range, seriesStart)
      for (const d of result) {
        expect(dayOfWeek(d)).toBe('wed')
      }
    })
  })

  describe('Property-Based Tests', () => {
    it('everyNWeeks correct weekday', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-07-01' as LocalDate }
      const result = expandPattern(everyNWeeks(3, 'thu'), range, '2024-01-04' as LocalDate)
      for (const d of result) {
        expect(dayOfWeek(d)).toBe('thu')
      }
    })

    it('everyNWeeks consecutive dates are 7n days apart', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-07-01' as LocalDate }
      const n = 3
      const result = expandPattern(everyNWeeks(n), range, '2024-01-01' as LocalDate)
      const sorted = [...result].sort()
      for (let i = 1; i < sorted.length; i++) {
        expect(daysBetween(sorted[i - 1] as LocalDate, sorted[i] as LocalDate)).toBe(7 * n)
      }
    })
  })
})

// ============================================================================
// 5. MONTHLY (BY DATE) PATTERN
// ============================================================================

describe('Monthly (by date) Pattern', () => {
  describe('Unit Tests', () => {
    it('monthly(15) full year produces 12 dates', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(monthly(15), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(12)
      for (const d of result) {
        expect(dayOf(d)).toBe(15)
      }
    })

    it('monthly(31) full year produces 7 dates (31-day months only)', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(monthly(31), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(7)
    })

    it('monthly(30) full year produces 11 dates (skips Feb)', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(monthly(30), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(11)
    })

    it('monthly(29) leap year produces 12 dates', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(monthly(29), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(12)
    })

    it('monthly(29) non-leap year produces 11 dates', () => {
      const range: DateRange = { start: '2023-01-01' as LocalDate, end: '2024-01-01' as LocalDate }
      const result = expandPattern(monthly(29), range, '2023-01-01' as LocalDate)
      expect(result.size).toBe(11)
    })

    it('monthly(31) skips short months', () => {
      const range: DateRange = { start: '2024-04-01' as LocalDate, end: '2024-07-01' as LocalDate }
      const result = expandPattern(monthly(31), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(1)
      expect(result.has('2024-05-31' as LocalDate)).toBe(true)
    })
  })

  describe('Property-Based Tests', () => {
    it('monthly day matches', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const day = 15
      const result = expandPattern(monthly(day), range, '2024-01-01' as LocalDate)
      for (const d of result) {
        expect(dayOf(d)).toBe(day)
      }
    })

    it('monthly no coercion - day not exist means month skipped', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(monthly(31), range, '2024-01-01' as LocalDate)
      // Should not have Apr, Jun, Sep, Nov (30-day months) or Feb
      for (const d of result) {
        const month = monthOf(d)
        expect([1, 3, 5, 7, 8, 10, 12]).toContain(month)
      }
    })
  })
})

// ============================================================================
// 6. LAST DAY OF MONTH PATTERN
// ============================================================================

describe('Last Day of Month Pattern', () => {
  describe('Unit Tests', () => {
    it('lastDayOfMonth full year 2024 produces 12 dates', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(lastDayOfMonth(), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(12)
    })

    it('lastDayOfMonth Feb leap produces Feb 29', () => {
      const range: DateRange = { start: '2024-02-01' as LocalDate, end: '2024-03-01' as LocalDate }
      const result = expandPattern(lastDayOfMonth(), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(1)
      expect(result.has('2024-02-29' as LocalDate)).toBe(true)
    })

    it('lastDayOfMonth Feb non-leap produces Feb 28', () => {
      const range: DateRange = { start: '2023-02-01' as LocalDate, end: '2023-03-01' as LocalDate }
      const result = expandPattern(lastDayOfMonth(), range, '2023-01-01' as LocalDate)
      expect(result.size).toBe(1)
      expect(result.has('2023-02-28' as LocalDate)).toBe(true)
    })

    it('lastDayOfMonth various lengths', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-05-01' as LocalDate }
      const result = expandPattern(lastDayOfMonth(), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(4)
      expect(result.has('2024-01-31' as LocalDate)).toBe(true)
      expect(result.has('2024-02-29' as LocalDate)).toBe(true)
      expect(result.has('2024-03-31' as LocalDate)).toBe(true)
      expect(result.has('2024-04-30' as LocalDate)).toBe(true)
    })
  })

  describe('Property-Based Tests', () => {
    it('lastDayOfMonth one per month', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(lastDayOfMonth(), range, '2024-01-01' as LocalDate)
      const months = new Set([...result].map((d) => monthOf(d)))
      expect(months.size).toBe(result.size)
    })

    it('lastDayOfMonth valid last day', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(lastDayOfMonth(), range, '2024-01-01' as LocalDate)
      for (const d of result) {
        expect([28, 29, 30, 31]).toContain(dayOf(d))
        expect(dayOf(d)).toBe(daysInMonth(yearOf(d), monthOf(d)))
      }
    })
  })
})

// ============================================================================
// 7. YEARLY PATTERN
// ============================================================================

describe('Yearly Pattern', () => {
  describe('Unit Tests', () => {
    it('yearly Mar 15 over 3 years', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2027-01-01' as LocalDate }
      const result = expandPattern(yearly(3, 15), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(3)
    })

    it('yearly Feb 29 leap years only', () => {
      const range: DateRange = { start: '2020-01-01' as LocalDate, end: '2029-01-01' as LocalDate }
      const result = expandPattern(yearly(2, 29), range, '2020-01-01' as LocalDate)
      // 2020, 2024, 2028 are leap years
      expect(result.size).toBe(3)
      expect(result.has('2020-02-29' as LocalDate)).toBe(true)
      expect(result.has('2024-02-29' as LocalDate)).toBe(true)
      expect(result.has('2028-02-29' as LocalDate)).toBe(true)
    })

    it('yearly Feb 30 always empty', () => {
      const range: DateRange = { start: '2020-01-01' as LocalDate, end: '2031-01-01' as LocalDate }
      const result = expandPattern(yearly(2, 30), range, '2020-01-01' as LocalDate)
      expect(result.size).toBe(0)
    })

    it('yearly Dec 31', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(yearly(12, 31), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(1)
      expect(result.has('2024-12-31' as LocalDate)).toBe(true)
    })
  })

  describe('Property-Based Tests', () => {
    it('yearly at most one per year', () => {
      const range: DateRange = { start: '2020-01-01' as LocalDate, end: '2031-01-01' as LocalDate }
      const result = expandPattern(yearly(6, 15), range, '2020-01-01' as LocalDate)
      const years = new Set([...result].map((d) => yearOf(d)))
      expect(years.size).toBe(result.size)
    })

    it('yearly Feb 29 only in leap years', () => {
      const range: DateRange = { start: '2020-01-01' as LocalDate, end: '2031-01-01' as LocalDate }
      const result = expandPattern(yearly(2, 29), range, '2020-01-01' as LocalDate)
      for (const d of result) {
        const year = yearOf(d)
        // Check leap year: divisible by 4, not 100, or by 400
        const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
        expect(isLeap).toBe(true)
      }
    })
  })
})

// ============================================================================
// 8. WEEKDAYS PATTERN
// ============================================================================

describe('Weekdays Pattern', () => {
  describe('Unit Tests', () => {
    it('weekdays Mon only', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
      const result = expandPattern(weekdays(['mon']), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(1)
      for (const d of result) {
        expect(dayOfWeek(d)).toBe('mon')
      }
    })

    it('weekdays MWF', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
      const result = expandPattern(weekdays(['mon', 'wed', 'fri']), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(3)
    })

    it('weekdays TTh', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
      const result = expandPattern(weekdays(['tue', 'thu']), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(2)
    })

    it('weekdays all days equals daily', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
      const result = expandPattern(
        weekdays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
        range,
        '2024-01-01' as LocalDate
      )
      expect(result.size).toBe(7)
    })
  })

  describe('Property-Based Tests', () => {
    it('weekdays matches pattern days', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const days = ['mon', 'wed', 'fri'] as const
      const result = expandPattern(weekdays([...days]), range, '2024-01-01' as LocalDate)
      for (const d of result) {
        expect(days).toContain(dayOfWeek(d))
      }
    })

    it('weekdays complete - every matching date in range included', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const days = ['mon', 'wed'] as const
      const result = expandPattern(weekdays([...days]), range, '2024-01-01' as LocalDate)
      let d = range.start
      while (d < range.end) {
        if (days.includes(dayOfWeek(d) as (typeof days)[number])) {
          expect(result.has(d)).toBe(true)
        }
        d = addDays(d, 1)
      }
    })
  })
})

// ============================================================================
// 9. WEEKDAYS ONLY PATTERN (Mon-Fri)
// ============================================================================

describe('Weekdays Only Pattern', () => {
  it('weekdaysOnly one week', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
    const result = expandPattern(weekdaysOnly(), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(5)
    for (const d of result) {
      expect(['mon', 'tue', 'wed', 'thu', 'fri']).toContain(dayOfWeek(d))
    }
  })

  it('weekdaysOnly starts weekend', () => {
    const range: DateRange = { start: '2024-01-06' as LocalDate, end: '2024-01-13' as LocalDate }
    const result = expandPattern(weekdaysOnly(), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(5)
  })

  it('weekdaysOnly full month', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
    const result = expandPattern(weekdaysOnly(), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(23)
  })
})

// ============================================================================
// 10. WEEKENDS ONLY PATTERN (Sat-Sun)
// ============================================================================

describe('Weekends Only Pattern', () => {
  it('weekendsOnly one week', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
    const result = expandPattern(weekendsOnly(), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(2)
    for (const d of result) {
      expect(['sat', 'sun']).toContain(dayOfWeek(d))
    }
  })

  it('weekendsOnly full month', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
    const result = expandPattern(weekendsOnly(), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(8)
  })
})

// ============================================================================
// 11. NTH WEEKDAY OF MONTH PATTERN
// ============================================================================

describe('Nth Weekday of Month Pattern', () => {
  describe('Unit Tests', () => {
    it('2nd Thu Jan 2024', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const result = expandPattern(nthWeekdayOfMonth(2, 'thu'), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(1)
      expect(result.has('2024-01-11' as LocalDate)).toBe(true)
    })

    it('2nd Thu full year produces 12 dates', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(nthWeekdayOfMonth(2, 'thu'), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(12)
    })

    it('1st Mon Jan 2024', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const result = expandPattern(nthWeekdayOfMonth(1, 'mon'), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(1)
      expect(result.has('2024-01-01' as LocalDate)).toBe(true)
    })

    it('5th Thu Feb 2024 (leap)', () => {
      const range: DateRange = { start: '2024-02-01' as LocalDate, end: '2024-03-01' as LocalDate }
      const result = expandPattern(nthWeekdayOfMonth(5, 'thu'), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(1)
      expect(result.has('2024-02-29' as LocalDate)).toBe(true)
    })

    it('5th Thu Feb 2023 (non-leap) empty', () => {
      const range: DateRange = { start: '2023-02-01' as LocalDate, end: '2023-03-01' as LocalDate }
      const result = expandPattern(nthWeekdayOfMonth(5, 'thu'), range, '2023-01-01' as LocalDate)
      expect(result.size).toBe(0)
    })

    it('5th Mon most months', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(nthWeekdayOfMonth(5, 'mon'), range, '2024-01-01' as LocalDate)
      expect(result.size).toBeGreaterThanOrEqual(4)
      expect(result.size).toBeLessThanOrEqual(5)
    })
  })

  describe('Property-Based Tests', () => {
    it('nthWeekday at most one per month', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(nthWeekdayOfMonth(2, 'wed'), range, '2024-01-01' as LocalDate)
      const months = new Set([...result].map((d) => monthOf(d)))
      expect(months.size).toBe(result.size)
    })

    it('nthWeekday correct weekday', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(nthWeekdayOfMonth(3, 'fri'), range, '2024-01-01' as LocalDate)
      for (const d of result) {
        expect(dayOfWeek(d)).toBe('fri')
      }
    })

    it('1st weekday between days 1-7', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(nthWeekdayOfMonth(1, 'tue'), range, '2024-01-01' as LocalDate)
      for (const d of result) {
        expect(dayOf(d)).toBeGreaterThanOrEqual(1)
        expect(dayOf(d)).toBeLessThanOrEqual(7)
      }
    })

    it('2nd weekday between days 8-14', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(nthWeekdayOfMonth(2, 'tue'), range, '2024-01-01' as LocalDate)
      for (const d of result) {
        expect(dayOf(d)).toBeGreaterThanOrEqual(8)
        expect(dayOf(d)).toBeLessThanOrEqual(14)
      }
    })
  })
})

// ============================================================================
// 12. LAST WEEKDAY OF MONTH PATTERN
// ============================================================================

describe('Last Weekday of Month Pattern', () => {
  describe('Unit Tests', () => {
    it('last Fri Jan 2024', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const result = expandPattern(lastWeekdayOfMonth('fri'), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(1)
      expect(result.has('2024-01-26' as LocalDate)).toBe(true)
    })

    it('last Fri full year produces 12 dates', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(lastWeekdayOfMonth('fri'), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(12)
    })

    it('last Mon Feb leap', () => {
      const range: DateRange = { start: '2024-02-01' as LocalDate, end: '2024-03-01' as LocalDate }
      const result = expandPattern(lastWeekdayOfMonth('mon'), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(1)
      expect(result.has('2024-02-26' as LocalDate)).toBe(true)
    })

    it('last Sun Q1', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-04-01' as LocalDate }
      const result = expandPattern(lastWeekdayOfMonth('sun'), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(3)
    })
  })

  describe('Property-Based Tests', () => {
    it('lastWeekday one per month', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(lastWeekdayOfMonth('tue'), range, '2024-01-01' as LocalDate)
      const months = new Set([...result].map((d) => monthOf(d)))
      expect(months.size).toBe(result.size)
    })

    it('lastWeekday correct weekday', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(lastWeekdayOfMonth('wed'), range, '2024-01-01' as LocalDate)
      for (const d of result) {
        expect(dayOfWeek(d)).toBe('wed')
      }
    })

    it('lastWeekday in last 7 days', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const result = expandPattern(lastWeekdayOfMonth('thu'), range, '2024-01-01' as LocalDate)
      for (const d of result) {
        const monthDays = daysInMonth(yearOf(d), monthOf(d))
        expect(dayOf(d)).toBeGreaterThan(monthDays - 7)
      }
    })
  })
})

// ============================================================================
// 13. NTH-TO-LAST WEEKDAY OF MONTH PATTERN
// ============================================================================

describe('Nth-to-Last Weekday of Month Pattern', () => {
  describe('Unit Tests', () => {
    it('1st-to-last Fri equals lastWeekday Fri', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const nthToLast = expandPattern(nthToLastWeekdayOfMonth(1, 'fri'), range, '2024-01-01' as LocalDate)
      const last = expandPattern(lastWeekdayOfMonth('fri'), range, '2024-01-01' as LocalDate)
      expect(nthToLast.size).toBe(last.size)
      for (const d of nthToLast) {
        expect(last.has(d)).toBe(true)
      }
    })

    it('2nd-to-last Fri Jan 2024', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const result = expandPattern(nthToLastWeekdayOfMonth(2, 'fri'), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(1)
      expect(result.has('2024-01-19' as LocalDate)).toBe(true)
    })

    it('5th-to-last Fri short month empty', () => {
      const range: DateRange = { start: '2024-02-01' as LocalDate, end: '2024-03-01' as LocalDate }
      const result = expandPattern(nthToLastWeekdayOfMonth(5, 'fri'), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(0)
    })
  })

  describe('Property-Based Tests', () => {
    it('nthToLast n=1 equals lastWeekday', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
      const nthToLast = expandPattern(nthToLastWeekdayOfMonth(1, 'mon'), range, '2024-01-01' as LocalDate)
      const last = expandPattern(lastWeekdayOfMonth('mon'), range, '2024-01-01' as LocalDate)
      expect(nthToLast.size).toBe(last.size)
      for (const d of nthToLast) {
        expect(last.has(d)).toBe(true)
      }
    })
  })
})

// ============================================================================
// 14. PATTERN COMPOSITION - UNION
// ============================================================================

describe('Pattern Union', () => {
  describe('Unit Tests', () => {
    it('empty patterns produces empty', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const result = expandPattern(unionPatterns([]), range, '2024-01-01' as LocalDate)
      expect(result.size).toBe(0)
    })

    it('singleton pattern same as original', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
      const union = expandPattern(unionPatterns([daily()]), range, '2024-01-01' as LocalDate)
      const single = expandPattern(daily(), range, '2024-01-01' as LocalDate)
      expect(union.size).toBe(single.size)
    })

    it('duplicate patterns same as single', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
      const union = expandPattern(unionPatterns([daily(), daily()]), range, '2024-01-01' as LocalDate)
      const single = expandPattern(daily(), range, '2024-01-01' as LocalDate)
      expect(union.size).toBe(single.size)
    })

    it('MWF union', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
      const result = expandPattern(
        unionPatterns([weekdays(['mon']), weekdays(['wed']), weekdays(['fri'])]),
        range,
        '2024-01-01' as LocalDate
      )
      expect(result.size).toBe(3)
    })

    it('monthly union', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const result = expandPattern(
        unionPatterns([monthly(1), monthly(15)]),
        range,
        '2024-01-01' as LocalDate
      )
      expect(result.size).toBe(2)
    })
  })

  describe('Property-Based Tests', () => {
    it('union contains if any pattern produces', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const patterns = [weekdays(['mon']), weekdays(['fri'])]
      const union = expandPattern(unionPatterns(patterns), range, '2024-01-01' as LocalDate)
      const individual = patterns.map((p) => expandPattern(p, range, '2024-01-01' as LocalDate))

      // Every date in union should be in at least one pattern
      for (const d of union) {
        expect(individual.some((s) => s.has(d))).toBe(true)
      }

      // Every date in any pattern should be in union
      for (const s of individual) {
        for (const d of s) {
          expect(union.has(d)).toBe(true)
        }
      }
    })
  })
})

// ============================================================================
// 15. PATTERN COMPOSITION - EXCEPTION SUBTRACTION
// ============================================================================

describe('Exception Subtraction', () => {
  describe('Unit Tests', () => {
    it('no exceptions same as base', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
      const base = expandPattern(daily(), range, '2024-01-01' as LocalDate)
      const excepted = expandPattern(exceptPatterns(daily(), []), range, '2024-01-01' as LocalDate)
      expect(excepted.size).toBe(base.size)
    })

    it('daily except weekends', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
      const result = expandPattern(
        exceptPatterns(daily(), [weekendsOnly()]),
        range,
        '2024-01-01' as LocalDate
      )
      expect(result.size).toBe(5)
      for (const d of result) {
        expect(['sat', 'sun']).not.toContain(dayOfWeek(d))
      }
    })

    it('daily except 2nd Thu', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const result = expandPattern(
        exceptPatterns(daily(), [nthWeekdayOfMonth(2, 'thu')]),
        range,
        '2024-01-01' as LocalDate
      )
      expect(result.has('2024-01-11' as LocalDate)).toBe(false)
      expect(result.size).toBe(30)
    })

    it('full exception produces empty', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
      const result = expandPattern(
        exceptPatterns(weekdays(['mon']), [weekdays(['mon'])]),
        range,
        '2024-01-01' as LocalDate
      )
      expect(result.size).toBe(0)
    })

    it('multiple exceptions', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const result = expandPattern(
        exceptPatterns(daily(), [nthWeekdayOfMonth(1, 'mon'), nthWeekdayOfMonth(2, 'mon')]),
        range,
        '2024-01-01' as LocalDate
      )
      expect(result.has('2024-01-01' as LocalDate)).toBe(false)
      expect(result.has('2024-01-08' as LocalDate)).toBe(false)
    })

    it('overlapping exceptions same as single', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
      const single = expandPattern(
        exceptPatterns(daily(), [weekendsOnly()]),
        range,
        '2024-01-01' as LocalDate
      )
      const double = expandPattern(
        exceptPatterns(daily(), [weekendsOnly(), weekendsOnly()]),
        range,
        '2024-01-01' as LocalDate
      )
      expect(single.size).toBe(double.size)
    })
  })

  describe('Property-Based Tests', () => {
    it('subtraction removes dates', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const base = expandPattern(daily(), range, '2024-01-01' as LocalDate)
      const exceptions = expandPattern(weekendsOnly(), range, '2024-01-01' as LocalDate)
      const result = expandPattern(
        exceptPatterns(daily(), [weekendsOnly()]),
        range,
        '2024-01-01' as LocalDate
      )

      // Result should have base - exceptions
      for (const d of result) {
        expect(base.has(d)).toBe(true)
        expect(exceptions.has(d)).toBe(false)
      }
    })

    it('exception order independent', () => {
      const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
      const result1 = expandPattern(
        exceptPatterns(daily(), [nthWeekdayOfMonth(1, 'mon'), nthWeekdayOfMonth(2, 'tue')]),
        range,
        '2024-01-01' as LocalDate
      )
      const result2 = expandPattern(
        exceptPatterns(daily(), [nthWeekdayOfMonth(2, 'tue'), nthWeekdayOfMonth(1, 'mon')]),
        range,
        '2024-01-01' as LocalDate
      )
      expect(result1.size).toBe(result2.size)
      for (const d of result1) {
        expect(result2.has(d)).toBe(true)
      }
    })
  })
})

// ============================================================================
// 16. SERIES BOUNDS
// ============================================================================

describe('Series Bounds', () => {
  it('startDate filter', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
    const result = expandPattern(daily(), range, '2024-01-15' as LocalDate)
    for (const d of result) {
      expect(d >= '2024-01-15').toBe(true)
    }
  })

  it('endDate filter (via range)', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-16' as LocalDate }
    const result = expandPattern(daily(), range, '2024-01-01' as LocalDate)
    for (const d of result) {
      expect(d <= '2024-01-15').toBe(true)
    }
  })

  it('count limit', () => {
    const range: DateRange = {
      start: '2024-01-01' as LocalDate,
      end: '2024-02-01' as LocalDate,
    }
    const result = expandPattern(daily(), range, '2024-01-01' as LocalDate, { count: 5 })
    expect(result.size).toBe(5)
  })

  it('count takes earliest', () => {
    const range: DateRange = {
      start: '2024-01-01' as LocalDate,
      end: '2024-02-01' as LocalDate,
    }
    const result = expandPattern(daily(), range, '2024-01-01' as LocalDate, { count: 3 })
    expect(result.has('2024-01-01' as LocalDate)).toBe(true)
    expect(result.has('2024-01-02' as LocalDate)).toBe(true)
    expect(result.has('2024-01-03' as LocalDate)).toBe(true)
  })
})

// ============================================================================
// 17. ALGEBRAIC LAWS
// ============================================================================

describe('Algebraic Laws', () => {
  it('determinism - same inputs produce same outputs', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
    const result1 = expandPattern(everyNDays(3), range, '2024-01-05' as LocalDate)
    const result2 = expandPattern(everyNDays(3), range, '2024-01-05' as LocalDate)
    expect(result1.size).toBe(result2.size)
    for (const d of result1) {
      expect(result2.has(d)).toBe(true)
    }
  })

  it('range monotonicity - smaller range subset of larger', () => {
    const smallRange: DateRange = { start: '2024-01-10' as LocalDate, end: '2024-01-21' as LocalDate }
    const largeRange: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
    const smallResult = expandPattern(daily(), smallRange, '2024-01-01' as LocalDate)
    const largeResult = expandPattern(daily(), largeRange, '2024-01-01' as LocalDate)
    for (const d of smallResult) {
      expect(largeResult.has(d)).toBe(true)
    }
  })

  it('results within range', () => {
    const range: DateRange = { start: '2024-01-10' as LocalDate, end: '2024-01-21' as LocalDate }
    const result = expandPattern(daily(), range, '2024-01-01' as LocalDate)
    for (const d of result) {
      expect(d >= range.start).toBe(true)
      expect(d < range.end).toBe(true)
    }
  })

  it('respects series start', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
    const seriesStart = '2024-01-15' as LocalDate
    const result = expandPattern(daily(), range, seriesStart)
    for (const d of result) {
      expect(d >= seriesStart).toBe(true)
    }
  })
})

// ============================================================================
// 18. BOUNDARY CONDITIONS
// ============================================================================

describe('Boundary Conditions', () => {
  it('range end before series start produces empty', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-11' as LocalDate }
    const result = expandPattern(daily(), range, '2024-01-15' as LocalDate)
    expect(result.size).toBe(0)
  })

  it('Feb 30 yearly always empty', () => {
    const range: DateRange = { start: '2020-01-01' as LocalDate, end: '2031-01-01' as LocalDate }
    const result = expandPattern(yearly(2, 30), range, '2020-01-01' as LocalDate)
    expect(result.size).toBe(0)
  })

  it('5th weekday non-existent month empty', () => {
    const range: DateRange = { start: '2023-02-01' as LocalDate, end: '2023-03-01' as LocalDate }
    const result = expandPattern(nthWeekdayOfMonth(5, 'mon'), range, '2023-01-01' as LocalDate)
    expect(result.size).toBe(0)
  })

  it('monthly 31 in short month empty', () => {
    const range: DateRange = { start: '2024-04-01' as LocalDate, end: '2024-05-01' as LocalDate }
    const result = expandPattern(monthly(31), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(0)
  })

  it('single day matches', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-02' as LocalDate }
    const result = expandPattern(daily(), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(1)
  })

  it('single day no match', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-02' as LocalDate }
    const result = expandPattern(monthly(15), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(0)
  })

  it('year boundary weekly', () => {
    const range: DateRange = { start: '2023-12-25' as LocalDate, end: '2024-01-09' as LocalDate }
    const result = expandPattern(weekly(), range, '2023-12-25' as LocalDate)
    expect(result.size).toBe(3)
  })

  it('leap to non-leap Feb 29', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2026-01-01' as LocalDate }
    const result = expandPattern(yearly(2, 29), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(1)
    expect(result.has('2024-02-29' as LocalDate)).toBe(true)
  })

  it('large range performance (10 years daily)', () => {
    const range: DateRange = { start: '2020-01-01' as LocalDate, end: '2030-01-01' as LocalDate }
    const start = Date.now()
    const result = expandPattern(daily(), range, '2020-01-01' as LocalDate)
    const elapsed = Date.now() - start
    expect(result.size).toBeGreaterThan(3650)
    expect(elapsed).toBeLessThan(5000) // Should complete in under 5 seconds
  })

  it('result size bounded by days in range + 1', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
    const result = expandPattern(daily(), range, '2024-01-01' as LocalDate)
    const maxSize = daysBetween(range.start, range.end)
    expect(result.size).toBeLessThanOrEqual(maxSize)
  })
})

// ============================================================================
// 19. INVARIANTS
// ============================================================================

describe('Invariants', () => {
  it('INV 1: Output is valid Set', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
    const result = expandPattern(daily(), range, '2024-01-01' as LocalDate)
    expect(result).toBeInstanceOf(Set)
  })

  it('INV 3: Output is sorted (when converted to array)', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
    const result = expandPattern(everyNDays(3), range, '2024-01-01' as LocalDate)
    const arr = [...result]
    const sorted = [...arr].sort()
    expect(arr).toEqual(sorted)
  })

  it('INV 4: No duplicate dates (set semantics)', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
    const result = expandPattern(daily(), range, '2024-01-01' as LocalDate)
    const arr = [...result]
    const unique = new Set(arr)
    expect(arr.length).toBe(unique.size)
  })
})

// ============================================================================
// 20. ERROR HANDLING
// ============================================================================

describe('Error Handling', () => {
  it('invalid range start > end throws InvalidRangeError', () => {
    const range: DateRange = { start: '2024-02-01' as LocalDate, end: '2024-01-02' as LocalDate }
    expect(() => expandPattern(daily(), range, '2024-01-01' as LocalDate)).toThrow(/Range start must be <= end/)
  })

  it('everyNDays n=0 throws InvalidPatternError', () => {
    expect(() => everyNDays(0)).toThrow(/everyNDays requires n >= 1/)
  })

  it('everyNDays n=-1 throws InvalidPatternError', () => {
    expect(() => everyNDays(-1)).toThrow(/everyNDays requires n >= 1/)
  })

  it('everyNWeeks n=0 throws InvalidPatternError', () => {
    expect(() => everyNWeeks(0)).toThrow(/everyNWeeks requires n >= 1/)
  })

  it('monthly day=0 throws InvalidPatternError', () => {
    expect(() => monthly(0)).toThrow(/monthly requires day 1-31/)
  })

  it('monthly day=32 throws InvalidPatternError', () => {
    expect(() => monthly(32)).toThrow(/monthly requires day 1-31/)
  })

  it('yearly month=0 throws InvalidPatternError', () => {
    expect(() => yearly(0, 15)).toThrow(/yearly requires month 1-12/)
  })

  it('yearly month=13 throws InvalidPatternError', () => {
    expect(() => yearly(13, 15)).toThrow(/yearly requires month 1-12/)
  })

  it('weekdays empty array throws InvalidPatternError', () => {
    expect(() => weekdays([])).toThrow(/weekdays requires at least one day/)
  })
})

// ============================================================================
// 21. KNOWN ANSWER TESTS
// ============================================================================

describe('Known Answer Tests', () => {
  it('KNOWN 1: daily 2024-01-01 to 2024-01-07 produces 7 dates', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
    const result = expandPattern(daily(), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(7)
  })

  it('KNOWN 2: everyNDays(2) Jan 2024 produces Jan 1,3,5,...,31', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
    const result = expandPattern(everyNDays(2), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(16)
    expect(result.has('2024-01-01' as LocalDate)).toBe(true)
    expect(result.has('2024-01-31' as LocalDate)).toBe(true)
  })

  it('KNOWN 3: monthly(31) 2024 produces 7 dates', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
    const result = expandPattern(monthly(31), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(7)
  })

  it('KNOWN 4: lastDayOfMonth 2024 produces 12 dates', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
    const result = expandPattern(lastDayOfMonth(), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(12)
  })

  it('KNOWN 5: nthWeekday(2, thu) 2024 produces 12 dates', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
    const result = expandPattern(nthWeekdayOfMonth(2, 'thu'), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(12)
  })
})

// ============================================================================
// MUTATION TARGETS: toExpandablePattern (L470-542 entirely NoCoverage)
// ============================================================================

import { toExpandablePattern } from '../src/pattern-expansion'

describe('toExpandablePattern', () => {
  const ss = '2024-06-15' as LocalDate // seriesStart: June 15 (a Saturday)

  it('converts daily', () => {
    const result = toExpandablePattern({ type: 'daily' }, ss)
    expect(result).toEqual({ type: 'daily' })
  })

  it('converts everyNDays with explicit n', () => {
    const result = toExpandablePattern({ type: 'everyNDays', n: 5 }, ss)
    expect(result).toEqual({ type: 'everyNDays', n: 5 })
  })

  it('everyNDays defaults to n=2 when n missing', () => {
    const result = toExpandablePattern({ type: 'everyNDays' }, ss)
    expect(result).toEqual({ type: 'everyNDays', n: 2 })
  })

  it('everyNDays defaults to n=2 when n is 0 (falsy)', () => {
    const result = toExpandablePattern({ type: 'everyNDays', n: 0 }, ss)
    expect(result).toEqual({ type: 'everyNDays', n: 2 })
  })

  it('converts weekly with daysOfWeek array of numbers', () => {
    const result = toExpandablePattern({ type: 'weekly', daysOfWeek: [1, 3, 5] }, ss)
    expect(result.type).toBe('weekdays')
    expect((result as any).days).toEqual(['mon', 'wed', 'fri'])
  })

  it('converts weekly with daysOfWeek array of strings', () => {
    const result = toExpandablePattern({ type: 'weekly', daysOfWeek: ['monday', 'wednesday'] }, ss)
    expect(result.type).toBe('weekdays')
    expect((result as any).days).toEqual(['mon', 'wed'])
  })

  it('converts weekly with single dayOfWeek number', () => {
    const result = toExpandablePattern({ type: 'weekly', dayOfWeek: 4 }, ss)
    expect(result.type).toBe('weekdays')
    expect((result as any).days).toEqual(['thu'])
  })

  it('converts weekly with single dayOfWeek string', () => {
    const result = toExpandablePattern({ type: 'weekly', dayOfWeek: 'friday' }, ss)
    expect(result.type).toBe('weekdays')
    expect((result as any).days).toEqual(['fri'])
  })

  it('converts weekly with no days to plain weekly', () => {
    const result = toExpandablePattern({ type: 'weekly' }, ss)
    expect(result).toEqual({ type: 'weekly' })
  })

  it('converts everyNWeeks with numeric weekday', () => {
    const result = toExpandablePattern({ type: 'everyNWeeks', n: 3, weekday: 2 }, ss)
    expect(result).toEqual({ type: 'everyNWeeks', n: 3, weekday: 'tue' })
  })

  it('converts everyNWeeks with string weekday', () => {
    const result = toExpandablePattern({ type: 'everyNWeeks', n: 2, weekday: 'fri' }, ss)
    expect(result).toEqual({ type: 'everyNWeeks', n: 2, weekday: 'fri' })
  })

  it('everyNWeeks without weekday omits it', () => {
    const result = toExpandablePattern({ type: 'everyNWeeks', n: 4 }, ss)
    expect(result).toEqual({ type: 'everyNWeeks', n: 4 })
  })

  it('everyNWeeks defaults n to 2 when missing', () => {
    const result = toExpandablePattern({ type: 'everyNWeeks' }, ss)
    expect(result).toEqual({ type: 'everyNWeeks', n: 2 })
  })

  it('converts weekdays with numeric daysOfWeek', () => {
    const result = toExpandablePattern({ type: 'weekdays', daysOfWeek: [0, 6] }, ss)
    expect(result.type).toBe('weekdays')
    expect((result as any).days).toEqual(['sun', 'sat'])
  })

  it('converts weekdays with string daysOfWeek', () => {
    const result = toExpandablePattern({ type: 'weekdays', daysOfWeek: ['mon', 'fri'] }, ss)
    expect(result.type).toBe('weekdays')
    expect((result as any).days).toEqual(['mon', 'fri'])
  })

  it('weekdays with no daysOfWeek produces empty days', () => {
    const positive = toExpandablePattern({ type: 'weekdays', daysOfWeek: [1, 3] }, ss)
    expect((positive as any).days).toHaveLength(2)
    expect((positive as any).days[0]).toEqual('mon')
    expect((positive as any).days[1]).toEqual('wed')

    const result = toExpandablePattern({ type: 'weekdays' }, ss)
    expect(result).toEqual({ type: 'weekdays', days: [] })
  })

  it('converts nthWeekdayOfMonth with numeric weekday', () => {
    const result = toExpandablePattern({ type: 'nthWeekdayOfMonth', n: 2, weekday: 4 }, ss)
    expect(result).toEqual({ type: 'nthWeekdayOfMonth', n: 2, weekday: 'thu' })
  })

  it('converts nthWeekdayOfMonth with string weekday', () => {
    const result = toExpandablePattern({ type: 'nthWeekdayOfMonth', n: 1, weekday: 'mon' }, ss)
    expect(result).toEqual({ type: 'nthWeekdayOfMonth', n: 1, weekday: 'mon' })
  })

  it('converts lastWeekdayOfMonth with numeric weekday', () => {
    const result = toExpandablePattern({ type: 'lastWeekdayOfMonth', weekday: 5 }, ss)
    expect(result).toEqual({ type: 'lastWeekdayOfMonth', weekday: 'fri' })
  })

  it('converts nthToLastWeekdayOfMonth with numeric weekday', () => {
    const result = toExpandablePattern({ type: 'nthToLastWeekdayOfMonth', n: 2, weekday: 3 }, ss)
    expect(result).toEqual({ type: 'nthToLastWeekdayOfMonth', n: 2, weekday: 'wed' })
  })

  it('converts lastDayOfMonth', () => {
    const result = toExpandablePattern({ type: 'lastDayOfMonth' }, ss)
    expect(result).toEqual({ type: 'lastDayOfMonth' })
  })

  it('monthly defaults day to seriesStart day', () => {
    const result = toExpandablePattern({ type: 'monthly' }, ss)
    expect(result).toEqual({ type: 'monthly', day: 15 }) // dayOf('2024-06-15') = 15
  })

  it('monthly uses explicit day', () => {
    const result = toExpandablePattern({ type: 'monthly', day: 28 }, ss)
    expect(result).toEqual({ type: 'monthly', day: 28 })
  })

  it('monthly uses dayOfMonth when day missing', () => {
    const result = toExpandablePattern({ type: 'monthly', dayOfMonth: 10 }, ss)
    expect(result).toEqual({ type: 'monthly', day: 10 })
  })

  it('yearly defaults month and day to seriesStart', () => {
    const result = toExpandablePattern({ type: 'yearly' }, ss)
    expect(result).toEqual({ type: 'yearly', month: 6, day: 15 }) // monthOf=6, dayOf=15
  })

  it('yearly uses explicit month and day', () => {
    const result = toExpandablePattern({ type: 'yearly', month: 12, day: 25 }, ss)
    expect(result).toEqual({ type: 'yearly', month: 12, day: 25 })
  })

  it('yearly uses dayOfMonth when day missing', () => {
    const result = toExpandablePattern({ type: 'yearly', month: 3, dayOfMonth: 1 }, ss)
    expect(result).toEqual({ type: 'yearly', month: 3, day: 1 })
  })

  it('unknown type passes through as-is', () => {
    const pat = { type: 'customThing', foo: 42 }
    const result = toExpandablePattern(pat, ss)
    expect(result).toBe(pat) // same reference
  })

  // numToWeekday edge cases via daysOfWeek number conversion
  it('numToWeekday: 0 maps to sun', () => {
    const result = toExpandablePattern({ type: 'weekly', daysOfWeek: [0] }, ss)
    expect((result as any).days[0]).toBe('sun')
  })

  it('numToWeekday: 7 wraps to sun', () => {
    const result = toExpandablePattern({ type: 'weekly', daysOfWeek: [7] }, ss)
    expect((result as any).days[0]).toBe('sun')
  })

  it('numToWeekday: 6 maps to sat', () => {
    const result = toExpandablePattern({ type: 'weekly', daysOfWeek: [6] }, ss)
    expect((result as any).days[0]).toBe('sat')
  })

  // dayNameToWeekday edge cases
  it('dayNameToWeekday: full names normalized', () => {
    const result = toExpandablePattern({ type: 'weekly', daysOfWeek: ['TUESDAY', 'Saturday'] }, ss)
    expect((result as any).days).toEqual(['tue', 'sat'])
  })
})

// ============================================================================
// MUTATION TARGETS: Boundary tests per pattern type
// ============================================================================

describe('Pattern Boundary Tests', () => {
  // Zero-width range [date, date) should always return empty
  it('daily: zero-width range returns empty', () => {
    const d = '2024-01-15' as LocalDate
    const range: DateRange = { start: d, end: d }
    const result = expandPattern(daily(), range, d)
    expect(result.size).toBe(0)
  })

  it('everyNDays: zero-width range returns empty', () => {
    const d = '2024-01-15' as LocalDate
    const range: DateRange = { start: d, end: d }
    const result = expandPattern(everyNDays(3), range, d)
    expect(result.size).toBe(0)
  })

  // Exact range.end exclusion: instance on range.end must NOT be included
  it('daily: instance on range.end excluded', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-03' as LocalDate }
    const result = expandPattern(daily(), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(2)
    expect(result.has('2024-01-01' as LocalDate)).toBe(true)
    expect(result.has('2024-01-02' as LocalDate)).toBe(true)
    expect(result.has('2024-01-03' as LocalDate)).toBe(false)
  })

  it('monthly: instance exactly on range.end excluded', () => {
    // monthly(15), range [Jan 1, Jan 15) → Jan 15 is range.end, should be excluded
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-15' as LocalDate }
    const result = expandPattern(monthly(15), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(0)
  })

  it('monthly: instance one day before range.end included', () => {
    // monthly(14), range [Jan 1, Jan 15) → Jan 14 should be included
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-15' as LocalDate }
    const result = expandPattern(monthly(14), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(1)
    expect(result.has('2024-01-14' as LocalDate)).toBe(true)
  })

  it('monthly(1): instance exactly on range.start included', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
    const result = expandPattern(monthly(1), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(1)
    expect(result.has('2024-01-01' as LocalDate)).toBe(true)
  })

  it('yearly: instance exactly on range.end excluded', () => {
    // yearly(1, 1), range [2024-01-01, 2025-01-01) → 2024-01-01 included, 2025-01-01 excluded
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
    const result = expandPattern(yearly(1, 1), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(1)
    expect(result.has('2024-01-01' as LocalDate)).toBe(true)
    expect(result.has('2025-01-01' as LocalDate)).toBe(false)
  })

  it('yearly(2, 29): no match in non-leap year', () => {
    const range: DateRange = { start: '2023-01-01' as LocalDate, end: '2023-12-31' as LocalDate }
    const result = expandPattern(yearly(2, 29), range, '2023-01-01' as LocalDate)
    expect(result.size).toBe(0)
  })

  it('yearly(2, 29): matches in leap year', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-12-31' as LocalDate }
    const result = expandPattern(yearly(2, 29), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(1)
    expect(result.has('2024-02-29' as LocalDate)).toBe(true)
  })

  it('yearly(12, 31): year-end boundary', () => {
    // range [2024-01-01, 2025-01-01) includes 2024-12-31 but not 2025-12-31
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2025-01-01' as LocalDate }
    const result = expandPattern(yearly(12, 31), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(1)
    expect(result.has('2024-12-31' as LocalDate)).toBe(true)
  })

  it('nthWeekdayOfMonth: 5th occurrence absent returns no match', () => {
    // Feb 2023 only has 4 Mondays
    const range: DateRange = { start: '2023-02-01' as LocalDate, end: '2023-03-01' as LocalDate }
    const result = expandPattern(nthWeekdayOfMonth(5, 'mon'), range, '2023-01-01' as LocalDate)
    expect(result.size).toBe(0)
  })

  it('nthWeekdayOfMonth: exact range.end boundary excluded', () => {
    // 2024-01-12 is the 2nd Friday of Jan 2024
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-12' as LocalDate }
    const result = expandPattern(nthWeekdayOfMonth(2, 'fri'), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(0) // Jan 12 === range.end (exclusive)
  })

  it('lastWeekdayOfMonth: boundary exclusion', () => {
    // Last Friday of Jan 2024 is Jan 26
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-26' as LocalDate }
    const result = expandPattern(lastWeekdayOfMonth('fri'), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(0) // Jan 26 === range.end
  })

  it('lastWeekdayOfMonth: included when before range.end', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-27' as LocalDate }
    const result = expandPattern(lastWeekdayOfMonth('fri'), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(1)
    expect(result.has('2024-01-26' as LocalDate)).toBe(true)
  })

  it('nthToLastWeekdayOfMonth: 2nd-to-last Friday boundary', () => {
    // Last Fri of Jan 2024 = Jan 26, 2nd-to-last = Jan 19
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-19' as LocalDate }
    const result = expandPattern(nthToLastWeekdayOfMonth(2, 'fri'), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(0) // Jan 19 === range.end
  })

  it('nthToLastWeekdayOfMonth: included when before range.end', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-20' as LocalDate }
    const result = expandPattern(nthToLastWeekdayOfMonth(2, 'fri'), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(1)
    expect(result.has('2024-01-19' as LocalDate)).toBe(true)
  })

  it('lastDayOfMonth: exactly on range.end excluded', () => {
    // Last day of Jan = Jan 31
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-31' as LocalDate }
    const result = expandPattern(lastDayOfMonth(), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(0) // Jan 31 === range.end
  })

  it('lastDayOfMonth: included when range.end is after', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-02-01' as LocalDate }
    const result = expandPattern(lastDayOfMonth(), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(1)
    expect(result.has('2024-01-31' as LocalDate)).toBe(true)
  })

  // seriesStart === range.start boundary
  it('weekdays: seriesStart equals range.start uses range.start', () => {
    // 2024-01-01 is a Monday
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-02' as LocalDate }
    const result = expandPattern(weekdays(['mon']), range, '2024-01-01' as LocalDate)
    expect(result.size).toBe(1)
    expect(result.has('2024-01-01' as LocalDate)).toBe(true)
  })

  // everyNDays: boundary with offset arithmetic
  it('everyNDays(3): first instance on range.start', () => {
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-04' as LocalDate }
    const result = expandPattern(everyNDays(3), range, '2024-01-01' as LocalDate)
    // seriesStart = range.start, gap=0, rem=0, offset=0 → first instance on Jan 1
    // Jan 1 + 3 = Jan 4 which is range.end (excluded)
    expect(result.size).toBe(1)
    expect(result.has('2024-01-01' as LocalDate)).toBe(true)
    expect(result.has('2024-01-04' as LocalDate)).toBe(false)
  })
})

// ============================================================================
// MUTATION TARGETS: weekly/daysOfWeek through expandInner (L164-174 NoCoverage)
// ============================================================================

describe('Weekly with daysOfWeek through expandInner', () => {
  it('weekly pattern with daysOfWeek expands via dayMap', () => {
    // Construct the pattern object directly (not via weekdays() constructor)
    // to exercise the weekly case in expandInner L164-174
    const pat: Pattern = { type: 'weekly', daysOfWeek: ['monday', 'wednesday', 'friday'] } as any
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
    const result = expandPattern(pat, range, '2024-01-01' as LocalDate)
    // 2024-01-01 Mon, 01-03 Wed, 01-05 Fri = 3 days
    expect(result.size).toBe(3)
    expect(result.has('2024-01-01' as LocalDate)).toBe(true) // Monday
    expect(result.has('2024-01-03' as LocalDate)).toBe(true) // Wednesday
    expect(result.has('2024-01-05' as LocalDate)).toBe(true) // Friday
  })

  it('weekly pattern with short-form daysOfWeek', () => {
    const pat: Pattern = { type: 'weekly', daysOfWeek: ['mon', 'thu', 'sat'] } as any
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-08' as LocalDate }
    const result = expandPattern(pat, range, '2024-01-01' as LocalDate)
    // Mon 01-01, Thu 01-04, Sat 01-06
    expect(result.size).toBe(3)
    expect(result.has('2024-01-01' as LocalDate)).toBe(true)
    expect(result.has('2024-01-04' as LocalDate)).toBe(true)
    expect(result.has('2024-01-06' as LocalDate)).toBe(true)
  })

  it('weekly pattern without daysOfWeek falls through to everyNWeeks', () => {
    // weekly() with no daysOfWeek → falls through to everyNWeeksCore(1, dayOfWeek(seriesStart))
    // seriesStart = 2024-01-01 (Monday) → produces every Monday
    const range: DateRange = { start: '2024-01-01' as LocalDate, end: '2024-01-15' as LocalDate }
    const result = expandPattern(weekly(), range, '2024-01-01' as LocalDate)
    // Mondays: Jan 1, 8 = 2 days
    expect(result.size).toBe(2)
    expect(result.has('2024-01-01' as LocalDate)).toBe(true)
    expect(result.has('2024-01-08' as LocalDate)).toBe(true)
  })
})

// ============================================================================
// MUTATION TARGETS: everyNWeeksCore else branch (L259-264 NoCoverage)
// ============================================================================

describe('everyNWeeks anchor-before-start branch', () => {
  it('everyNWeeks where anchor is before range.start', () => {
    // seriesStart = 2024-01-01 (Monday), weekday = mon → anchor = 2024-01-01
    // range starts 2024-03-01 → anchor (Jan 1) < start (Mar 1) → enters else branch
    const range: DateRange = { start: '2024-03-01' as LocalDate, end: '2024-03-15' as LocalDate }
    const result = expandPattern(everyNWeeks(2, 'mon'), range, '2024-01-01' as LocalDate)
    // Every 2 weeks from Mon Jan 1: Jan 1, 15, 29, Feb 12, 26, Mar 11
    // In range [Mar 1, Mar 15): Mar 11 only
    expect(result.size).toBe(1)
    expect(result.has('2024-03-11' as LocalDate)).toBe(true)
  })

  it('everyNWeeks(1) anchor before start produces correct weekly', () => {
    // seriesStart = 2024-01-01 (Mon), range [2024-02-01, 2024-02-08)
    // anchor = Jan 1, start = Feb 1 (Thu) → anchor < start → else branch
    const range: DateRange = { start: '2024-02-01' as LocalDate, end: '2024-02-08' as LocalDate }
    const result = expandPattern(everyNWeeks(1, 'mon'), range, '2024-01-01' as LocalDate)
    // Weekly Mondays from Jan 1: Feb 5 is in range [Feb 1, Feb 8)
    expect(result.size).toBe(1)
    expect(result.has('2024-02-05' as LocalDate)).toBe(true)
  })
})
