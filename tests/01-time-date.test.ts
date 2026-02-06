/**
 * Segment 01: Time & Date Utilities Tests
 *
 * Tests the foundational time and date utilities module.
 * These are pure functions with no external dependencies beyond the runtime timezone database.
 */

import { describe, it, expect } from 'vitest'
import {
  parseDate,
  parseTime,
  parseDateTime,
  formatDate,
  formatTime,
  formatDateTime,
  addDays,
  addMinutes,
  daysBetween,
  minutesBetween,
  dayOfWeek,
  weekdayToIndex,
  indexToWeekday,
  isLeapYear,
  daysInMonth,
  daysInYear,
  yearOf,
  monthOf,
  dayOf,
  hourOf,
  minuteOf,
  secondOf,
  dateOf,
  timeOf,
  makeDate,
  makeTime,
  makeDateTime,
  toUTC,
  toLocal,
  isDSTAt,
  compareDates,
  compareTimes,
  compareDateTimes,
  dateEquals,
  dateBefore,
  dateAfter,
  type LocalDate,
  type LocalTime,
  type LocalDateTime,
  type Weekday,
} from '../src/time-date'

// ============================================================================
// 1. PARSING FUNCTIONS
// ============================================================================

describe('Parsing Functions', () => {
  describe('parseDate', () => {
    // Valid dates (LAW P1)
    it('parses valid standard date', () => {
      const result = parseDate('2024-03-15')
      expect(result).toBe('2024-03-15')
    })

    it('parses valid leap day', () => {
      const result = parseDate('2024-02-29')
      expect(result).toBe('2024-02-29')
    })

    it('parses valid year boundary', () => {
      expect(() => parseDate('2024-12-31')).not.toThrow()
    })

    it('parses valid January first', () => {
      expect(() => parseDate('2024-01-01')).not.toThrow()
    })

    // Invalid dates (LAW P3, P4)
    it('rejects Feb 29 non-leap year', () => {
      expect(() => parseDate('2023-02-29')).toThrow()
    })

    it('rejects Feb 30', () => {
      expect(() => parseDate('2024-02-30')).toThrow()
    })

    it('rejects month 13', () => {
      expect(() => parseDate('2024-13-01')).toThrow()
    })

    it('rejects month 00', () => {
      expect(() => parseDate('2024-00-15')).toThrow()
    })

    it('rejects day 32', () => {
      expect(() => parseDate('2024-01-32')).toThrow()
    })

    it('rejects day 00', () => {
      expect(() => parseDate('2024-01-00')).toThrow()
    })

    it('rejects unpadded month', () => {
      expect(() => parseDate('2024-3-15')).toThrow()
    })

    it('rejects unpadded day', () => {
      expect(() => parseDate('2024-03-5')).toThrow()
    })

    it('rejects wrong separator', () => {
      expect(() => parseDate('2024/03/15')).toThrow()
    })

    it('rejects empty string', () => {
      expect(() => parseDate('')).toThrow()
    })

    it('rejects garbage', () => {
      expect(() => parseDate('not-a-date')).toThrow()
    })

    it('rejects time suffix', () => {
      expect(() => parseDate('2024-03-15T10:00')).toThrow()
    })

    // Month length boundaries
    it('accepts Jan 31', () => {
      expect(() => parseDate('2024-01-31')).not.toThrow()
    })

    it('accepts Apr 30', () => {
      expect(() => parseDate('2024-04-30')).not.toThrow()
    })

    it('rejects Apr 31', () => {
      expect(() => parseDate('2024-04-31')).toThrow()
    })

    it('accepts Feb 28 non-leap', () => {
      expect(() => parseDate('2023-02-28')).not.toThrow()
    })

    it('accepts Feb 29 leap', () => {
      expect(() => parseDate('2024-02-29')).not.toThrow()
    })

    it('rejects Feb 29 century non-leap (1900)', () => {
      expect(() => parseDate('1900-02-29')).toThrow()
    })

    it('accepts Feb 29 century leap (2000)', () => {
      expect(() => parseDate('2000-02-29')).not.toThrow()
    })
  })

  describe('parseTime', () => {
    // Valid times (LAW P1, P2)
    it('parses valid HH:MM', () => {
      const result = parseTime('14:30')
      expect(result).toBe('14:30:00')
    })

    it('parses valid HH:MM:SS', () => {
      const result = parseTime('14:30:45')
      expect(result).toBe('14:30:45')
    })

    it('parses midnight', () => {
      expect(() => parseTime('00:00:00')).not.toThrow()
    })

    it('parses end of day', () => {
      expect(() => parseTime('23:59:59')).not.toThrow()
    })

    // Invalid times (LAW P3)
    it('rejects hour 24', () => {
      expect(() => parseTime('24:00:00')).toThrow()
    })

    it('rejects hour 25', () => {
      expect(() => parseTime('25:00:00')).toThrow()
    })

    it('rejects minute 60', () => {
      expect(() => parseTime('12:60:00')).toThrow()
    })

    it('rejects second 60', () => {
      expect(() => parseTime('12:30:60')).toThrow()
    })

    it('rejects unpadded hour', () => {
      expect(() => parseTime('9:30:00')).toThrow()
    })

    it('rejects wrong separator', () => {
      expect(() => parseTime('14-30-00')).toThrow()
    })

    it('normalizes HH:MM to HH:MM:SS', () => {
      const result = parseTime('14:30')
      expect(result).toBe('14:30:00')
    })
  })

  describe('parseDateTime', () => {
    it('parses valid full datetime', () => {
      expect(() => parseDateTime('2024-03-15T14:30:00')).not.toThrow()
    })

    it('parses valid datetime without seconds', () => {
      expect(() => parseDateTime('2024-03-15T14:30')).not.toThrow()
    })

    it('rejects space separator', () => {
      expect(() => parseDateTime('2024-03-15 14:30:00')).toThrow()
    })

    it('rejects invalid date', () => {
      expect(() => parseDateTime('2024-02-30T14:30:00')).toThrow()
    })

    it('rejects invalid time', () => {
      expect(() => parseDateTime('2024-03-15T25:00:00')).toThrow()
    })

    it('rejects date only', () => {
      expect(() => parseDateTime('2024-03-15')).toThrow()
    })

    it('rejects time only', () => {
      expect(() => parseDateTime('14:30:00')).toThrow()
    })
  })
})

// ============================================================================
// 2. FORMATTING FUNCTIONS
// ============================================================================

describe('Formatting Functions', () => {
  describe('formatDate', () => {
    it('formats standard date', () => {
      const date = makeDate(2024, 3, 15)
      expect(formatDate(date)).toBe('2024-03-15')
    })

    it('pads single-digit month', () => {
      const date = makeDate(2024, 3, 5)
      expect(formatDate(date)).toBe('2024-03-05')
    })

    it('pads single-digit day', () => {
      const date = makeDate(2024, 1, 5)
      expect(formatDate(date)).toBe('2024-01-05')
    })
  })

  describe('formatTime', () => {
    it('includes seconds', () => {
      const time = makeTime(14, 30, 0)
      expect(formatTime(time)).toBe('14:30:00')
    })

    it('pads all components', () => {
      const time = makeTime(9, 5, 3)
      expect(formatTime(time)).toBe('09:05:03')
    })
  })

  describe('formatDateTime', () => {
    it('uses T separator', () => {
      const dt = makeDateTime(makeDate(2024, 3, 15), makeTime(14, 30, 0))
      expect(formatDateTime(dt)).toBe('2024-03-15T14:30:00')
    })
  })
})

// ============================================================================
// 3. ROUND-TRIP LAWS
// ============================================================================

describe('Round-Trip Laws', () => {
  // LAW 1: format-parse roundtrip for dates
  it('LAW 1: format-parse roundtrip for dates', () => {
    const testDates = [
      '2024-03-15',
      '2024-01-01',
      '2024-12-31',
      '2024-02-29',
      '2000-02-29',
    ]
    for (const dateStr of testDates) {
      const parsed = parseDate(dateStr)
      expect(formatDate(parsed)).toBe(dateStr)
    }
  })

  // LAW 2: format-parse roundtrip for times
  it('LAW 2: format-parse roundtrip for times', () => {
    const testTimes = ['00:00:00', '12:30:45', '23:59:59', '14:30:00']
    for (const timeStr of testTimes) {
      const parsed = parseTime(timeStr)
      expect(formatTime(parsed)).toBe(timeStr)
    }
  })

  // LAW 3: format-parse roundtrip for datetimes
  it('LAW 3: format-parse roundtrip for datetimes', () => {
    const testDTs = [
      '2024-03-15T14:30:00',
      '2024-01-01T00:00:00',
      '2024-12-31T23:59:59',
    ]
    for (const dtStr of testDTs) {
      const parsed = parseDateTime(dtStr)
      expect(formatDateTime(parsed)).toBe(dtStr)
    }
  })

  // LAW 4: parse-format canonicalization for dates
  it('LAW 4: parse-format canonicalization for dates', () => {
    // All valid date strings should produce canonical output
    const result = parseDate('2024-03-15')
    expect(formatDate(result)).toBe('2024-03-15')
  })

  // LAW 5: parse-format canonicalization for times
  it('LAW 5: parse-format canonicalization for times (HH:MM → HH:MM:SS)', () => {
    const result = parseTime('14:30')
    expect(formatTime(result)).toBe('14:30:00')
  })
})

// ============================================================================
// 4. DATE ARITHMETIC
// ============================================================================

describe('Date Arithmetic', () => {
  describe('addDays', () => {
    // LAW 6: identity
    it('LAW 6: addDays identity (n=0)', () => {
      expect(addDays('2024-03-15' as LocalDate, 0)).toBe('2024-03-15')
    })

    // LAW 9: positive increases date
    it('LAW 9: addDays positive', () => {
      expect(addDays('2024-03-15' as LocalDate, 5)).toBe('2024-03-20')
    })

    // LAW 10: negative decreases date
    it('LAW 10: addDays negative', () => {
      expect(addDays('2024-03-15' as LocalDate, -5)).toBe('2024-03-10')
    })

    it('addDays month overflow', () => {
      expect(addDays('2024-01-30' as LocalDate, 5)).toBe('2024-02-04')
    })

    // B3: year overflow
    it('B3: addDays year overflow', () => {
      expect(addDays('2024-12-30' as LocalDate, 5)).toBe('2025-01-04')
    })

    // B4: year underflow
    it('B4: addDays year underflow', () => {
      expect(addDays('2024-01-03' as LocalDate, -5)).toBe('2023-12-29')
    })

    // B1: leap year Feb 28→29
    it('B1: addDays leap year Feb 28→29', () => {
      expect(addDays('2024-02-28' as LocalDate, 1)).toBe('2024-02-29')
    })

    // B2: non-leap Feb 28→Mar 1
    it('B2: addDays non-leap Feb 28→Mar 1', () => {
      expect(addDays('2023-02-28' as LocalDate, 1)).toBe('2023-03-01')
    })

    it('addDays leap year Feb 29→Mar 1', () => {
      expect(addDays('2024-02-29' as LocalDate, 1)).toBe('2024-03-01')
    })

    // LAW 7: inverse
    it('LAW 7: addDays inverse', () => {
      const original = '2024-03-15' as LocalDate
      const n = 10
      expect(addDays(addDays(original, n), -n)).toBe(original)
    })

    // LAW 8: associative
    it('LAW 8: addDays associative', () => {
      const d = '2024-03-15' as LocalDate
      const a = 5
      const b = 7
      expect(addDays(addDays(d, a), b)).toBe(addDays(d, a + b))
    })
  })

  describe('addMinutes', () => {
    // LAW 11: identity
    it('LAW 11: addMinutes identity (n=0)', () => {
      expect(addMinutes('2024-03-15T14:30:00' as LocalDateTime, 0)).toBe(
        '2024-03-15T14:30:00'
      )
    })

    it('addMinutes within hour', () => {
      expect(addMinutes('2024-03-15T14:30:00' as LocalDateTime, 15)).toBe(
        '2024-03-15T14:45:00'
      )
    })

    it('addMinutes hour overflow', () => {
      expect(addMinutes('2024-03-15T14:30:00' as LocalDateTime, 45)).toBe(
        '2024-03-15T15:15:00'
      )
    })

    // LAW 14: day overflow
    it('LAW 14: addMinutes day overflow', () => {
      expect(addMinutes('2024-03-15T23:30:00' as LocalDateTime, 60)).toBe(
        '2024-03-16T00:30:00'
      )
    })

    // B5: day underflow
    it('B5: addMinutes day underflow', () => {
      expect(addMinutes('2024-03-15T00:00:00' as LocalDateTime, -1)).toBe(
        '2024-03-14T23:59:00'
      )
    })

    // B6: leap year midnight
    it('B6: addMinutes leap year midnight', () => {
      expect(addMinutes('2024-02-28T23:59:00' as LocalDateTime, 1)).toBe(
        '2024-02-29T00:00:00'
      )
    })

    // B7: non-leap year midnight
    it('B7: addMinutes non-leap year midnight', () => {
      expect(addMinutes('2023-02-28T23:59:00' as LocalDateTime, 1)).toBe(
        '2023-03-01T00:00:00'
      )
    })

    // LAW 12: inverse
    it('LAW 12: addMinutes inverse', () => {
      const original = '2024-03-15T14:30:00' as LocalDateTime
      const n = 75
      expect(addMinutes(addMinutes(original, n), -n)).toBe(original)
    })

    // LAW 13: associative
    it('LAW 13: addMinutes associative', () => {
      const dt = '2024-03-15T14:30:00' as LocalDateTime
      const a = 30
      const b = 45
      expect(addMinutes(addMinutes(dt, a), b)).toBe(addMinutes(dt, a + b))
    })
  })

  describe('daysBetween', () => {
    // LAW 15: same date = 0
    it('LAW 15: daysBetween same date', () => {
      expect(
        daysBetween('2024-03-15' as LocalDate, '2024-03-15' as LocalDate)
      ).toBe(0)
    })

    it('daysBetween one day', () => {
      expect(
        daysBetween('2024-03-15' as LocalDate, '2024-03-16' as LocalDate)
      ).toBe(1)
    })

    // LAW 16: antisymmetric
    it('LAW 16: daysBetween antisymmetric', () => {
      expect(
        daysBetween('2024-03-16' as LocalDate, '2024-03-15' as LocalDate)
      ).toBe(-1)
    })

    it('daysBetween across month', () => {
      expect(
        daysBetween('2024-01-30' as LocalDate, '2024-02-05' as LocalDate)
      ).toBe(6)
    })

    it('daysBetween across year', () => {
      expect(
        daysBetween('2023-12-30' as LocalDate, '2024-01-05' as LocalDate)
      ).toBe(6)
    })

    it('daysBetween leap year Feb', () => {
      expect(
        daysBetween('2024-02-28' as LocalDate, '2024-03-01' as LocalDate)
      ).toBe(2)
    })

    it('daysBetween non-leap Feb', () => {
      expect(
        daysBetween('2023-02-28' as LocalDate, '2023-03-01' as LocalDate)
      ).toBe(1)
    })

    // LAW 17: additive inverse
    it('LAW 17: daysBetween additive inverse', () => {
      const d = '2024-03-15' as LocalDate
      const n = 10
      expect(daysBetween(d, addDays(d, n))).toBe(n)
    })

    // LAW 18: triangle inequality
    it('LAW 18: daysBetween triangle', () => {
      const a = '2024-03-10' as LocalDate
      const b = '2024-03-15' as LocalDate
      const c = '2024-03-20' as LocalDate
      expect(daysBetween(a, c)).toBe(daysBetween(a, b) + daysBetween(b, c))
    })
  })

  describe('minutesBetween', () => {
    // LAW 19: same datetime = 0
    it('LAW 19: minutesBetween same datetime', () => {
      const dt = '2024-03-15T14:30:00' as LocalDateTime
      expect(minutesBetween(dt, dt)).toBe(0)
    })

    it('minutesBetween one minute', () => {
      expect(
        minutesBetween(
          '2024-03-15T14:30:00' as LocalDateTime,
          '2024-03-15T14:31:00' as LocalDateTime
        )
      ).toBe(1)
    })

    // LAW 22: one day = 1440 minutes
    it('LAW 22: minutesBetween one day', () => {
      expect(
        minutesBetween(
          '2024-03-15T00:00:00' as LocalDateTime,
          '2024-03-16T00:00:00' as LocalDateTime
        )
      ).toBe(1440)
    })

    // LAW 20: antisymmetric
    it('LAW 20: minutesBetween antisymmetric', () => {
      const a = '2024-03-15T14:30:00' as LocalDateTime
      const b = '2024-03-15T14:45:00' as LocalDateTime
      expect(minutesBetween(a, b)).toBe(-minutesBetween(b, a))
    })

    // LAW 21: additive inverse
    it('LAW 21: minutesBetween additive inverse', () => {
      const dt = '2024-03-15T14:30:00' as LocalDateTime
      const n = 90
      expect(minutesBetween(dt, addMinutes(dt, n))).toBe(n)
    })
  })
})

// ============================================================================
// 5. DAY-OF-WEEK QUERIES
// ============================================================================

describe('Day-of-Week Queries', () => {
  describe('dayOfWeek', () => {
    // ANCHOR tests
    it('ANCHOR_3: Unix epoch is Thursday', () => {
      expect(dayOfWeek('1970-01-01' as LocalDate)).toBe('thu')
    })

    it('ANCHOR_1: Y2K is Saturday', () => {
      expect(dayOfWeek('2000-01-01' as LocalDate)).toBe('sat')
    })

    it('ANCHOR_2/LAW 25: 2024 start is Monday', () => {
      expect(dayOfWeek('2024-01-01' as LocalDate)).toBe('mon')
    })

    // LAW 23: cyclic (7 days)
    it('LAW 23: dayOfWeek cyclic', () => {
      const d = '2024-03-15' as LocalDate
      expect(dayOfWeek(addDays(d, 7))).toBe(dayOfWeek(d))
    })

    // LAW 24: increment
    it('LAW 24: dayOfWeek increment', () => {
      const weekdays: Weekday[] = [
        'mon',
        'tue',
        'wed',
        'thu',
        'fri',
        'sat',
        'sun',
      ]
      const d = '2024-01-01' as LocalDate // Monday
      for (let i = 0; i < 7; i++) {
        expect(dayOfWeek(addDays(d, i))).toBe(weekdays[i])
      }
    })
  })

  describe('weekdayToIndex / indexToWeekday', () => {
    it('weekdayToIndex mon = 0', () => {
      expect(weekdayToIndex('mon')).toBe(0)
    })

    it('weekdayToIndex sun = 6', () => {
      expect(weekdayToIndex('sun')).toBe(6)
    })

    it('indexToWeekday 0 = mon', () => {
      expect(indexToWeekday(0)).toBe('mon')
    })

    it('indexToWeekday 6 = sun', () => {
      expect(indexToWeekday(6)).toBe('sun')
    })

    // LAW 26: weekday bijection
    it('LAW 26: weekday bijection', () => {
      const weekdays: Weekday[] = [
        'mon',
        'tue',
        'wed',
        'thu',
        'fri',
        'sat',
        'sun',
      ]
      for (const w of weekdays) {
        expect(indexToWeekday(weekdayToIndex(w))).toBe(w)
      }
    })

    // LAW 27: index bijection
    it('LAW 27: index bijection', () => {
      for (let i = 0; i <= 6; i++) {
        expect(weekdayToIndex(indexToWeekday(i))).toBe(i)
      }
    })

    // LAW 28: weekday order
    it('LAW 28: weekday order', () => {
      expect(weekdayToIndex('mon')).toBeLessThan(weekdayToIndex('tue'))
      expect(weekdayToIndex('tue')).toBeLessThan(weekdayToIndex('wed'))
      expect(weekdayToIndex('wed')).toBeLessThan(weekdayToIndex('thu'))
      expect(weekdayToIndex('thu')).toBeLessThan(weekdayToIndex('fri'))
      expect(weekdayToIndex('fri')).toBeLessThan(weekdayToIndex('sat'))
      expect(weekdayToIndex('sat')).toBeLessThan(weekdayToIndex('sun'))
    })
  })
})

// ============================================================================
// 6. MONTH AND YEAR QUERIES
// ============================================================================

describe('Month and Year Queries', () => {
  describe('isLeapYear', () => {
    it('2024 is leap (div by 4, not 100)', () => {
      expect(isLeapYear(2024)).toBe(true)
    })

    it('2023 is not leap (not div by 4)', () => {
      expect(isLeapYear(2023)).toBe(false)
    })

    it('2000 is leap (div by 400)', () => {
      expect(isLeapYear(2000)).toBe(true)
    })

    it('1900 is not leap (div by 100, not 400)', () => {
      expect(isLeapYear(1900)).toBe(false)
    })

    it('2100 is not leap (div by 100, not 400)', () => {
      expect(isLeapYear(2100)).toBe(false)
    })
  })

  describe('daysInMonth', () => {
    // LAW 29: standard months
    it('LAW 29: January has 31 days', () => {
      expect(daysInMonth(2024, 1)).toBe(31)
    })

    // LAW 30: February varies
    it('LAW 30: Feb leap year has 29 days', () => {
      expect(daysInMonth(2024, 2)).toBe(29)
    })

    it('LAW 30: Feb non-leap has 28 days', () => {
      expect(daysInMonth(2023, 2)).toBe(28)
    })

    it('March has 31 days', () => {
      expect(daysInMonth(2024, 3)).toBe(31)
    })

    it('April has 30 days', () => {
      expect(daysInMonth(2024, 4)).toBe(30)
    })

    it('May has 31 days', () => {
      expect(daysInMonth(2024, 5)).toBe(31)
    })

    it('June has 30 days', () => {
      expect(daysInMonth(2024, 6)).toBe(30)
    })

    it('July has 31 days', () => {
      expect(daysInMonth(2024, 7)).toBe(31)
    })

    it('August has 31 days', () => {
      expect(daysInMonth(2024, 8)).toBe(31)
    })

    it('September has 30 days', () => {
      expect(daysInMonth(2024, 9)).toBe(30)
    })

    it('October has 31 days', () => {
      expect(daysInMonth(2024, 10)).toBe(31)
    })

    it('November has 30 days', () => {
      expect(daysInMonth(2024, 11)).toBe(30)
    })

    it('December has 31 days', () => {
      expect(daysInMonth(2024, 12)).toBe(31)
    })

    it('LAW 30: Feb 2000 (century leap) has 29 days', () => {
      expect(daysInMonth(2000, 2)).toBe(29)
    })

    it('LAW 30: Feb 1900 (century non-leap) has 28 days', () => {
      expect(daysInMonth(1900, 2)).toBe(28)
    })
  })

  describe('daysInYear', () => {
    // LAW 32
    it('LAW 32: leap year has 366 days', () => {
      expect(daysInYear(2024)).toBe(366)
    })

    it('LAW 32: non-leap year has 365 days', () => {
      expect(daysInYear(2023)).toBe(365)
    })

    // LAW 33: sum of months
    it('LAW 33: daysInYear equals sum of daysInMonth', () => {
      const year = 2024
      let sum = 0
      for (let m = 1; m <= 12; m++) {
        sum += daysInMonth(year, m)
      }
      expect(daysInYear(year)).toBe(sum)
    })
  })
})

// ============================================================================
// 7. COMPONENT EXTRACTION
// ============================================================================

describe('Component Extraction', () => {
  describe('Date Components', () => {
    it('yearOf extracts year', () => {
      expect(yearOf('2024-03-15' as LocalDate)).toBe(2024)
    })

    it('monthOf extracts month', () => {
      expect(monthOf('2024-03-15' as LocalDate)).toBe(3)
    })

    it('dayOf extracts day', () => {
      expect(dayOf('2024-03-15' as LocalDate)).toBe(15)
    })

    // LAW 34: date reconstruction
    it('LAW 34: date reconstruction', () => {
      const d = '2024-03-15' as LocalDate
      expect(makeDate(yearOf(d), monthOf(d), dayOf(d))).toBe(d)
    })

    // LAW 35: monthOf range
    it('LAW 35: monthOf in [1, 12]', () => {
      const dates = ['2024-01-15', '2024-06-15', '2024-12-15'] as LocalDate[]
      for (const d of dates) {
        const m = monthOf(d)
        expect(m).toBeGreaterThanOrEqual(1)
        expect(m).toBeLessThanOrEqual(12)
      }
    })

    // LAW 36: dayOf range
    it('LAW 36: dayOf in [1, 31]', () => {
      const dates = ['2024-01-01', '2024-01-15', '2024-01-31'] as LocalDate[]
      for (const d of dates) {
        const day = dayOf(d)
        expect(day).toBeGreaterThanOrEqual(1)
        expect(day).toBeLessThanOrEqual(31)
      }
    })

    // LAW 37: dayOf validity
    it('LAW 37: dayOf <= daysInMonth', () => {
      const dates = [
        '2024-01-31',
        '2024-02-29',
        '2024-04-30',
        '2024-06-30',
      ] as LocalDate[]
      for (const d of dates) {
        expect(dayOf(d)).toBeLessThanOrEqual(daysInMonth(yearOf(d), monthOf(d)))
      }
    })
  })

  describe('Time Components', () => {
    it('hourOf extracts hour', () => {
      expect(hourOf('14:30:45' as LocalTime)).toBe(14)
    })

    it('minuteOf extracts minute', () => {
      expect(minuteOf('14:30:45' as LocalTime)).toBe(30)
    })

    it('secondOf extracts second', () => {
      expect(secondOf('14:30:45' as LocalTime)).toBe(45)
    })

    // LAW 38: time reconstruction
    it('LAW 38: time reconstruction', () => {
      const t = '14:30:45' as LocalTime
      expect(makeTime(hourOf(t), minuteOf(t), secondOf(t))).toBe(t)
    })

    // LAW 39: hourOf range
    it('LAW 39: hourOf in [0, 23]', () => {
      const times = ['00:00:00', '12:00:00', '23:59:59'] as LocalTime[]
      for (const t of times) {
        const h = hourOf(t)
        expect(h).toBeGreaterThanOrEqual(0)
        expect(h).toBeLessThanOrEqual(23)
      }
    })

    // LAW 40: minuteOf range
    it('LAW 40: minuteOf in [0, 59]', () => {
      const times = ['00:00:00', '00:30:00', '00:59:00'] as LocalTime[]
      for (const t of times) {
        const m = minuteOf(t)
        expect(m).toBeGreaterThanOrEqual(0)
        expect(m).toBeLessThanOrEqual(59)
      }
    })

    // LAW 41: secondOf range
    it('LAW 41: secondOf in [0, 59]', () => {
      const times = ['00:00:00', '00:00:30', '00:00:59'] as LocalTime[]
      for (const t of times) {
        const s = secondOf(t)
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThanOrEqual(59)
      }
    })
  })

  describe('DateTime Decomposition', () => {
    // LAW 42: datetime reconstruction
    it('LAW 42: datetime reconstruction', () => {
      const dt = '2024-03-15T14:30:45' as LocalDateTime
      expect(makeDateTime(dateOf(dt), timeOf(dt))).toBe(dt)
    })
  })
})

// ============================================================================
// 8. TIMEZONE CONVERSION
// ============================================================================

describe('Timezone Conversion', () => {
  describe('toUTC / toLocal Round-Trip', () => {
    it('toUTC standard time (EST -5h)', () => {
      const local = '2024-01-15T12:00:00' as LocalDateTime
      const tz = 'America/New_York'
      const utc = toUTC(local, tz)
      // EST is UTC-5, so 12:00 EST = 17:00 UTC
      expect(utc).toBe('2024-01-15T17:00:00')
    })

    it('toUTC DST time (EDT -4h)', () => {
      const local = '2024-07-15T12:00:00' as LocalDateTime
      const tz = 'America/New_York'
      const utc = toUTC(local, tz)
      // EDT is UTC-4, so 12:00 EDT = 16:00 UTC
      expect(utc).toBe('2024-07-15T16:00:00')
    })

    // LAW 43: UTC round-trip
    it('LAW 43: UTC round-trip', () => {
      const utc = '2024-03-15T17:00:00' as LocalDateTime
      const tz = 'America/New_York'
      expect(toUTC(toLocal(utc, tz), tz)).toBe(utc)
    })

    // LAW 44: Local round-trip (non-gap)
    it('LAW 44: Local round-trip for non-gap time', () => {
      const local = '2024-01-15T12:00:00' as LocalDateTime
      const tz = 'America/New_York'
      expect(toLocal(toUTC(local, tz), tz)).toBe(local)
    })
  })

  describe('DST Gap Handling (Spring Forward)', () => {
    it('toUTC gap time shifts forward', () => {
      // 2024-03-10 02:30 doesn't exist in America/New_York (DST gap)
      const local = '2024-03-10T02:30:00' as LocalDateTime
      const tz = 'America/New_York'
      // Should shift to 03:00 (first valid time after gap)
      const utc = toUTC(local, tz)
      // 03:00 EDT = 07:00 UTC
      expect(utc).toBe('2024-03-10T07:00:00')
    })
  })

  describe('DST Overlap Handling (Fall Back)', () => {
    it('toUTC overlap time uses standard time', () => {
      // 2024-11-03 01:30 occurs twice in America/New_York (DST overlap)
      const local = '2024-11-03T01:30:00' as LocalDateTime
      const tz = 'America/New_York'
      // Assume standard time (later instant)
      const utc = toUTC(local, tz)
      // 01:30 EST = 06:30 UTC
      expect(utc).toBe('2024-11-03T06:30:00')
    })
  })

  describe('isDSTAt', () => {
    it('winter is not DST', () => {
      expect(isDSTAt('2024-01-15T12:00:00' as LocalDateTime, 'America/New_York')).toBe(false)
    })

    it('summer is DST', () => {
      expect(isDSTAt('2024-07-15T12:00:00' as LocalDateTime, 'America/New_York')).toBe(true)
    })

    it('gap time returns "gap"', () => {
      expect(isDSTAt('2024-03-10T02:30:00' as LocalDateTime, 'America/New_York')).toBe('gap')
    })

    it('overlap time returns "overlap"', () => {
      expect(isDSTAt('2024-11-03T01:30:00' as LocalDateTime, 'America/New_York')).toBe('overlap')
    })

    it('no-DST timezone returns false', () => {
      expect(isDSTAt('2024-07-15T12:00:00' as LocalDateTime, 'UTC')).toBe(false)
    })
  })
})

// ============================================================================
// 9. COMPARISON OPERATIONS
// ============================================================================

describe('Comparison Operations', () => {
  describe('Date Comparison', () => {
    // LAW 46: equal
    it('LAW 46: dates equal', () => {
      expect(
        compareDates('2024-03-15' as LocalDate, '2024-03-15' as LocalDate)
      ).toBe(0)
    })

    // LAW 45: total order
    it('LAW 45: date before', () => {
      expect(
        compareDates('2024-03-14' as LocalDate, '2024-03-15' as LocalDate)
      ).toBeLessThan(0)
    })

    it('LAW 45: date after', () => {
      expect(
        compareDates('2024-03-16' as LocalDate, '2024-03-15' as LocalDate)
      ).toBeGreaterThan(0)
    })

    it('dateEquals reflexive', () => {
      const d = '2024-03-15' as LocalDate
      expect(dateEquals(d, d)).toBe(true)
    })

    it('dateEquals symmetric', () => {
      const a = '2024-03-15' as LocalDate
      const b = '2024-03-15' as LocalDate
      expect(dateEquals(a, b)).toBe(dateEquals(b, a))
    })

    // LAW 49: dateBefore antisymmetric
    it('LAW 49: dateBefore antisymmetric', () => {
      const a = '2024-03-14' as LocalDate
      const b = '2024-03-15' as LocalDate
      expect(dateBefore(a, b)).toBe(true)
      expect(dateBefore(b, a)).toBe(false)
    })

    // LAW 50: dateBefore transitive
    it('LAW 50: dateBefore transitive', () => {
      const a = '2024-03-13' as LocalDate
      const b = '2024-03-14' as LocalDate
      const c = '2024-03-15' as LocalDate
      expect(dateBefore(a, b)).toBe(true)
      expect(dateBefore(b, c)).toBe(true)
      expect(dateBefore(a, c)).toBe(true)
    })
  })

  describe('Time Comparison', () => {
    it('times equal', () => {
      expect(
        compareTimes('14:30:00' as LocalTime, '14:30:00' as LocalTime)
      ).toBe(0)
    })

    it('time before', () => {
      expect(
        compareTimes('14:29:00' as LocalTime, '14:30:00' as LocalTime)
      ).toBeLessThan(0)
    })

    it('time after', () => {
      expect(
        compareTimes('14:31:00' as LocalTime, '14:30:00' as LocalTime)
      ).toBeGreaterThan(0)
    })
  })

  describe('DateTime Comparison', () => {
    it('datetimes equal', () => {
      expect(
        compareDateTimes(
          '2024-03-15T14:30:00' as LocalDateTime,
          '2024-03-15T14:30:00' as LocalDateTime
        )
      ).toBe(0)
    })

    it('datetime before (same day)', () => {
      expect(
        compareDateTimes(
          '2024-03-15T14:29:00' as LocalDateTime,
          '2024-03-15T14:30:00' as LocalDateTime
        )
      ).toBeLessThan(0)
    })

    it('datetime before (different day)', () => {
      expect(
        compareDateTimes(
          '2024-03-14T14:30:00' as LocalDateTime,
          '2024-03-15T14:30:00' as LocalDateTime
        )
      ).toBeLessThan(0)
    })
  })
})

// ============================================================================
// 10. ERROR HANDLING
// ============================================================================

describe('Error Handling', () => {
  it('parse functions throw ParseError on invalid input', () => {
    expect(() => parseDate('invalid')).toThrow()
  })

  it('error includes input value', () => {
    try {
      parseDate('2024-13-01')
      expect.unreachable('should have thrown')
    } catch (e: any) {
      expect(e.message).toContain('2024-13-01')
    }
  })

  it('error mentions expected constraint', () => {
    try {
      parseDate('2024-13-01')
      expect.unreachable('should have thrown')
    } catch (e: any) {
      expect(e.message.toLowerCase()).toMatch(/month|invalid/)
    }
  })
})

// ============================================================================
// 11. INVARIANTS
// ============================================================================

describe('System Invariants', () => {
  it('INV 3: Every LocalDateTime decomposes to valid components', () => {
    const dt = '2024-03-15T14:30:45' as LocalDateTime
    const date = dateOf(dt)
    const time = timeOf(dt)

    // Date should be valid
    expect(() => parseDate(date)).not.toThrow()
    // Time should be valid
    expect(() => parseTime(time)).not.toThrow()
  })

  it('INV 5: All string representations are canonical', () => {
    // Parse and format should produce canonical form
    const dates = ['2024-03-15', '2024-01-01', '2024-12-31']
    for (const dateStr of dates) {
      const result = parseDate(dateStr)
      expect(formatDate(result)).toBe(dateStr)
    }
  })
})
