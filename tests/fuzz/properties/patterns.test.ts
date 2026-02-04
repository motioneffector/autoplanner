/**
 * Property tests for pattern expansion (Spec 4).
 *
 * Tests the invariants and laws for:
 * - Pattern expansion (date generation)
 * - Pattern type-specific behavior
 * - Pattern composition (activeOnDates, inactiveOnDates)
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
  localDateGen,
  boundaryDateGen,
} from '../generators'
import { parseLocalDate, lastDayOfMonth, makeLocalDate, isLeapYear } from '../lib/utils'
import type { Pattern, LocalDate, DayName } from '../lib/types'

// ============================================================================
// Helper: Pattern Expansion
// ============================================================================

/**
 * Expand a pattern to dates within a range.
 * This is a reference implementation for testing.
 */
function expandPattern(pattern: Pattern, startDate: LocalDate, endDate: LocalDate): LocalDate[] {
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)
  const results: LocalDate[] = []

  // Create Date objects for iteration
  const startD = new Date(Date.UTC(start.year, start.month - 1, start.day))
  const endD = new Date(Date.UTC(end.year, end.month - 1, end.day))

  const dayNameToNumber: Record<DayName, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  }

  switch (pattern.type) {
    case 'daily': {
      const current = new Date(startD)
      while (current <= endD) {
        results.push(makeLocalDate(current.getUTCFullYear(), current.getUTCMonth() + 1, current.getUTCDate()))
        current.setUTCDate(current.getUTCDate() + 1)
      }
      break
    }

    case 'everyNDays': {
      const anchor = parseLocalDate(pattern.anchor)
      const anchorD = new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day))
      const daysDiff = Math.floor((startD.getTime() - anchorD.getTime()) / (1000 * 60 * 60 * 24))
      const offset = ((daysDiff % pattern.n) + pattern.n) % pattern.n
      const firstMatch = new Date(startD)
      if (offset !== 0) {
        firstMatch.setUTCDate(firstMatch.getUTCDate() + (pattern.n - offset))
      }

      const current = new Date(firstMatch)
      while (current <= endD) {
        if (current >= startD) {
          results.push(makeLocalDate(current.getUTCFullYear(), current.getUTCMonth() + 1, current.getUTCDate()))
        }
        current.setUTCDate(current.getUTCDate() + pattern.n)
      }
      break
    }

    case 'weekly': {
      const targetDays = pattern.days.map((d) => dayNameToNumber[d])
      const current = new Date(startD)
      while (current <= endD) {
        if (targetDays.includes(current.getUTCDay())) {
          results.push(makeLocalDate(current.getUTCFullYear(), current.getUTCMonth() + 1, current.getUTCDate()))
        }
        current.setUTCDate(current.getUTCDate() + 1)
      }
      break
    }

    case 'weekdays': {
      const current = new Date(startD)
      while (current <= endD) {
        const dow = current.getUTCDay()
        if (dow >= 1 && dow <= 5) {
          // Mon-Fri
          results.push(makeLocalDate(current.getUTCFullYear(), current.getUTCMonth() + 1, current.getUTCDate()))
        }
        current.setUTCDate(current.getUTCDate() + 1)
      }
      break
    }

    case 'monthly': {
      const current = new Date(startD)
      current.setUTCDate(1) // Start from beginning of month for consistency
      while (current <= endD) {
        const year = current.getUTCFullYear()
        const month = current.getUTCMonth() + 1
        const maxDay = lastDayOfMonth(year, month)
        const targetDay = Math.min(pattern.day, maxDay)
        const date = makeLocalDate(year, month, targetDay)
        if (date >= startDate && date <= endDate) {
          results.push(date)
        }
        current.setUTCMonth(current.getUTCMonth() + 1)
      }
      break
    }

    case 'lastDayOfMonth': {
      const current = new Date(startD)
      current.setUTCDate(1)
      while (current <= endD) {
        const year = current.getUTCFullYear()
        const month = current.getUTCMonth() + 1
        const lastDay = lastDayOfMonth(year, month)
        const date = makeLocalDate(year, month, lastDay)
        if (date >= startDate && date <= endDate) {
          results.push(date)
        }
        current.setUTCMonth(current.getUTCMonth() + 1)
      }
      break
    }

    case 'yearly': {
      const current = new Date(startD)
      current.setUTCMonth(0, 1) // Start from beginning of year
      while (current.getUTCFullYear() <= end.year) {
        const year = current.getUTCFullYear()
        const maxDay = lastDayOfMonth(year, pattern.month)
        const targetDay = Math.min(pattern.day, maxDay)
        const date = makeLocalDate(year, pattern.month, targetDay)
        if (date >= startDate && date <= endDate) {
          results.push(date)
        }
        current.setUTCFullYear(current.getUTCFullYear() + 1)
      }
      break
    }

    case 'oneOff': {
      if (pattern.date >= startDate && pattern.date <= endDate) {
        results.push(pattern.date)
      }
      break
    }

    case 'custom': {
      for (const date of pattern.dates) {
        if (date >= startDate && date <= endDate) {
          results.push(date)
        }
      }
      break
    }

    case 'activeOnDates': {
      const baseDates = new Set(expandPattern(pattern.base, startDate, endDate))
      const activeDates = new Set(pattern.dates)
      for (const date of pattern.dates) {
        if (baseDates.has(date) && date >= startDate && date <= endDate) {
          results.push(date)
        }
      }
      break
    }

    case 'inactiveOnDates': {
      const baseDates = expandPattern(pattern.base, startDate, endDate)
      const inactiveDates = new Set(pattern.dates)
      for (const date of baseDates) {
        if (!inactiveDates.has(date)) {
          results.push(date)
        }
      }
      break
    }

    case 'everyNWeeks': {
      const targetDays = pattern.days.map((d) => dayNameToNumber[d])
      const anchor = parseLocalDate(pattern.anchor)
      const anchorD = new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day))

      const current = new Date(startD)
      while (current <= endD) {
        // Check if current day is one of the target days
        if (targetDays.includes(current.getUTCDay())) {
          // Calculate weeks since anchor
          const daysDiff = Math.floor((current.getTime() - anchorD.getTime()) / (1000 * 60 * 60 * 24))
          const weeksDiff = Math.floor(daysDiff / 7)
          // Check if this is an Nth week from anchor
          if (weeksDiff >= 0 && weeksDiff % pattern.n === 0) {
            results.push(makeLocalDate(current.getUTCFullYear(), current.getUTCMonth() + 1, current.getUTCDate()))
          } else if (weeksDiff < 0 && ((-weeksDiff) % pattern.n === 0)) {
            results.push(makeLocalDate(current.getUTCFullYear(), current.getUTCMonth() + 1, current.getUTCDate()))
          }
        }
        current.setUTCDate(current.getUTCDate() + 1)
      }
      break
    }

    case 'nthWeekdayOfMonth': {
      const targetDow = dayNameToNumber[pattern.day]
      const current = new Date(startD)
      current.setUTCDate(1) // Start from beginning of month

      while (current <= endD) {
        const year = current.getUTCFullYear()
        const month = current.getUTCMonth()

        // Find the nth occurrence of the target weekday in this month
        const firstOfMonth = new Date(Date.UTC(year, month, 1))
        const firstDow = firstOfMonth.getUTCDay()

        // Calculate the day of month for the first occurrence of target weekday
        let firstOccurrence = targetDow - firstDow + 1
        if (firstOccurrence <= 0) firstOccurrence += 7

        // Calculate the nth occurrence
        const nthDay = firstOccurrence + (pattern.n - 1) * 7

        // Check if this day exists in the month
        const maxDay = lastDayOfMonth(year, month + 1)
        if (nthDay <= maxDay) {
          const date = makeLocalDate(year, month + 1, nthDay)
          if (date >= startDate && date <= endDate) {
            results.push(date)
          }
        }

        // Move to next month
        current.setUTCMonth(current.getUTCMonth() + 1)
      }
      break
    }

    default:
      break
  }

  // Sort and deduplicate
  return [...new Set(results)].sort()
}

// ============================================================================
// General Pattern Properties (Task #190-#193)
// ============================================================================

describe('Spec 4: Patterns - General Properties', () => {
  it('Property #190: pattern expansion is deterministic', () => {
    fc.assert(
      fc.property(simplePatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion1 = expandPattern(pattern, startDate, endDate)
        const expansion2 = expandPattern(pattern, startDate, endDate)

        expect(expansion1).toEqual(expansion2)
      })
    )
  })

  it('Property #191: expanded dates within range bounds', () => {
    fc.assert(
      fc.property(simplePatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)

        expansion.forEach((date) => {
          expect(date >= startDate).toBe(true)
          expect(date <= endDate).toBe(true)
        })
      })
    )
  })

  it('Property #192: expanded dates are sorted ascending', () => {
    fc.assert(
      fc.property(simplePatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)
        const sorted = [...expansion].sort()

        expect(expansion).toEqual(sorted)
      })
    )
  })

  it('Property #193: expanded dates have no duplicates', () => {
    fc.assert(
      fc.property(simplePatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)
        const unique = new Set(expansion)

        expect(expansion.length).toBe(unique.size)
      })
    )
  })
})

// ============================================================================
// Daily Pattern Properties (Task #194-#195)
// ============================================================================

describe('Spec 4: Patterns - Daily', () => {
  it('Property #194: daily pattern produces consecutive dates', () => {
    fc.assert(
      fc.property(dailyPatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)

        // Each consecutive pair should be 1 day apart
        for (let i = 1; i < expansion.length; i++) {
          const prev = parseLocalDate(expansion[i - 1])
          const curr = parseLocalDate(expansion[i])
          const prevD = new Date(Date.UTC(prev.year, prev.month - 1, prev.day))
          const currD = new Date(Date.UTC(curr.year, curr.month - 1, curr.day))
          const diff = (currD.getTime() - prevD.getTime()) / (1000 * 60 * 60 * 24)
          expect(diff).toBe(1)
        }
      })
    )
  })

  it('Property #195: daily pattern count = days in range + 1', () => {
    fc.assert(
      fc.property(dailyPatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)

        const start = parseLocalDate(startDate)
        const end = parseLocalDate(endDate)
        const startD = new Date(Date.UTC(start.year, start.month - 1, start.day))
        const endD = new Date(Date.UTC(end.year, end.month - 1, end.day))
        const expectedDays = Math.floor((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1

        expect(expansion.length).toBe(expectedDays)
      })
    )
  })
})

// ============================================================================
// EveryNDays Pattern Properties (Task #196-#197)
// ============================================================================

describe('Spec 4: Patterns - EveryNDays', () => {
  it('Property #196: everyNDays produces dates exactly N apart', () => {
    fc.assert(
      fc.property(everyNDaysPatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)

        // Each consecutive pair should be exactly N days apart
        for (let i = 1; i < expansion.length; i++) {
          const prev = parseLocalDate(expansion[i - 1])
          const curr = parseLocalDate(expansion[i])
          const prevD = new Date(Date.UTC(prev.year, prev.month - 1, prev.day))
          const currD = new Date(Date.UTC(curr.year, curr.month - 1, curr.day))
          const diff = (currD.getTime() - prevD.getTime()) / (1000 * 60 * 60 * 24)
          expect(diff).toBe(pattern.n)
        }
      })
    )
  })

  it('Property #197: everyNDays respects anchor date', () => {
    fc.assert(
      fc.property(everyNDaysPatternGen(), (pattern) => {
        // Expand around the anchor date
        const anchor = parseLocalDate(pattern.anchor)
        const startDate = makeLocalDate(anchor.year, anchor.month, 1)
        const endYear = anchor.year + 1
        const endDate = makeLocalDate(endYear, 12, 31)

        const expansion = expandPattern(pattern, startDate, endDate)

        // If the anchor is in the range, it should be in the expansion
        if (pattern.anchor >= startDate && pattern.anchor <= endDate) {
          expect(expansion).toContain(pattern.anchor)
        }
      })
    )
  })
})

// ============================================================================
// Weekly Pattern Properties (Task #198-#199)
// ============================================================================

describe('Spec 4: Patterns - Weekly', () => {
  const dayNames: DayName[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

  it('Property #198: weekly pattern only produces specified weekdays', () => {
    fc.assert(
      fc.property(weeklyPatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)

        expansion.forEach((date) => {
          const { year, month, day } = parseLocalDate(date)
          const d = new Date(Date.UTC(year, month - 1, day))
          const dow = d.getUTCDay()
          const dayName = dayNames[dow]
          expect(pattern.days).toContain(dayName)
        })
      })
    )
  })
})

// ============================================================================
// Weekdays Pattern Properties (Task #211-#212)
// ============================================================================

describe('Spec 4: Patterns - Weekdays', () => {
  it('Property #211: weekdays produces Mon-Fri only', () => {
    fc.assert(
      fc.property(weekdaysPatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)

        expansion.forEach((date) => {
          const { year, month, day } = parseLocalDate(date)
          const d = new Date(Date.UTC(year, month - 1, day))
          const dow = d.getUTCDay()
          expect(dow).toBeGreaterThanOrEqual(1) // Monday
          expect(dow).toBeLessThanOrEqual(5) // Friday
        })
      })
    )
  })

  it('Property #212: weekdays produces 5 dates per full week', () => {
    fc.assert(
      fc.property(weekdaysPatternGen(), fc.integer({ min: 2020, max: 2030 }), (pattern, year) => {
        // Use a range that covers exactly 7 days starting from Monday
        // Find the first Monday of the year
        let firstMonday = new Date(Date.UTC(year, 0, 1))
        while (firstMonday.getUTCDay() !== 1) {
          firstMonday.setUTCDate(firstMonday.getUTCDate() + 1)
        }

        const startDate = makeLocalDate(
          firstMonday.getUTCFullYear(),
          firstMonday.getUTCMonth() + 1,
          firstMonday.getUTCDate()
        )

        // End on Sunday (6 days later)
        const endDay = new Date(firstMonday)
        endDay.setUTCDate(endDay.getUTCDate() + 6)
        const endDate = makeLocalDate(
          endDay.getUTCFullYear(),
          endDay.getUTCMonth() + 1,
          endDay.getUTCDate()
        )

        const expansion = expandPattern(pattern, startDate, endDate)

        // A full week (Mon-Sun) should produce exactly 5 weekdays (Mon-Fri)
        expect(expansion.length).toBe(5)
      })
    )
  })
})

// ============================================================================
// OneOff Pattern Properties (Task #213-#214)
// ============================================================================

describe('Spec 4: Patterns - OneOff', () => {
  it('Property #213: oneOff produces exactly one date', () => {
    fc.assert(
      fc.property(oneOffPatternGen(), (pattern) => {
        // Use a range that includes the date
        const start = parseLocalDate(pattern.date)
        const startDate = makeLocalDate(start.year, 1, 1)
        const endDate = makeLocalDate(start.year, 12, 31)

        const expansion = expandPattern(pattern, startDate, endDate)

        expect(expansion.length).toBe(1)
      })
    )
  })

  it('Property #214: oneOff date matches specified date', () => {
    fc.assert(
      fc.property(oneOffPatternGen(), (pattern) => {
        const start = parseLocalDate(pattern.date)
        const startDate = makeLocalDate(start.year, 1, 1)
        const endDate = makeLocalDate(start.year, 12, 31)

        const expansion = expandPattern(pattern, startDate, endDate)

        expect(expansion[0]).toBe(pattern.date)
      })
    )
  })
})

// ============================================================================
// Custom Pattern Properties (Task #215-#216)
// ============================================================================

describe('Spec 4: Patterns - Custom', () => {
  it('Property #215: custom produces exactly specified dates', () => {
    fc.assert(
      fc.property(customPatternGen(), (pattern) => {
        // Use a very wide range
        const startDate = makeLocalDate(1970, 1, 1) as LocalDate
        const endDate = makeLocalDate(2100, 12, 31) as LocalDate

        const expansion = expandPattern(pattern, startDate, endDate)

        // All dates in pattern should be in expansion
        pattern.dates.forEach((date) => {
          expect(expansion).toContain(date)
        })
        // Expansion should only contain dates from pattern
        expect(expansion.length).toBe(pattern.dates.length)
      })
    )
  })

  it('Property #216: custom filters to range', () => {
    fc.assert(
      fc.property(customPatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)

        // Only dates within range should be included
        const expected = pattern.dates.filter((d) => d >= startDate && d <= endDate)
        expect(expansion.length).toBe(expected.length)
      })
    )
  })
})

// ============================================================================
// ActiveOnDates/InactiveOnDates Properties (Task #217-#220)
// ============================================================================

describe('Spec 4: Patterns - Composition', () => {
  it('Property #217: activeOnDates restricts base pattern', () => {
    fc.assert(
      fc.property(activeOnDatesPatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)
        const baseExpansion = expandPattern(pattern.base, startDate, endDate)

        // Result should be subset of base
        expansion.forEach((date) => {
          expect(baseExpansion).toContain(date)
        })
        // Result should also be subset of active dates
        const activeDates = new Set(pattern.dates)
        expansion.forEach((date) => {
          expect(activeDates.has(date)).toBe(true)
        })
      })
    )
  })

  it('Property #218: activeOnDates is intersection with base', () => {
    fc.assert(
      fc.property(activeOnDatesPatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)
        const baseExpansion = new Set(expandPattern(pattern.base, startDate, endDate))

        // Result should be intersection of base and active dates
        const expected = pattern.dates.filter((d) => baseExpansion.has(d) && d >= startDate && d <= endDate).sort()

        expect(expansion).toEqual(expected)
      })
    )
  })

  it('Property #219: inactiveOnDates excludes specified dates', () => {
    fc.assert(
      fc.property(inactiveOnDatesPatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)
        const inactiveDates = new Set(pattern.dates)

        // None of the inactive dates should appear in the result
        expansion.forEach((date) => {
          expect(inactiveDates.has(date)).toBe(false)
        })
      })
    )
  })

  it('Property #220: inactiveOnDates = base minus specified', () => {
    fc.assert(
      fc.property(inactiveOnDatesPatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)
        const baseExpansion = expandPattern(pattern.base, startDate, endDate)
        const inactiveDates = new Set(pattern.dates)

        // Result should be base minus inactive
        const expected = baseExpansion.filter((d) => !inactiveDates.has(d))

        expect(expansion).toEqual(expected)
      })
    )
  })
})

// ============================================================================
// LastDayOfMonth Properties (Task #207-#208)
// ============================================================================

describe('Spec 4: Patterns - LastDayOfMonth', () => {
  it('Property #207: lastDayOfMonth pattern produces actual last day', () => {
    fc.assert(
      fc.property(lastDayOfMonthPatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)

        expansion.forEach((date) => {
          const { year, month, day } = parseLocalDate(date)
          const expectedLastDay = lastDayOfMonth(year, month)
          expect(day).toBe(expectedLastDay)
        })
      })
    )
  })

  it('Property #208: lastDayOfMonth handles Feb correctly', () => {
    fc.assert(
      fc.property(lastDayOfMonthPatternGen(), fc.integer({ min: 2000, max: 2100 }), (pattern, year) => {
        const startDate = makeLocalDate(year, 2, 1) as LocalDate
        const endDate = makeLocalDate(year, 2, 29) as LocalDate // Feb 29 won't exist in non-leap years

        const expansion = expandPattern(pattern, startDate, endDate)

        if (expansion.length > 0) {
          const { day } = parseLocalDate(expansion[0])
          if (isLeapYear(year)) {
            expect(day).toBe(29)
          } else {
            expect(day).toBe(28)
          }
        }
      })
    )
  })
})

// ============================================================================
// Yearly Properties (Task #209-#210)
// ============================================================================

describe('Spec 4: Patterns - Yearly', () => {
  it('Property #209: yearly produces same month/day yearly (clamped)', () => {
    fc.assert(
      fc.property(yearlyPatternGen(), fc.integer({ min: 2000, max: 2020 }), (pattern, startYear) => {
        const startDate = makeLocalDate(startYear, 1, 1) as LocalDate
        const endDate = makeLocalDate(startYear + 5, 12, 31) as LocalDate

        const expansion = expandPattern(pattern, startDate, endDate)

        expansion.forEach((date) => {
          const { year, month, day } = parseLocalDate(date)
          expect(month).toBe(pattern.month)
          // Day should be clamped to valid range for month
          const maxDay = lastDayOfMonth(year, month)
          const expectedDay = Math.min(pattern.day, maxDay)
          expect(day).toBe(expectedDay)
        })
      })
    )
  })

  it('Property #210: yearly Feb 29 only in leap years', () => {
    const feb29Pattern = { type: 'yearly' as const, month: 2, day: 29 }

    fc.assert(
      fc.property(fc.integer({ min: 2000, max: 2100 }), (year) => {
        const startDate = makeLocalDate(year, 1, 1) as LocalDate
        const endDate = makeLocalDate(year, 12, 31) as LocalDate

        const expansion = expandPattern(feb29Pattern, startDate, endDate)

        if (expansion.length > 0) {
          const { day } = parseLocalDate(expansion[0])
          if (isLeapYear(year)) {
            expect(day).toBe(29)
          } else {
            expect(day).toBe(28) // Clamped
          }
        }
      })
    )
  })
})

// ============================================================================
// EveryNWeeks Properties (Task #199-#201)
// ============================================================================

describe('Spec 4: Patterns - EveryNWeeks', () => {
  it('Property #199: weekly pattern produces all specified weekdays each week', () => {
    fc.assert(
      fc.property(weeklyPatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)

        const dayNameToNumber: Record<DayName, number> = {
          sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
        }
        const expectedDays = new Set(pattern.days.map((d) => dayNameToNumber[d]))

        // All produced dates should be on specified weekdays
        expansion.forEach((date) => {
          const { year, month, day } = parseLocalDate(date)
          const d = new Date(Date.UTC(year, month - 1, day))
          expect(expectedDays.has(d.getUTCDay())).toBe(true)
        })
      })
    )
  })

  it('Property #200: everyNWeeks produces correct week spacing', () => {
    fc.assert(
      fc.property(everyNWeeksPatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)
        fc.pre(expansion.length >= 2)

        // Group dates by week number (relative to anchor)
        const anchorParsed = parseLocalDate(pattern.anchor)
        const anchorDate = new Date(Date.UTC(anchorParsed.year, anchorParsed.month - 1, anchorParsed.day))

        const weekNumbers = expansion.map((date) => {
          const { year, month, day } = parseLocalDate(date)
          const d = new Date(Date.UTC(year, month - 1, day))
          const daysDiff = Math.floor((d.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24))
          return Math.floor(daysDiff / 7)
        })

        const uniqueWeeks = [...new Set(weekNumbers)].sort((a, b) => a - b)

        // Week spacing should be n (everyNWeeks)
        for (let i = 1; i < uniqueWeeks.length; i++) {
          const diff = uniqueWeeks[i] - uniqueWeeks[i - 1]
          expect(diff).toBe(pattern.n)
        }
      })
    )
  })

  it('Property #201: everyNWeeks only on specified days', () => {
    fc.assert(
      fc.property(everyNWeeksPatternGen(), localDateGen(), localDateGen(), (pattern, d1, d2) => {
        const startDate = d1 < d2 ? d1 : d2
        const endDate = d1 < d2 ? d2 : d1

        const expansion = expandPattern(pattern, startDate, endDate)

        const dayNameToNumber: Record<DayName, number> = {
          sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
        }
        const expectedDays = new Set(pattern.days.map((d) => dayNameToNumber[d]))

        expansion.forEach((date) => {
          const { year, month, day } = parseLocalDate(date)
          const d = new Date(Date.UTC(year, month - 1, day))
          expect(expectedDays.has(d.getUTCDay())).toBe(true)
        })
      })
    )
  })
})

// ============================================================================
// Monthly Properties (Task #202-#204)
// ============================================================================

describe('Spec 4: Patterns - Monthly', () => {
  it('Property #202: monthly pattern produces same day (clamped)', () => {
    fc.assert(
      fc.property(monthlyPatternGen(), fc.integer({ min: 2020, max: 2025 }), (pattern, year) => {
        const startDate = makeLocalDate(year, 1, 1) as LocalDate
        const endDate = makeLocalDate(year, 12, 31) as LocalDate

        const expansion = expandPattern(pattern, startDate, endDate)

        expansion.forEach((date) => {
          const { year: y, month, day } = parseLocalDate(date)
          const maxDay = lastDayOfMonth(y, month)
          const expectedDay = Math.min(pattern.day, maxDay)
          expect(day).toBe(expectedDay)
        })
      })
    )
  })

  it('Property #203: monthly day 31 clamps to actual month end', () => {
    const day31Pattern = { type: 'monthly' as const, day: 31 }

    fc.assert(
      fc.property(fc.integer({ min: 2020, max: 2030 }), (year) => {
        const startDate = makeLocalDate(year, 1, 1) as LocalDate
        const endDate = makeLocalDate(year, 12, 31) as LocalDate

        const expansion = expandPattern(day31Pattern, startDate, endDate)

        expansion.forEach((date) => {
          const { year: y, month, day } = parseLocalDate(date)
          const expectedLastDay = lastDayOfMonth(y, month)
          expect(day).toBe(expectedLastDay)
        })
      })
    )
  })

  it('Property #204: monthly day 30 clamps in February', () => {
    const day30Pattern = { type: 'monthly' as const, day: 30 }

    fc.assert(
      fc.property(fc.integer({ min: 2020, max: 2030 }), (year) => {
        const startDate = makeLocalDate(year, 2, 1) as LocalDate
        const endDate = makeLocalDate(year, 2, 29) as LocalDate

        const expansion = expandPattern(day30Pattern, startDate, endDate)

        if (expansion.length > 0) {
          const { day } = parseLocalDate(expansion[0])
          // Feb has at most 29 days, so 30 clamps to last day
          const expectedDay = lastDayOfMonth(year, 2)
          expect(day).toBe(expectedDay)
        }
      })
    )
  })
})

// ============================================================================
// NthWeekdayOfMonth Properties (Task #205-#206)
// ============================================================================

describe('Spec 4: Patterns - NthWeekdayOfMonth', () => {
  it('Property #205: nthWeekdayOfMonth produces correct weekday', () => {
    fc.assert(
      fc.property(nthWeekdayOfMonthPatternGen(), fc.integer({ min: 2020, max: 2025 }), (pattern, year) => {
        const startDate = makeLocalDate(year, 1, 1) as LocalDate
        const endDate = makeLocalDate(year, 12, 31) as LocalDate

        const expansion = expandPattern(pattern, startDate, endDate)

        const dayNameToNumber: Record<DayName, number> = {
          sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
        }
        const expectedDow = dayNameToNumber[pattern.day]

        expansion.forEach((date) => {
          const { year: y, month, day } = parseLocalDate(date)
          const d = new Date(Date.UTC(y, month - 1, day))
          expect(d.getUTCDay()).toBe(expectedDow)
        })
      })
    )
  })

  it('Property #206: nthWeekdayOfMonth n=5 skips months without 5th occurrence', () => {
    // A month needs at least 29 days to have a 5th occurrence of any weekday
    // Only months with specific weekday starting positions have a 5th occurrence

    fc.assert(
      fc.property(
        fc.constantFrom<DayName>('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'),
        fc.integer({ min: 2020, max: 2025 }),
        (dayName, year) => {
          const pattern = { type: 'nthWeekdayOfMonth' as const, n: 5, day: dayName }
          const startDate = makeLocalDate(year, 1, 1) as LocalDate
          const endDate = makeLocalDate(year, 12, 31) as LocalDate

          const expansion = expandPattern(pattern, startDate, endDate)

          // The 5th occurrence only happens in some months
          // If a date is produced, it should be in days 29-31 (only possible for 5th occurrence)
          expansion.forEach((date) => {
            const { day } = parseLocalDate(date)
            expect(day).toBeGreaterThanOrEqual(29)
          })

          // Also verify not all 12 months are present (some won't have 5th occurrence)
          expect(expansion.length).toBeLessThan(12)
        }
      )
    )
  })
})

// ============================================================================
// Empty Range Properties (Task #221-#222)
// ============================================================================

describe('Spec 4: Patterns - Edge Cases', () => {
  it('Property #221: empty range produces empty result', () => {
    fc.assert(
      fc.property(simplePatternGen(), localDateGen(), (pattern, date) => {
        // Start date after end date = empty range
        const start = parseLocalDate(date)
        const startDate = makeLocalDate(start.year, start.month, start.day)
        const beforeStart = new Date(Date.UTC(start.year, start.month - 1, start.day))
        beforeStart.setUTCDate(beforeStart.getUTCDate() - 1)
        const endDate = makeLocalDate(beforeStart.getUTCFullYear(), beforeStart.getUTCMonth() + 1, beforeStart.getUTCDate()) as LocalDate

        // When start > end, expansion should be empty
        const expansion = expandPattern(pattern, startDate, endDate)
        expect(expansion.length).toBe(0)
      })
    )
  })

  it('Property #222: range before anchor produces empty/partial for everyNDays', () => {
    fc.assert(
      fc.property(everyNDaysPatternGen(), (pattern) => {
        const anchor = parseLocalDate(pattern.anchor)

        // Create a range entirely before the anchor
        const endBeforeAnchor = new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day))
        endBeforeAnchor.setUTCDate(endBeforeAnchor.getUTCDate() - 1)

        const startBeforeAnchor = new Date(endBeforeAnchor)
        startBeforeAnchor.setUTCDate(startBeforeAnchor.getUTCDate() - 30)

        const startDate = makeLocalDate(
          startBeforeAnchor.getUTCFullYear(),
          startBeforeAnchor.getUTCMonth() + 1,
          startBeforeAnchor.getUTCDate()
        )
        const endDate = makeLocalDate(
          endBeforeAnchor.getUTCFullYear(),
          endBeforeAnchor.getUTCMonth() + 1,
          endBeforeAnchor.getUTCDate()
        )

        const expansion = expandPattern(pattern, startDate, endDate)

        // All expanded dates should still respect the N-day spacing from anchor
        // (the pattern works in both directions from anchor)
        for (let i = 1; i < expansion.length; i++) {
          const prev = parseLocalDate(expansion[i - 1])
          const curr = parseLocalDate(expansion[i])
          const prevD = new Date(Date.UTC(prev.year, prev.month - 1, prev.day))
          const currD = new Date(Date.UTC(curr.year, curr.month - 1, curr.day))
          const diff = (currD.getTime() - prevD.getTime()) / (1000 * 60 * 60 * 24)
          expect(diff).toBe(pattern.n)
        }
      })
    )
  })
})
