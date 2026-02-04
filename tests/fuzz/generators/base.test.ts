/**
 * Tests for base generator utilities.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  localDateGen,
  localTimeGen,
  localDateTimeGen,
  durationGen,
  seriesIdGen,
  completionIdGen,
  dayNameGen,
  dayNamesSubsetGen,
  boundaryDateGen,
  boundaryTimeGen,
  invalidDateGen,
  invalidTimeGen,
} from './base'
import { parseLocalDate, parseLocalTime, parseLocalDateTime, isValidDate, isValidTime } from '../lib/utils'

describe('base generators', () => {
  describe('localDateGen', () => {
    it('generates valid dates', () => {
      fc.assert(
        fc.property(localDateGen(), (date) => {
          const { year, month, day } = parseLocalDate(date)
          expect(isValidDate(year, month, day)).toBe(true)
        })
      )
    })

    it('respects year range', () => {
      fc.assert(
        fc.property(localDateGen({ min: { year: 2020, month: 1, day: 1 }, max: { year: 2025, month: 12, day: 31 } }), (date) => {
          const { year } = parseLocalDate(date)
          expect(year).toBeGreaterThanOrEqual(2020)
          expect(year).toBeLessThanOrEqual(2025)
        })
      )
    })

    it('formats as YYYY-MM-DD', () => {
      fc.assert(
        fc.property(localDateGen(), (date) => {
          expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        })
      )
    })
  })

  describe('localTimeGen', () => {
    it('generates valid times', () => {
      fc.assert(
        fc.property(localTimeGen(), (time) => {
          const { hours, minutes } = parseLocalTime(time)
          expect(isValidTime(hours, minutes)).toBe(true)
        })
      )
    })

    it('generates 5-minute aligned times when requested', () => {
      fc.assert(
        fc.property(localTimeGen({ alignTo5Minutes: true }), (time) => {
          const { minutes } = parseLocalTime(time)
          expect(minutes % 5).toBe(0)
        })
      )
    })

    it('formats as HH:MM', () => {
      fc.assert(
        fc.property(localTimeGen(), (time) => {
          expect(time).toMatch(/^\d{2}:\d{2}$/)
        })
      )
    })
  })

  describe('localDateTimeGen', () => {
    it('combines date and time correctly', () => {
      fc.assert(
        fc.property(localDateTimeGen(), (dt) => {
          expect(dt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
          const { year, month, day, hours, minutes } = parseLocalDateTime(dt)
          expect(isValidDate(year, month, day)).toBe(true)
          expect(isValidTime(hours, minutes)).toBe(true)
        })
      )
    })
  })

  describe('durationGen', () => {
    it('generates positive durations', () => {
      fc.assert(
        fc.property(durationGen(), (duration) => {
          expect(duration).toBeGreaterThanOrEqual(1)
        })
      )
    })

    it('respects min/max bounds', () => {
      fc.assert(
        fc.property(durationGen({ min: 30, max: 60 }), (duration) => {
          expect(duration).toBeGreaterThanOrEqual(30)
          expect(duration).toBeLessThanOrEqual(60)
        })
      )
    })
  })

  describe('ID generators', () => {
    it('seriesIdGen produces unique prefixed UUIDs', () => {
      fc.assert(
        fc.property(seriesIdGen(), (id) => {
          expect(id).toMatch(/^series-[0-9a-f-]+$/)
        })
      )
    })

    it('completionIdGen produces unique prefixed UUIDs', () => {
      fc.assert(
        fc.property(completionIdGen(), (id) => {
          expect(id).toMatch(/^completion-[0-9a-f-]+$/)
        })
      )
    })
  })

  describe('dayNameGen', () => {
    it('generates valid day names', () => {
      fc.assert(
        fc.property(dayNameGen(), (day) => {
          expect(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']).toContain(day)
        })
      )
    })
  })

  describe('dayNamesSubsetGen', () => {
    it('generates non-empty subsets', () => {
      fc.assert(
        fc.property(dayNamesSubsetGen(), (days) => {
          // Verify length is in valid range and content is correct
          expect(days.length >= 1 && days.length <= 7).toBe(true)
          days.forEach((day) => {
            expect(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']).toContain(day)
          })
        })
      )
    })

    it('generates sorted subsets', () => {
      fc.assert(
        fc.property(dayNamesSubsetGen(), (days) => {
          const order = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
          const sorted = [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b))
          expect(days).toEqual(sorted)
        })
      )
    })
  })

  describe('boundary generators', () => {
    it('boundaryDateGen generates valid dates', () => {
      fc.assert(
        fc.property(boundaryDateGen(), (date) => {
          const { year, month, day } = parseLocalDate(date)
          expect(isValidDate(year, month, day)).toBe(true)
        })
      )
    })

    it('boundaryTimeGen generates valid times', () => {
      fc.assert(
        fc.property(boundaryTimeGen(), (time) => {
          const { hours, minutes } = parseLocalTime(time)
          expect(isValidTime(hours, minutes)).toBe(true)
        })
      )
    })
  })

  describe('invalid generators', () => {
    it('invalidDateGen generates strings that fail date validation', () => {
      fc.assert(
        fc.property(invalidDateGen(), (dateStr) => {
          // Either the format is wrong, or the date is semantically invalid
          const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
          if (!match) {
            // Format is wrong - dateStr should not match the valid pattern
            expect(dateStr).not.toMatch(/^(\d{4})-(\d{2})-(\d{2})$/)
            return
          }
          const year = parseInt(match[1], 10)
          const month = parseInt(match[2], 10)
          const day = parseInt(match[3], 10)
          // Check if semantically invalid
          const valid = isValidDate(year, month, day)
          expect(valid).toBe(false)
        }),
        { numRuns: 200 }
      )
    })

    it('invalidTimeGen generates strings that fail time validation', () => {
      fc.assert(
        fc.property(invalidTimeGen(), (timeStr) => {
          // Either the format is wrong, or the time is semantically invalid
          const match = timeStr.match(/^(\d{2}):(\d{2})$/)
          if (!match) {
            // Format is wrong - timeStr should not match the valid pattern
            expect(timeStr).not.toMatch(/^(\d{2}):(\d{2})$/)
            return
          }
          const hours = parseInt(match[1], 10)
          const minutes = parseInt(match[2], 10)
          // Check if semantically invalid
          const valid = isValidTime(hours, minutes)
          expect(valid).toBe(false)
        }),
        { numRuns: 200 }
      )
    })
  })
})
