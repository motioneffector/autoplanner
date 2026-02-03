/**
 * Base generator type definitions and utilities.
 *
 * Provides type-safe wrappers around fast-check's Arbitrary for domain types.
 */
import * as fc from 'fast-check'
import type { Arbitrary } from 'fast-check'
import type {
  LocalDate,
  LocalTime,
  LocalDateTime,
  Duration,
  SeriesId,
  CompletionId,
  ConditionId,
  ConstraintId,
  PatternId,
  DayName,
} from '../lib/types'
import { makeLocalDate, makeLocalTime, makeLocalDateTime, makeDuration, isLeapYear, lastDayOfMonth } from '../lib/utils'

// ============================================================================
// Type-Safe Generator Aliases
// ============================================================================

/**
 * Generator for LocalDate values.
 */
export type GenLocalDate = Arbitrary<LocalDate>

/**
 * Generator for LocalTime values.
 */
export type GenLocalTime = Arbitrary<LocalTime>

/**
 * Generator for LocalDateTime values.
 */
export type GenLocalDateTime = Arbitrary<LocalDateTime>

/**
 * Generator for Duration values.
 */
export type GenDuration = Arbitrary<Duration>

/**
 * Generator for SeriesId values.
 */
export type GenSeriesId = Arbitrary<SeriesId>

/**
 * Generator for CompletionId values.
 */
export type GenCompletionId = Arbitrary<CompletionId>

/**
 * Generator for ConditionId values.
 */
export type GenConditionId = Arbitrary<ConditionId>

/**
 * Generator for ConstraintId values.
 */
export type GenConstraintId = Arbitrary<ConstraintId>

/**
 * Generator for PatternId values.
 */
export type GenPatternId = Arbitrary<PatternId>

// ============================================================================
// Primitive Generator Builders
// ============================================================================

/**
 * Create a LocalDate generator with configurable range.
 */
export function localDateGen(options?: {
  min?: { year: number; month: number; day: number }
  max?: { year: number; month: number; day: number }
}): GenLocalDate {
  const minYear = options?.min?.year ?? 1970
  const maxYear = options?.max?.year ?? 2100
  const minMonth = options?.min?.month ?? 1
  const maxMonth = options?.max?.month ?? 12
  const minDay = options?.min?.day ?? 1
  const maxDay = options?.max?.day ?? 31

  return fc
    .tuple(fc.integer({ min: minYear, max: maxYear }), fc.integer({ min: minMonth, max: maxMonth }), fc.integer({ min: minDay, max: maxDay }))
    .map(([year, month, day]) => {
      // Clamp day to valid range for the month
      const maxValidDay = lastDayOfMonth(year, month)
      const clampedDay = Math.min(day, maxValidDay)
      return makeLocalDate(year, month, clampedDay)
    })
}

/**
 * Create a LocalTime generator with configurable range.
 */
export function localTimeGen(options?: {
  minHour?: number
  maxHour?: number
  minMinute?: number
  maxMinute?: number
  alignTo5Minutes?: boolean
}): GenLocalTime {
  const minHour = options?.minHour ?? 0
  const maxHour = options?.maxHour ?? 23
  const alignTo5 = options?.alignTo5Minutes ?? false

  if (alignTo5) {
    // Generate only times aligned to 5-minute boundaries (for reflow)
    return fc.tuple(fc.integer({ min: minHour, max: maxHour }), fc.integer({ min: 0, max: 11 })).map(([hours, slot]) => {
      const minutes = slot * 5
      return makeLocalTime(hours, minutes)
    })
  }

  return fc.tuple(fc.integer({ min: minHour, max: maxHour }), fc.integer({ min: options?.minMinute ?? 0, max: options?.maxMinute ?? 59 })).map(([hours, minutes]) => makeLocalTime(hours, minutes))
}

/**
 * Create a LocalTime generator aligned to 5-minute increments.
 * Per Spec 13 LAW 8: reflow domain discretized to 5-minute increments.
 * Valid minutes: 00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55
 */
export function localTimeFiveMinuteAlignedGen(options?: { minHour?: number; maxHour?: number }): GenLocalTime {
  return localTimeGen({ ...options, alignTo5Minutes: true })
}

/**
 * Create a LocalDateTime generator from date and time generators.
 */
export function localDateTimeGen(dateGen: GenLocalDate = localDateGen(), timeGen: GenLocalTime = localTimeGen()): GenLocalDateTime {
  return fc.tuple(dateGen, timeGen).map(([date, time]) => makeLocalDateTime(date, time))
}

/**
 * Generate boundary LocalDateTime values for testing edge cases.
 * Covers: DST transitions, midnight, end of day, year boundaries, etc.
 */
export function boundaryDateTimeGen(): GenLocalDateTime {
  return fc.oneof(
    // DST spring-forward gap times (don't exist in America/New_York)
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 3, 10), makeLocalTime(2, 0))),
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 3, 10), makeLocalTime(2, 30))),
    fc.constant(makeLocalDateTime(makeLocalDate(2025, 3, 9), makeLocalTime(2, 30))),
    // DST fall-back ambiguous times (exist twice)
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 11, 3), makeLocalTime(1, 0))),
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 11, 3), makeLocalTime(1, 30))),
    fc.constant(makeLocalDateTime(makeLocalDate(2025, 11, 2), makeLocalTime(1, 30))),
    // Midnight on various dates
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 1, 1), makeLocalTime(0, 0))),
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 6, 15), makeLocalTime(0, 0))),
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 12, 31), makeLocalTime(0, 0))),
    // End of day
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 1, 1), makeLocalTime(23, 59))),
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 6, 15), makeLocalTime(23, 59))),
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 12, 31), makeLocalTime(23, 59))),
    // Year boundaries
    fc.constant(makeLocalDateTime(makeLocalDate(2023, 12, 31), makeLocalTime(23, 59))),
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 1, 1), makeLocalTime(0, 0))),
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 12, 31), makeLocalTime(23, 59))),
    fc.constant(makeLocalDateTime(makeLocalDate(2025, 1, 1), makeLocalTime(0, 0))),
    // Leap day boundaries
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 2, 28), makeLocalTime(23, 59))),
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 2, 29), makeLocalTime(0, 0))),
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 2, 29), makeLocalTime(23, 59))),
    fc.constant(makeLocalDateTime(makeLocalDate(2024, 3, 1), makeLocalTime(0, 0))),
    // Combine random boundary dates with boundary times
    fc.tuple(boundaryDateGen(), boundaryTimeGen()).map(([date, time]) => makeLocalDateTime(date, time)),
    // Random dateTime (for coverage)
    localDateTimeGen()
  )
}

/**
 * Create a Duration generator with configurable range.
 */
export function durationGen(options?: { min?: number; max?: number }): GenDuration {
  const min = options?.min ?? 1
  const max = options?.max ?? 480 // 8 hours max default
  return fc.integer({ min, max }).map((n) => makeDuration(n))
}

/**
 * Generate boundary Duration values for testing edge cases.
 * Includes both valid and invalid (0) durations for comprehensive testing.
 */
export function boundaryDurationGen(): GenDuration {
  return fc.oneof(
    // Zero (often invalid, for negative testing)
    fc.constant(makeDuration(0)),
    // Minimum valid
    fc.constant(makeDuration(1)),
    // Reflow granularity (5 minutes per Spec 13 LAW 8)
    fc.constant(makeDuration(5)),
    // Common durations
    fc.constant(makeDuration(15)), // Quarter hour
    fc.constant(makeDuration(30)), // Half hour
    fc.constant(makeDuration(45)), // Three quarters
    fc.constant(makeDuration(60)), // 1 hour
    fc.constant(makeDuration(90)), // 1.5 hours
    fc.constant(makeDuration(120)), // 2 hours
    // Typical meeting/task durations
    fc.constant(makeDuration(25)), // Short meeting
    fc.constant(makeDuration(50)), // Class period
    // Full day
    fc.constant(makeDuration(1440)), // 24 hours
    // Random duration (for coverage)
    durationGen()
  )
}

// ============================================================================
// ID Generator Builders
// ============================================================================

/**
 * Create a SeriesId generator.
 */
export function seriesIdGen(): GenSeriesId {
  return fc.uuid().map((id) => `series-${id}` as SeriesId)
}

/**
 * Create a CompletionId generator.
 */
export function completionIdGen(): GenCompletionId {
  return fc.uuid().map((id) => `completion-${id}` as CompletionId)
}

/**
 * Create a ConditionId generator.
 */
export function conditionIdGen(): GenConditionId {
  return fc.uuid().map((id) => `condition-${id}` as ConditionId)
}

/**
 * Create a ConstraintId generator.
 */
export function constraintIdGen(): GenConstraintId {
  return fc.uuid().map((id) => `constraint-${id}` as ConstraintId)
}

/**
 * Create a PatternId generator.
 */
export function patternIdGen(): GenPatternId {
  return fc.uuid().map((id) => `pattern-${id}` as PatternId)
}

// ============================================================================
// Day Name Generator
// ============================================================================

/**
 * Generate a single day name.
 */
export function dayNameGen(): Arbitrary<DayName> {
  return fc.constantFrom<DayName>('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat')
}

/**
 * Generate a non-empty subset of day names.
 */
export function dayNamesSubsetGen(): Arbitrary<DayName[]> {
  const allDays: DayName[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return fc
    .shuffledSubarray(allDays, { minLength: 1, maxLength: 7 })
    .map((days) => days.sort((a, b) => allDays.indexOf(a) - allDays.indexOf(b)))
}

// ============================================================================
// Boundary Date Generators
// ============================================================================

/**
 * Generate boundary dates for testing edge cases.
 * Covers: epoch, timestamp overflow, max date, leap days, DST transitions,
 * month ends, and year boundaries.
 */
export function boundaryDateGen(): GenLocalDate {
  return fc.oneof(
    // Epoch
    fc.constant(makeLocalDate(1970, 1, 1)),
    // 32-bit timestamp overflow proximity
    fc.constant(makeLocalDate(2038, 1, 19)),
    // Max representable date (within our range)
    fc.constant(makeLocalDate(2100, 12, 31)),
    // Year boundaries
    fc.constant(makeLocalDate(2000, 1, 1)),
    fc.constant(makeLocalDate(2000, 12, 31)),
    fc.constant(makeLocalDate(2024, 1, 1)),
    fc.constant(makeLocalDate(2024, 12, 31)),
    // Leap year Feb 29 (various leap years)
    fc.constant(makeLocalDate(2000, 2, 29)),
    fc.constant(makeLocalDate(2004, 2, 29)),
    fc.constant(makeLocalDate(2020, 2, 29)),
    fc.constant(makeLocalDate(2024, 2, 29)),
    // Non-leap year Feb 28
    fc.constant(makeLocalDate(2001, 2, 28)),
    fc.constant(makeLocalDate(2023, 2, 28)),
    fc.constant(makeLocalDate(2100, 2, 28)), // 2100 is not a leap year (divisible by 100 but not 400)
    // Month-end dates (31-day months)
    fc.constant(makeLocalDate(2024, 1, 31)),
    fc.constant(makeLocalDate(2024, 3, 31)),
    fc.constant(makeLocalDate(2024, 5, 31)),
    fc.constant(makeLocalDate(2024, 7, 31)),
    fc.constant(makeLocalDate(2024, 8, 31)),
    fc.constant(makeLocalDate(2024, 10, 31)),
    fc.constant(makeLocalDate(2024, 12, 31)),
    // Month-end dates (30-day months)
    fc.constant(makeLocalDate(2024, 4, 30)),
    fc.constant(makeLocalDate(2024, 6, 30)),
    fc.constant(makeLocalDate(2024, 9, 30)),
    fc.constant(makeLocalDate(2024, 11, 30)),
    // DST transition dates (US)
    fc.constant(makeLocalDate(2024, 3, 10)), // Spring forward
    fc.constant(makeLocalDate(2024, 11, 3)), // Fall back
    fc.constant(makeLocalDate(2025, 3, 9)), // Spring forward 2025
    fc.constant(makeLocalDate(2025, 11, 2)), // Fall back 2025
    // Random date (for coverage)
    localDateGen()
  )
}

/**
 * Generate boundary times for testing edge cases.
 * Covers: midnight, end of day, noon, DST transition times, and boundaries.
 */
export function boundaryTimeGen(): GenLocalTime {
  return fc.oneof(
    // Midnight (start of day)
    fc.constant(makeLocalTime(0, 0)),
    // End of day
    fc.constant(makeLocalTime(23, 59)),
    // Noon (AM/PM boundary)
    fc.constant(makeLocalTime(12, 0)),
    // Noon boundaries
    fc.constant(makeLocalTime(11, 59)),
    fc.constant(makeLocalTime(12, 1)),
    // DST spring-forward gap (2:00-3:00 AM, these times don't exist)
    fc.constant(makeLocalTime(2, 0)),
    fc.constant(makeLocalTime(2, 30)),
    fc.constant(makeLocalTime(3, 0)),
    // DST fall-back ambiguous time (1:00-2:00 AM occurs twice)
    fc.constant(makeLocalTime(1, 0)),
    fc.constant(makeLocalTime(1, 30)),
    // Common meeting times
    fc.constant(makeLocalTime(9, 0)),
    fc.constant(makeLocalTime(14, 30)),
    // Hour boundaries
    fc.constant(makeLocalTime(0, 59)),
    fc.constant(makeLocalTime(23, 0)),
    // Random time (for coverage)
    localTimeGen()
  )
}

// ============================================================================
// Invalid Value Generators (for negative testing)
// ============================================================================

/**
 * Generate invalid date strings for negative testing.
 * These should all fail validation when parsed as LocalDate.
 */
export function invalidDateGen(): Arbitrary<string> {
  return fc.oneof(
    // Invalid day for month (30-day months)
    fc.constant('2024-04-31'), // April has 30 days
    fc.constant('2024-06-31'), // June has 30 days
    fc.constant('2024-09-31'), // September has 30 days
    fc.constant('2024-11-31'), // November has 30 days
    // Invalid day for February
    fc.constant('2024-02-30'), // Feb never has 30 days
    fc.constant('2024-02-31'), // Feb never has 31 days
    // Feb 29 in non-leap year
    fc.constant('2023-02-29'),
    fc.constant('2021-02-29'),
    fc.constant('2100-02-29'), // 2100 is NOT a leap year (divisible by 100 but not 400)
    // Invalid month (too high)
    fc.constant('2024-13-01'),
    fc.constant('2024-14-15'),
    // Invalid month (zero)
    fc.constant('2024-00-15'),
    // Invalid day (zero)
    fc.constant('2024-05-00'),
    // Invalid day (too high for any month)
    fc.constant('2024-05-32'),
    fc.constant('2024-12-32'),
    // Malformed strings (wrong format)
    fc.constant('not-a-date'),
    fc.constant('2024/03/15'), // Wrong separator
    fc.constant('03-15-2024'), // Wrong order (MM-DD-YYYY)
    fc.constant('15-03-2024'), // Wrong order (DD-MM-YYYY)
    fc.constant('2024-3-15'), // Missing leading zero in month
    fc.constant('2024-03-5'), // Missing leading zero in day
    // Empty and partial
    fc.constant(''),
    fc.constant('2024'),
    fc.constant('2024-03'),
    fc.constant('2024-03-'),
    fc.constant('-03-15'),
    // Invalid characters
    fc.constant('2024-0a-15'),
    fc.constant('20x4-03-15'),
    fc.constant('2024-03-15T'), // DateTime-like but incomplete
    // Random garbage strings
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.match(/^\d{4}-\d{2}-\d{2}$/))
  )
}

/**
 * Generate invalid time strings for negative testing.
 */
export function invalidTimeGen(): Arbitrary<string> {
  return fc.oneof(
    // Invalid hours
    fc.constant('24:00'),
    fc.constant('25:30'),
    fc.constant('-1:30'),
    // Invalid minutes
    fc.constant('12:60'),
    fc.constant('12:99'),
    fc.constant('12:-5'),
    // Missing leading zeros
    fc.constant('9:30'),
    fc.constant('12:5'),
    // Wrong format
    fc.constant('12.30'),
    fc.constant('1230'),
    fc.constant('12:30:00'), // With seconds (not our format)
    fc.constant('12:30 AM'), // 12-hour format
    // Empty and partial
    fc.constant(''),
    fc.constant('12'),
    fc.constant('12:'),
    fc.constant(':30'),
    // Invalid characters
    fc.constant('1a:30'),
    fc.constant('12:3b'),
    // Random garbage
    fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !s.match(/^\d{2}:\d{2}$/))
  )
}

// ============================================================================
// Generator Combinators
// ============================================================================

/**
 * Create a generator that produces one of several values with equal probability.
 */
export function oneOfGen<T>(...generators: Arbitrary<T>[]): Arbitrary<T> {
  return fc.oneof(...generators)
}

/**
 * Create a generator for optional values (T | undefined).
 */
export function optionalGen<T>(generator: Arbitrary<T>): Arbitrary<T | undefined> {
  return fc.option(generator, { nil: undefined })
}

/**
 * Create a generator for arrays with configurable length.
 */
export function arrayGen<T>(generator: Arbitrary<T>, options?: { minLength?: number; maxLength?: number }): Arbitrary<T[]> {
  return fc.array(generator, {
    minLength: options?.minLength ?? 0,
    maxLength: options?.maxLength ?? 10,
  })
}
