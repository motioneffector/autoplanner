/**
 * Pattern Expansion
 *
 * Pure functions for expanding scheduling patterns into concrete dates.
 * 13 pattern types plus union/except composition.
 */

import {
  type LocalDate,
  type Weekday,
  dayOfWeek,
  daysBetween,
  addDays,
  dayOf,
  daysInMonth,
  yearOf,
  monthOf,
  makeDate,
} from './time-date'
/** Minimal shape accepted by toExpandablePattern — matches both adapter Pattern and EnrichedPattern. */
type PatternLike = {
  type: string
  n?: number
  day?: number
  month?: number
  weekday?: number | string
  daysOfWeek?: (number | string)[]
  dayOfWeek?: number | string
  dayOfMonth?: number
}

export type { LocalDate } from './time-date'

// ============================================================================
// Types
// ============================================================================

export type DateRange = {
  start: LocalDate
  end: LocalDate
}

export type Pattern =
  | { type: 'daily' }
  | { type: 'everyNDays'; n: number }
  | { type: 'weekly'; daysOfWeek?: string[] }
  | { type: 'everyNWeeks'; n: number; weekday?: Weekday }
  | { type: 'monthly'; day: number }
  | { type: 'lastDayOfMonth' }
  | { type: 'yearly'; month: number; day: number }
  | { type: 'weekdays'; days: Weekday[] }
  | { type: 'nthWeekdayOfMonth'; n: number; weekday: Weekday }
  | { type: 'lastWeekdayOfMonth'; weekday: Weekday }
  | { type: 'nthToLastWeekdayOfMonth'; n: number; weekday: Weekday }
  | { type: 'union'; patterns: Pattern[] }
  | { type: 'except'; base: Pattern; exceptions: Pattern[] }

interface ExpandOptions {
  count?: number
}

// ============================================================================
// Errors
// ============================================================================

export { InvalidPatternError, InvalidRangeError } from './errors'
import { InvalidPatternError, InvalidRangeError } from './errors'

// ============================================================================
// Pattern Constructors
// ============================================================================

export function daily(): Pattern {
  return { type: 'daily' }
}

export function everyNDays(n: number): Pattern {
  if (n < 1) throw new InvalidPatternError(`everyNDays requires n >= 1, got ${n}`)
  return { type: 'everyNDays', n }
}

export function weekly(): Pattern {
  return { type: 'weekly' }
}

export function everyNWeeks(n: number, weekday?: Weekday): Pattern {
  if (n < 1) throw new InvalidPatternError(`everyNWeeks requires n >= 1, got ${n}`)
  if (weekday !== undefined) {
    return { type: 'everyNWeeks', n, weekday }
  }
  return { type: 'everyNWeeks', n }
}

export function monthly(day: number): Pattern {
  if (day < 1 || day > 31) throw new InvalidPatternError(`monthly requires day 1-31, got ${day}`)
  return { type: 'monthly', day }
}

export function lastDayOfMonth(): Pattern {
  return { type: 'lastDayOfMonth' }
}

export function yearly(month: number, day: number): Pattern {
  if (month < 1 || month > 12) throw new InvalidPatternError(`yearly requires month 1-12, got ${month}`)
  if (day < 1 || day > 31) throw new InvalidPatternError(`yearly requires day 1-31, got ${day}`)
  return { type: 'yearly', month, day }
}

export function weekdays(days: Weekday[]): Pattern {
  if (days.length === 0) throw new InvalidPatternError('weekdays requires at least one day')
  return { type: 'weekdays', days: [...days] }
}

export function weekdaysOnly(): Pattern {
  return weekdays(['mon', 'tue', 'wed', 'thu', 'fri'])
}

export function weekendsOnly(): Pattern {
  return weekdays(['sat', 'sun'])
}

export function nthWeekdayOfMonth(n: number, weekday: Weekday): Pattern {
  return { type: 'nthWeekdayOfMonth', n, weekday }
}

export function lastWeekdayOfMonth(weekday: Weekday): Pattern {
  return { type: 'lastWeekdayOfMonth', weekday }
}

export function nthToLastWeekdayOfMonth(n: number, weekday: Weekday): Pattern {
  return { type: 'nthToLastWeekdayOfMonth', n, weekday }
}

export function unionPatterns(patterns: Pattern[]): Pattern {
  return { type: 'union', patterns }
}

export function exceptPatterns(base: Pattern, exceptions: Pattern[]): Pattern {
  return { type: 'except', base, exceptions }
}

// ============================================================================
// Core Expansion
// ============================================================================

export function expandPattern(
  pattern: Pattern,
  range: DateRange,
  seriesStart: LocalDate,
  options?: ExpandOptions
): Set<LocalDate> {
  if (range.start > range.end) {
    throw new InvalidRangeError('Range start must be <= end')
  }

  const result = expandInner(pattern, range, seriesStart)

  if (options?.count !== undefined && result.size > options.count) {
    const arr = [...result]
    return new Set(arr.slice(0, options.count))
  }

  return result
}

function expandInner(pattern: Pattern, range: DateRange, seriesStart: LocalDate): Set<LocalDate> {
  switch (pattern.type) {
    case 'daily':
      return expandDaily(range, seriesStart)
    case 'everyNDays':
      return expandEveryNDays(pattern.n, range, seriesStart)
    case 'weekly': {
      if (pattern.daysOfWeek && Array.isArray(pattern.daysOfWeek)) {
        const dayMap: Record<string, Weekday> = {
          monday: 'mon', tuesday: 'tue', wednesday: 'wed',
          thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun',
          mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu',
          fri: 'fri', sat: 'sat', sun: 'sun',
        }
        const days = pattern.daysOfWeek.map((d: string) => dayMap[d.toLowerCase()] || d) as Weekday[]
        return expandWeekdays(days, range, seriesStart)
      }
      return expandEveryNWeeksCore(1, dayOfWeek(seriesStart), range, seriesStart)
    }
    case 'everyNWeeks':
      return expandEveryNWeeksCore(pattern.n, pattern.weekday ?? dayOfWeek(seriesStart), range, seriesStart)
    case 'monthly':
      return expandMonthly(pattern.day, range, seriesStart)
    case 'lastDayOfMonth':
      return expandLastDayOfMonth(range, seriesStart)
    case 'yearly':
      return expandYearly(pattern.month, pattern.day, range, seriesStart)
    case 'weekdays':
      return expandWeekdays(pattern.days, range, seriesStart)
    case 'nthWeekdayOfMonth':
      return expandNthWeekdayOfMonth(pattern.n, pattern.weekday, range, seriesStart)
    case 'lastWeekdayOfMonth':
      return expandLastWeekdayOfMonth(pattern.weekday, range, seriesStart)
    case 'nthToLastWeekdayOfMonth':
      return expandNthToLastWeekdayOfMonth(pattern.n, pattern.weekday, range, seriesStart)
    case 'union':
      return expandUnion(pattern.patterns, range, seriesStart)
    case 'except':
      return expandExcept(pattern.base, pattern.exceptions, range, seriesStart)
  }
}

// ============================================================================
// Per-Pattern Expansion
// ============================================================================

function expandDaily(range: DateRange, seriesStart: LocalDate): Set<LocalDate> {
  const result = new Set<LocalDate>()
  const start = seriesStart > range.start ? seriesStart : range.start
  if (start >= range.end) return result

  let d = start
  while (d < range.end) {
    result.add(d)
    d = addDays(d, 1)
  }
  return result
}

function expandEveryNDays(n: number, range: DateRange, seriesStart: LocalDate): Set<LocalDate> {
  const result = new Set<LocalDate>()
  const start = seriesStart > range.start ? seriesStart : range.start
  if (start >= range.end) return result

  // Find first date >= start where daysBetween(seriesStart, d) % n === 0
  const gap = daysBetween(seriesStart, start)
  const rem = ((gap % n) + n) % n
  const offset = rem === 0 ? 0 : n - rem
  let d = addDays(start, offset)

  while (d < range.end) {
    result.add(d)
    d = addDays(d, n)
  }
  return result
}

function expandEveryNWeeksCore(
  n: number,
  weekday: Weekday,
  range: DateRange,
  seriesStart: LocalDate
): Set<LocalDate> {
  const result = new Set<LocalDate>()

  // Find anchor: first occurrence of weekday on/after seriesStart
  let anchor = seriesStart
  while (dayOfWeek(anchor) !== weekday) {
    anchor = addDays(anchor, 1)
  }

  const start = seriesStart > range.start ? seriesStart : range.start
  if (start >= range.end) return result

  const period = 7 * n

  if (anchor >= start) {
    let d = anchor
    while (d < range.end) {
      if (d >= start) result.add(d)
      d = addDays(d, period)
    }
  } else {
    const gap = daysBetween(anchor, start)
    const skip = Math.ceil(gap / period)
    let d = addDays(anchor, skip * period)
    if (d < start) d = addDays(d, period)
    while (d < range.end) {
      result.add(d)
      d = addDays(d, period)
    }
  }

  return result
}

function expandMonthly(day: number, range: DateRange, seriesStart: LocalDate): Set<LocalDate> {
  const result = new Set<LocalDate>()

  let y = yearOf(range.start)
  let m = monthOf(range.start)

  while (true) {
    if (day <= daysInMonth(y, m)) {
      const d = makeDate(y, m, day)
      if (d >= seriesStart && d >= range.start && d < range.end) {
        result.add(d)
      }
    }
    m++
    if (m > 12) { m = 1; y++ }
    if (makeDate(y, m, 1) >= range.end) break
  }

  return result
}

function expandLastDayOfMonth(range: DateRange, seriesStart: LocalDate): Set<LocalDate> {
  const result = new Set<LocalDate>()

  let y = yearOf(range.start)
  let m = monthOf(range.start)

  while (true) {
    const dim = daysInMonth(y, m)
    const d = makeDate(y, m, dim)
    if (d >= seriesStart && d >= range.start && d < range.end) {
      result.add(d)
    }
    m++
    if (m > 12) { m = 1; y++ }
    if (makeDate(y, m, 1) >= range.end) break
  }

  return result
}

function expandYearly(month: number, day: number, range: DateRange, seriesStart: LocalDate): Set<LocalDate> {
  const result = new Set<LocalDate>()

  for (let y = yearOf(range.start); y <= yearOf(range.end); y++) {
    if (day > daysInMonth(y, month)) continue
    const d = makeDate(y, month, day)
    if (d >= seriesStart && d >= range.start && d < range.end) {
      result.add(d)
    }
  }

  return result
}

function expandWeekdays(days: Weekday[], range: DateRange, seriesStart: LocalDate): Set<LocalDate> {
  const result = new Set<LocalDate>()
  const daySet = new Set(days)
  const start = seriesStart > range.start ? seriesStart : range.start
  if (start >= range.end) return result

  let d = start
  while (d < range.end) {
    if (daySet.has(dayOfWeek(d))) {
      result.add(d)
    }
    d = addDays(d, 1)
  }
  return result
}

function findNthWeekdayInMonth(n: number, weekday: Weekday, year: number, month: number): LocalDate | null {
  let d = makeDate(year, month, 1)
  while (dayOfWeek(d) !== weekday) {
    d = addDays(d, 1)
  }
  // d is the 1st occurrence; advance to nth
  d = addDays(d, (n - 1) * 7)
  if (monthOf(d) !== month) return null
  return d
}

function expandNthWeekdayOfMonth(
  n: number,
  weekday: Weekday,
  range: DateRange,
  seriesStart: LocalDate
): Set<LocalDate> {
  const result = new Set<LocalDate>()

  let y = yearOf(range.start)
  let m = monthOf(range.start)

  while (true) {
    const d = findNthWeekdayInMonth(n, weekday, y, m)
    if (d !== null && d >= seriesStart && d >= range.start && d < range.end) {
      result.add(d)
    }
    m++
    if (m > 12) { m = 1; y++ }
    if (makeDate(y, m, 1) >= range.end) break
  }

  return result
}

function findLastWeekdayInMonth(weekday: Weekday, year: number, month: number): LocalDate {
  const dim = daysInMonth(year, month)
  let d = makeDate(year, month, dim)
  while (dayOfWeek(d) !== weekday) {
    d = addDays(d, -1)
  }
  return d
}

function expandLastWeekdayOfMonth(weekday: Weekday, range: DateRange, seriesStart: LocalDate): Set<LocalDate> {
  const result = new Set<LocalDate>()

  let y = yearOf(range.start)
  let m = monthOf(range.start)

  while (true) {
    const d = findLastWeekdayInMonth(weekday, y, m)
    if (d >= seriesStart && d >= range.start && d < range.end) {
      result.add(d)
    }
    m++
    if (m > 12) { m = 1; y++ }
    if (makeDate(y, m, 1) >= range.end) break
  }

  return result
}

function expandNthToLastWeekdayOfMonth(
  n: number,
  weekday: Weekday,
  range: DateRange,
  seriesStart: LocalDate
): Set<LocalDate> {
  const result = new Set<LocalDate>()

  let y = yearOf(range.start)
  let m = monthOf(range.start)

  while (true) {
    const last = findLastWeekdayInMonth(weekday, y, m)
    const d = addDays(last, -(n - 1) * 7)
    if (monthOf(d) === m && d >= seriesStart && d >= range.start && d < range.end) {
      result.add(d)
    }
    m++
    if (m > 12) { m = 1; y++ }
    if (makeDate(y, m, 1) >= range.end) break
  }

  return result
}

// ============================================================================
// Composition
// ============================================================================

function expandUnion(patterns: Pattern[], range: DateRange, seriesStart: LocalDate): Set<LocalDate> {
  const all = new Set<LocalDate>()
  for (const p of patterns) {
    for (const d of expandInner(p, range, seriesStart)) {
      all.add(d)
    }
  }
  return new Set([...all].sort() as LocalDate[])
}

function expandExcept(base: Pattern, exceptions: Pattern[], range: DateRange, seriesStart: LocalDate): Set<LocalDate> {
  const baseDates = expandInner(base, range, seriesStart)
  const excluded = new Set<LocalDate>()
  for (const p of exceptions) {
    for (const d of expandInner(p, range, seriesStart)) {
      excluded.add(d)
    }
  }

  const result = new Set<LocalDate>()
  for (const d of baseDates) {
    if (!excluded.has(d)) {
      result.add(d)
    }
  }
  return result
}

// ============================================================================
// Adapter → Expansion Pattern Converter
// ============================================================================

const WEEKDAY_NAMES: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function numToWeekday(n: number): Weekday {
  return WEEKDAY_NAMES[((n % 7) + 7) % 7]!
}

const DAY_NAME_MAP: Record<string, Weekday> = {
  monday: 'mon', tuesday: 'tue', wednesday: 'wed',
  thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun',
  mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu',
  fri: 'fri', sat: 'sat', sun: 'sun',
}

function dayNameToWeekday(name: string): Weekday {
  return DAY_NAME_MAP[name.toLowerCase()] ?? (name as Weekday)
}

/**
 * Convert an adapter Pattern (flat, string-typed) to an expansion Pattern
 * (strict discriminated union). Bridges the two Pattern types without
 * requiring `as unknown as Pattern` casts at call sites.
 */
export function toExpandablePattern(p: PatternLike, seriesStart: LocalDate): Pattern {
  switch (p.type) {
    case 'daily':
      return { type: 'daily' }
    case 'everyNDays':
      return { type: 'everyNDays', n: (p.n as number) || 2 }
    case 'weekly':
      if (p['daysOfWeek'] && Array.isArray(p['daysOfWeek'])) {
        const days = (p['daysOfWeek'] as (number | string)[]).map(
          (d: number | string) => typeof d === 'number' ? numToWeekday(d) : dayNameToWeekday(d)
        )
        return { type: 'weekdays', days }
      }
      if (p['dayOfWeek'] !== undefined) {
        const dw = p['dayOfWeek']
        return { type: 'weekdays', days: [typeof dw === 'number' ? numToWeekday(dw) : dayNameToWeekday(dw as string)] }
      }
      return { type: 'weekly' }
    case 'everyNWeeks': {
      const weekday = typeof p.weekday === 'number' ? numToWeekday(p.weekday) : p.weekday as Weekday | undefined
      if (weekday !== undefined) {
        return { type: 'everyNWeeks', n: (p.n as number) || 2, weekday }
      }
      return { type: 'everyNWeeks', n: (p.n as number) || 2 }
    }
    case 'weekdays': {
      const days = ((p['daysOfWeek'] as (number | string)[] | undefined) || []).map(
        (d: number | string) => typeof d === 'number' ? numToWeekday(d) : d as Weekday
      )
      return { type: 'weekdays', days }
    }
    case 'nthWeekdayOfMonth': {
      const weekday = typeof p.weekday === 'number' ? numToWeekday(p.weekday) : p.weekday as Weekday
      return { type: 'nthWeekdayOfMonth', n: p.n as number, weekday }
    }
    case 'lastWeekdayOfMonth': {
      const weekday = typeof p.weekday === 'number' ? numToWeekday(p.weekday) : p.weekday as Weekday
      return { type: 'lastWeekdayOfMonth', weekday }
    }
    case 'nthToLastWeekdayOfMonth': {
      const weekday = typeof p.weekday === 'number' ? numToWeekday(p.weekday) : p.weekday as Weekday
      return { type: 'nthToLastWeekdayOfMonth', n: p.n as number, weekday }
    }
    case 'lastDayOfMonth':
      return { type: 'lastDayOfMonth' }
    case 'monthly':
      return { type: 'monthly', day: (p.day as number) || (p['dayOfMonth'] as number) || dayOf(seriesStart) }
    case 'yearly':
      return { type: 'yearly', month: (p.month as number) || monthOf(seriesStart), day: (p.day as number) || (p['dayOfMonth'] as number) || dayOf(seriesStart) }
    default:
      return p as unknown as Pattern
  }
}
