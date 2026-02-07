/**
 * Pattern generators for fuzz testing.
 *
 * Implements generators for all 13 pattern types as defined in Spec 4.
 */
import * as fc from 'fast-check'
import type { Arbitrary } from 'fast-check'
import type {
  Pattern,
  DailyPattern,
  EveryNDaysPattern,
  WeeklyPattern,
  EveryNWeeksPattern,
  MonthlyPattern,
  NthWeekdayOfMonthPattern,
  LastDayOfMonthPattern,
  YearlyPattern,
  WeekdaysPattern,
  OneOffPattern,
  CustomPattern,
  ActiveOnDatesPattern,
  InactiveOnDatesPattern,
  DayName,
  LocalDate,
} from '../lib/types'
import { localDateGen, dayNamesSubsetGen, boundaryDateGen, arrayGen } from './base'

// ============================================================================
// Individual Pattern Generators
// ============================================================================

/**
 * Generate a daily pattern.
 * Daily patterns match every day.
 */
export function dailyPatternGen(): Arbitrary<DailyPattern> {
  return fc.constant<DailyPattern>({ type: 'daily' })
}

/**
 * Generate an everyNDays pattern.
 * Matches every N days starting from an anchor date.
 *
 * @param options.minN - Minimum N value (default: 2)
 * @param options.maxN - Maximum N value (default: 365)
 */
export function everyNDaysPatternGen(options?: {
  minN?: number
  maxN?: number
  anchorGen?: Arbitrary<LocalDate>
}): Arbitrary<EveryNDaysPattern> {
  const minN = options?.minN ?? 2
  const maxN = options?.maxN ?? 365
  const anchorGen = options?.anchorGen ?? localDateGen()

  return fc.tuple(fc.integer({ min: minN, max: maxN }), anchorGen).map(([n, anchor]) => ({
    type: 'everyNDays' as const,
    n,
    anchor,
  }))
}

/**
 * Generate a weekly pattern.
 * Matches on specific days of the week.
 */
export function weeklyPatternGen(): Arbitrary<WeeklyPattern> {
  return dayNamesSubsetGen().map((days) => ({
    type: 'weekly' as const,
    days,
  }))
}

/**
 * Generate an everyNWeeks pattern.
 * Matches on specific days every N weeks starting from anchor.
 *
 * @param options.minN - Minimum N value (default: 2)
 * @param options.maxN - Maximum N value (default: 52)
 */
export function everyNWeeksPatternGen(options?: {
  minN?: number
  maxN?: number
  anchorGen?: Arbitrary<LocalDate>
}): Arbitrary<EveryNWeeksPattern> {
  const minN = options?.minN ?? 2
  const maxN = options?.maxN ?? 52
  const anchorGen = options?.anchorGen ?? localDateGen()

  return fc.tuple(fc.integer({ min: minN, max: maxN }), dayNamesSubsetGen(), anchorGen).map(([n, days, anchor]) => ({
    type: 'everyNWeeks' as const,
    n,
    days,
    anchor,
  }))
}

/**
 * Generate a monthly pattern.
 * Matches on a specific day of each month (clamped to actual month end).
 */
export function monthlyPatternGen(): Arbitrary<MonthlyPattern> {
  return fc.integer({ min: 1, max: 31 }).map((day) => ({
    type: 'monthly' as const,
    day,
  }))
}

/**
 * Generate an nthWeekdayOfMonth pattern.
 * Matches on the nth occurrence of a weekday in each month.
 * n=5 means "fifth", which is skipped if the month doesn't have a 5th occurrence.
 */
export function nthWeekdayOfMonthPatternGen(): Arbitrary<NthWeekdayOfMonthPattern> {
  return fc
    .tuple(
      fc.constantFrom<1 | 2 | 3 | 4 | 5>(1, 2, 3, 4, 5),
      fc.constantFrom<DayName>('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat')
    )
    .map(([n, weekday]) => ({
      type: 'nthWeekdayOfMonth' as const,
      n,
      weekday,
    }))
}

/**
 * Generate a lastDayOfMonth pattern.
 * Matches on the last day of each month.
 */
export function lastDayOfMonthPatternGen(): Arbitrary<LastDayOfMonthPattern> {
  return fc.constant<LastDayOfMonthPattern>({ type: 'lastDayOfMonth' })
}

/**
 * Generate a yearly pattern.
 * Matches on a specific month and day each year (day clamped to actual month end).
 */
export function yearlyPatternGen(): Arbitrary<YearlyPattern> {
  return fc.tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 })).map(([month, day]) => ({
    type: 'yearly' as const,
    month,
    day,
  }))
}

/**
 * Generate a weekdays pattern.
 * Matches on Monday through Friday only.
 */
export function weekdaysPatternGen(): Arbitrary<WeekdaysPattern> {
  return fc.constant<WeekdaysPattern>({ type: 'weekdays' })
}

/**
 * Generate a oneOff pattern.
 * Matches on exactly one specific date.
 */
export function oneOffPatternGen(dateGen: Arbitrary<LocalDate> = localDateGen()): Arbitrary<OneOffPattern> {
  return dateGen.map((date) => ({
    type: 'oneOff' as const,
    date,
  }))
}

/**
 * Generate a custom pattern.
 * Matches on a specific set of dates.
 *
 * @param options.minDates - Minimum number of dates (default: 1)
 * @param options.maxDates - Maximum number of dates (default: 20)
 */
export function customPatternGen(options?: {
  minDates?: number
  maxDates?: number
  dateGen?: Arbitrary<LocalDate>
}): Arbitrary<CustomPattern> {
  const minDates = options?.minDates ?? 1
  const maxDates = options?.maxDates ?? 20
  const dateGen = options?.dateGen ?? localDateGen()

  return arrayGen(dateGen, { minLength: minDates, maxLength: maxDates })
    .map((dates) => {
      // Remove duplicates and sort
      const uniqueDates = [...new Set(dates)].sort()
      return uniqueDates
    })
    .filter((dates) => dates.length >= minDates)
    .map((dates) => ({
      type: 'custom' as const,
      dates: dates as LocalDate[],
    }))
}

/**
 * Generate an activeOnDates pattern.
 * A wrapper pattern that restricts a base pattern to only specific dates.
 *
 * @param baseGen - Generator for the base pattern (defaults to simple patterns only to avoid deep nesting)
 */
export function activeOnDatesPatternGen(
  baseGen: Arbitrary<Pattern> = simplePatternGen(),
  datesGen: Arbitrary<LocalDate[]> = arrayGen(localDateGen(), { minLength: 1, maxLength: 10 })
): Arbitrary<ActiveOnDatesPattern> {
  return fc.tuple(baseGen, datesGen).map(([base, dates]) => ({
    type: 'activeOnDates' as const,
    base,
    dates: [...new Set(dates)].sort() as LocalDate[],
  }))
}

/**
 * Generate an inactiveOnDates pattern.
 * A wrapper pattern that excludes specific dates from a base pattern.
 *
 * @param baseGen - Generator for the base pattern (defaults to simple patterns only to avoid deep nesting)
 */
export function inactiveOnDatesPatternGen(
  baseGen: Arbitrary<Pattern> = simplePatternGen(),
  datesGen: Arbitrary<LocalDate[]> = arrayGen(localDateGen(), { minLength: 1, maxLength: 10 })
): Arbitrary<InactiveOnDatesPattern> {
  return fc.tuple(baseGen, datesGen).map(([base, dates]) => ({
    type: 'inactiveOnDates' as const,
    base,
    dates: [...new Set(dates)].sort() as LocalDate[],
  }))
}

// ============================================================================
// Composite Pattern Generators
// ============================================================================

/**
 * Generate a pattern suitable for use in series entries.
 * Only produces the 4 core types that series patterns use: daily, weekly, monthly, custom.
 */
export function seriesPatternGen(): Arbitrary<Pattern> {
  return fc.oneof(
    dailyPatternGen(),
    weeklyPatternGen(),
    monthlyPatternGen(),
    customPatternGen()
  )
}

/**
 * Generate any simple pattern (non-recursive patterns).
 * Excludes activeOnDates and inactiveOnDates to avoid infinite recursion.
 */
export function simplePatternGen(): Arbitrary<Pattern> {
  return fc.oneof(
    dailyPatternGen(),
    everyNDaysPatternGen(),
    weeklyPatternGen(),
    everyNWeeksPatternGen(),
    monthlyPatternGen(),
    nthWeekdayOfMonthPatternGen(),
    lastDayOfMonthPatternGen(),
    yearlyPatternGen(),
    weekdaysPatternGen(),
    oneOffPatternGen(),
    customPatternGen()
  )
}

/**
 * Generate any pattern including wrapper patterns (activeOnDates, inactiveOnDates).
 * Uses simplePatternGen for base patterns to avoid deep nesting.
 */
export function patternGen(): Arbitrary<Pattern> {
  return fc.oneof(
    { weight: 10, arbitrary: simplePatternGen() },
    { weight: 1, arbitrary: activeOnDatesPatternGen() },
    { weight: 1, arbitrary: inactiveOnDatesPatternGen() }
  )
}

// ============================================================================
// Boundary Pattern Generators
// ============================================================================

/**
 * Generate patterns with boundary values for edge case testing.
 */
export function boundaryPatternGen(): Arbitrary<Pattern> {
  return fc.oneof(
    // Daily - no boundary cases, just the pattern
    dailyPatternGen(),

    // EveryNDays - boundary N values
    everyNDaysPatternGen({ minN: 2, maxN: 2 }), // minimum N
    everyNDaysPatternGen({ minN: 365, maxN: 365 }), // maximum N
    everyNDaysPatternGen({ anchorGen: boundaryDateGen() }), // boundary anchor dates

    // EveryNWeeks - boundary N values
    everyNWeeksPatternGen({ minN: 2, maxN: 2 }), // minimum N
    everyNWeeksPatternGen({ minN: 52, maxN: 52 }), // maximum N
    everyNWeeksPatternGen({ anchorGen: boundaryDateGen() }), // boundary anchor dates

    // Monthly - boundary days
    fc.constant<MonthlyPattern>({ type: 'monthly', day: 1 }), // first day
    fc.constant<MonthlyPattern>({ type: 'monthly', day: 28 }), // always valid
    fc.constant<MonthlyPattern>({ type: 'monthly', day: 29 }), // leap year edge
    fc.constant<MonthlyPattern>({ type: 'monthly', day: 30 }), // 30-day month edge
    fc.constant<MonthlyPattern>({ type: 'monthly', day: 31 }), // 31-day month edge

    // NthWeekdayOfMonth - boundary n values
    fc.constantFrom<DayName>('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat').map((weekday) => ({
      type: 'nthWeekdayOfMonth' as const,
      n: 1 as const,
      weekday,
    })), // first occurrence
    fc.constantFrom<DayName>('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat').map((weekday) => ({
      type: 'nthWeekdayOfMonth' as const,
      n: 5 as const,
      weekday,
    })), // fifth occurrence (may not exist)

    // LastDayOfMonth - no boundary cases, just the pattern
    lastDayOfMonthPatternGen(),

    // Yearly - boundary month/day combinations
    fc.constant<YearlyPattern>({ type: 'yearly', month: 1, day: 1 }), // Jan 1
    fc.constant<YearlyPattern>({ type: 'yearly', month: 2, day: 28 }), // Feb 28
    fc.constant<YearlyPattern>({ type: 'yearly', month: 2, day: 29 }), // Feb 29 (leap year)
    fc.constant<YearlyPattern>({ type: 'yearly', month: 12, day: 31 }), // Dec 31

    // Weekdays - no boundary cases, just the pattern
    weekdaysPatternGen(),

    // OneOff - boundary dates
    oneOffPatternGen(boundaryDateGen()),

    // Custom - boundary date sets
    customPatternGen({ minDates: 1, maxDates: 1, dateGen: boundaryDateGen() }), // single date
    customPatternGen({ minDates: 20, maxDates: 20, dateGen: boundaryDateGen() }), // many dates

    // ActiveOnDates - with boundary dates
    activeOnDatesPatternGen(simplePatternGen(), arrayGen(boundaryDateGen(), { minLength: 1, maxLength: 5 })),

    // InactiveOnDates - with boundary dates
    inactiveOnDatesPatternGen(simplePatternGen(), arrayGen(boundaryDateGen(), { minLength: 1, maxLength: 5 }))
  )
}

/**
 * Generate patterns weighted by frequency of real-world usage.
 * More common patterns are generated more frequently.
 */
export function realisticPatternGen(): Arbitrary<Pattern> {
  return fc.oneof(
    { weight: 30, arbitrary: dailyPatternGen() }, // Very common
    { weight: 25, arbitrary: weeklyPatternGen() }, // Very common
    { weight: 15, arbitrary: weekdaysPatternGen() }, // Common for work
    { weight: 10, arbitrary: monthlyPatternGen() }, // Monthly bills, etc.
    { weight: 5, arbitrary: everyNDaysPatternGen() }, // Less common
    { weight: 5, arbitrary: everyNWeeksPatternGen() }, // Less common
    { weight: 3, arbitrary: yearlyPatternGen() }, // Anniversaries, etc.
    { weight: 3, arbitrary: oneOffPatternGen() }, // One-time events
    { weight: 2, arbitrary: nthWeekdayOfMonthPatternGen() }, // "Second Tuesday", etc.
    { weight: 1, arbitrary: lastDayOfMonthPatternGen() }, // End of month
    { weight: 1, arbitrary: customPatternGen() } // Rare
  )
}
