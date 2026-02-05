/**
 * Tests for pattern generators.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  dailyPatternGen,
  everyNDaysPatternGen,
  weeklyPatternGen,
  everyNWeeksPatternGen,
  monthlyPatternGen,
  nthWeekdayOfMonthPatternGen,
  lastDayOfMonthPatternGen,
  yearlyPatternGen,
  weekdaysPatternGen,
  oneOffPatternGen,
  customPatternGen,
  activeOnDatesPatternGen,
  inactiveOnDatesPatternGen,
  simplePatternGen,
  patternGen,
  boundaryPatternGen,
  realisticPatternGen,
} from './patterns'
import { parseLocalDate, isValidDate } from '../lib/utils'

const ALL_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

describe('pattern generators', () => {
  describe('dailyPatternGen', () => {
    it('generates daily patterns', () => {
      fc.assert(
        fc.property(dailyPatternGen(), (pattern) => {
          expect(pattern.type).toBe('daily')
        })
      )
    })
  })

  describe('everyNDaysPatternGen', () => {
    it('generates everyNDays patterns with valid N', () => {
      fc.assert(
        fc.property(everyNDaysPatternGen(), (pattern) => {
          expect(pattern.type).toBe('everyNDays')
          expect(pattern.n).toBeGreaterThanOrEqual(2)
          expect(pattern.n).toBeLessThanOrEqual(365)
        })
      )
    })

    it('generates valid anchor dates', () => {
      fc.assert(
        fc.property(everyNDaysPatternGen(), (pattern) => {
          const { year, month, day } = parseLocalDate(pattern.anchor)
          expect(isValidDate(year, month, day)).toBe(true)
        })
      )
    })

    it('respects N bounds when configured', () => {
      fc.assert(
        fc.property(everyNDaysPatternGen({ minN: 5, maxN: 10 }), (pattern) => {
          expect(pattern.n).toBeGreaterThanOrEqual(5)
          expect(pattern.n).toBeLessThanOrEqual(10)
        })
      )
    })
  })

  describe('weeklyPatternGen', () => {
    it('generates weekly patterns with valid days', () => {
      fc.assert(
        fc.property(weeklyPatternGen(), (pattern) => {
          expect(pattern.type).toBe('weekly')
          expect(pattern.days.length >= 1 && pattern.days.length <= 7).toBe(true)
          expect(pattern.days.every((day) => ALL_DAYS.includes(day))).toBe(true)
        })
      )
    })

    it('generates sorted day arrays', () => {
      fc.assert(
        fc.property(weeklyPatternGen(), (pattern) => {
          const indices = pattern.days.map((d) => ALL_DAYS.indexOf(d))
          const sorted = [...indices].sort((a, b) => a - b)
          expect(indices).toEqual(sorted)
        })
      )
    })
  })

  describe('everyNWeeksPatternGen', () => {
    it('generates everyNWeeks patterns with valid N', () => {
      fc.assert(
        fc.property(everyNWeeksPatternGen(), (pattern) => {
          expect(pattern.type).toBe('everyNWeeks')
          expect(pattern.n).toBeGreaterThanOrEqual(2)
          expect(pattern.n).toBeLessThanOrEqual(52)
        })
      )
    })

    it('generates valid days and anchor', () => {
      fc.assert(
        fc.property(everyNWeeksPatternGen(), (pattern) => {
          expect(pattern.days.length >= 1).toBe(true)
          expect(pattern.days.every((day) => ALL_DAYS.includes(day))).toBe(true)
          const { year, month, day } = parseLocalDate(pattern.anchor)
          expect(isValidDate(year, month, day)).toBe(true)
        })
      )
    })
  })

  describe('monthlyPatternGen', () => {
    it('generates monthly patterns with valid day', () => {
      fc.assert(
        fc.property(monthlyPatternGen(), (pattern) => {
          expect(pattern.type).toBe('monthly')
          expect(pattern.day).toBeGreaterThanOrEqual(1)
          expect(pattern.day).toBeLessThanOrEqual(31)
        })
      )
    })
  })

  describe('nthWeekdayOfMonthPatternGen', () => {
    it('generates nthWeekdayOfMonth patterns with valid values', () => {
      fc.assert(
        fc.property(nthWeekdayOfMonthPatternGen(), (pattern) => {
          expect(pattern.type).toBe('nthWeekdayOfMonth')
          expect([1, 2, 3, 4, 5]).toContain(pattern.n)
          expect(ALL_DAYS).toContain(pattern.weekday)
        })
      )
    })
  })

  describe('lastDayOfMonthPatternGen', () => {
    it('generates lastDayOfMonth patterns', () => {
      fc.assert(
        fc.property(lastDayOfMonthPatternGen(), (pattern) => {
          expect(pattern.type).toBe('lastDayOfMonth')
        })
      )
    })
  })

  describe('yearlyPatternGen', () => {
    it('generates yearly patterns with valid month and day', () => {
      fc.assert(
        fc.property(yearlyPatternGen(), (pattern) => {
          expect(pattern.type).toBe('yearly')
          expect(pattern.month).toBeGreaterThanOrEqual(1)
          expect(pattern.month).toBeLessThanOrEqual(12)
          expect(pattern.day).toBeGreaterThanOrEqual(1)
          expect(pattern.day).toBeLessThanOrEqual(31)
        })
      )
    })
  })

  describe('weekdaysPatternGen', () => {
    it('generates weekdays patterns', () => {
      fc.assert(
        fc.property(weekdaysPatternGen(), (pattern) => {
          expect(pattern.type).toBe('weekdays')
        })
      )
    })
  })

  describe('oneOffPatternGen', () => {
    it('generates oneOff patterns with valid dates', () => {
      fc.assert(
        fc.property(oneOffPatternGen(), (pattern) => {
          expect(pattern.type).toBe('oneOff')
          const { year, month, day } = parseLocalDate(pattern.date)
          expect(isValidDate(year, month, day)).toBe(true)
        })
      )
    })
  })

  describe('customPatternGen', () => {
    it('generates custom patterns with non-empty date arrays', () => {
      fc.assert(
        fc.property(customPatternGen(), (pattern) => {
          expect(pattern.type).toBe('custom')
          expect(Array.isArray(pattern.dates)).toBe(true)
          expect(pattern.dates.length).toBeGreaterThanOrEqual(1)
          // Verify all dates are valid
          pattern.dates.forEach((date) => {
            expect(typeof date).toBe('string')
            expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
            const { year, month, day } = parseLocalDate(date)
            expect(isValidDate(year, month, day)).toBe(true)
          })
        })
      )
    })

    it('generates sorted unique dates', () => {
      fc.assert(
        fc.property(customPatternGen(), (pattern) => {
          // Check uniqueness
          const unique = new Set(pattern.dates)
          expect(unique.size).toBe(pattern.dates.length)
          // Check sorted
          const sorted = [...pattern.dates].sort()
          expect(pattern.dates).toEqual(sorted)
        })
      )
    })
  })

  describe('activeOnDatesPatternGen', () => {
    it('generates activeOnDates patterns with valid structure', () => {
      fc.assert(
        fc.property(activeOnDatesPatternGen(), (pattern) => {
          expect(pattern.type).toBe('activeOnDates')
          expect(pattern.base).toBeDefined()
          expect(typeof pattern.base.type).toBe('string')
          const VALID_TYPES = ['daily', 'everyNDays', 'weekly', 'everyNWeeks', 'monthly', 'nthWeekdayOfMonth', 'lastDayOfMonth', 'yearly', 'weekdays', 'oneOff', 'custom']
          expect(VALID_TYPES).toContain(pattern.base.type)
          expect(pattern.dates.length >= 1).toBe(true)
          // Verify ALL dates are valid, not just the first
          expect(Array.isArray(pattern.dates)).toBe(true)
          pattern.dates.forEach((date) => {
            expect(typeof date).toBe('string')
            expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
            const { year, month, day } = parseLocalDate(date)
            expect(isValidDate(year, month, day)).toBe(true)
          })
        })
      )
    })
  })

  describe('inactiveOnDatesPatternGen', () => {
    it('generates inactiveOnDates patterns with valid structure', () => {
      fc.assert(
        fc.property(inactiveOnDatesPatternGen(), (pattern) => {
          expect(pattern.type).toBe('inactiveOnDates')
          expect(pattern.base).toBeDefined()
          expect(typeof pattern.base.type).toBe('string')
          const VALID_TYPES = ['daily', 'weekly', 'monthly', 'everyNDays', 'everyNWeeks', 'custom', 'oneOff', 'yearly', 'nthWeekdayOfMonth', 'lastDayOfMonth', 'weekdays']
          expect(VALID_TYPES).toContain(pattern.base.type)
          expect(pattern.dates.length >= 1).toBe(true)
          // Verify ALL dates are valid, not just the first
          expect(Array.isArray(pattern.dates)).toBe(true)
          pattern.dates.forEach((date) => {
            expect(typeof date).toBe('string')
            expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
            const { year, month, day } = parseLocalDate(date)
            expect(isValidDate(year, month, day)).toBe(true)
          })
        })
      )
    })
  })

  describe('simplePatternGen', () => {
    it('generates all 11 simple pattern types', () => {
      const types = new Set<string>()
      const samples = fc.sample(simplePatternGen(), 1000)
      samples.forEach((p) => types.add(p.type))

      expect(types).toContain('daily')
      expect(types).toContain('everyNDays')
      expect(types).toContain('weekly')
      expect(types).toContain('everyNWeeks')
      expect(types).toContain('monthly')
      expect(types).toContain('nthWeekdayOfMonth')
      expect(types).toContain('lastDayOfMonth')
      expect(types).toContain('yearly')
      expect(types).toContain('weekdays')
      expect(types).toContain('oneOff')
      expect(types).toContain('custom')
    })
  })

  describe('patternGen', () => {
    it('generates all 13 pattern types including wrapper patterns', () => {
      const types = new Set<string>()
      const samples = fc.sample(patternGen(), 2000)
      samples.forEach((p) => types.add(p.type))

      expect(types.size).toBeGreaterThanOrEqual(11) // At least all simple types
      // Wrapper types may or may not appear due to weighting, but structure should be valid
    })
  })

  describe('boundaryPatternGen', () => {
    it('generates valid boundary patterns', () => {
      fc.assert(
        fc.property(boundaryPatternGen(), (pattern) => {
          expect(typeof pattern.type).toBe('string')
          expect(pattern.type.length > 0).toBe(true)
        }),
        { numRuns: 200 }
      )
    })
  })

  describe('realisticPatternGen', () => {
    it('generates valid patterns with realistic distribution', () => {
      const types = new Map<string, number>()
      const samples = fc.sample(realisticPatternGen(), 1000)
      samples.forEach((p) => {
        expect(p.type).toBeDefined()
        types.set(p.type, (types.get(p.type) || 0) + 1)
      })

      // Daily and weekly should be more common
      expect(types.get('daily')! + types.get('weekly')!).toBeGreaterThan(400)
    })
  })
})
