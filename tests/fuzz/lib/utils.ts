/**
 * Shared utility functions for fuzz testing.
 */
import type { LocalDate, LocalTime, LocalDateTime, Duration, DayName } from './types'

// ============================================================================
// Branded Type Constructors
// ============================================================================

/**
 * Create a branded LocalDate from components.
 */
export function makeLocalDate(year: number, month: number, day: number): LocalDate {
  const y = String(year).padStart(4, '0')
  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${y}-${m}-${d}` as LocalDate
}

/**
 * Create a branded LocalTime from components.
 */
export function makeLocalTime(hours: number, minutes: number): LocalTime {
  const h = String(hours).padStart(2, '0')
  const m = String(minutes).padStart(2, '0')
  return `${h}:${m}` as LocalTime
}

/**
 * Create a branded LocalDateTime from date and time.
 */
export function makeLocalDateTime(date: LocalDate, time: LocalTime): LocalDateTime {
  return `${date}T${time}:00` as LocalDateTime
}

/**
 * Create a branded Duration (in minutes).
 */
export function makeDuration(minutes: number): Duration {
  return minutes as Duration
}

// ============================================================================
// Date/Time Parsing
// ============================================================================

/**
 * Parse a LocalDate string into components.
 */
export function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

/**
 * Parse a LocalTime string into components.
 */
export function parseLocalTime(time: LocalTime): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(':').map(Number)
  return { hours, minutes }
}

/**
 * Parse a LocalDateTime string into components.
 */
export function parseLocalDateTime(
  dt: LocalDateTime
): { year: number; month: number; day: number; hours: number; minutes: number } {
  const [datePart, timePart] = dt.split('T')
  const { year, month, day } = parseLocalDate(datePart as LocalDate)
  const timeOnly = timePart.slice(0, 5) // Remove seconds if present
  const { hours, minutes } = parseLocalTime(timeOnly as LocalTime)
  return { year, month, day, hours, minutes }
}

// ============================================================================
// Date Calculations
// ============================================================================

/**
 * Check if a year is a leap year.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Get the last day of a given month.
 */
export function lastDayOfMonth(year: number, month: number): number {
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return daysInMonth[month - 1]
}

/**
 * Check if a date is valid.
 */
export function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false
  if (day < 1 || day > lastDayOfMonth(year, month)) return false
  return true
}

/**
 * Check if a time is valid.
 */
export function isValidTime(hours: number, minutes: number): boolean {
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

/**
 * Get day of week (0 = Sunday, 6 = Saturday) for a date.
 */
export function getDayOfWeek(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date)
  const d = new Date(year, month - 1, day)
  if (isNaN(d.getTime())) throw new Error(`Invalid date in getDayOfWeek: ${year}-${month}-${day}`)
  return d.getDay()
}

/**
 * Convert day of week number to name.
 */
export function dayOfWeekToName(dow: number): DayName {
  const names: DayName[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return names[dow]
}

/**
 * Add days to a date.
 */
export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date)
  const d = new Date(year, month - 1, day)
  if (isNaN(d.getTime())) throw new Error(`Invalid date in addDays: ${year}-${month}-${day}`)
  d.setDate(d.getDate() + days)
  return makeLocalDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/**
 * Calculate days between two dates.
 */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const da = new Date(a)
  const db = new Date(b)
  const diffMs = db.getTime() - da.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Shuffle an array using Fisher-Yates algorithm.
 */
export function shuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Get unique values from an array.
 */
export function unique<T>(array: T[]): T[] {
  return [...new Set(array)]
}

/**
 * Check if two arrays have the same elements (order-independent).
 */
export function sameElements<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((v, i) => v === sortedB[i])
}

/**
 * Partition an array by a predicate.
 */
export function partition<T>(array: T[], predicate: (item: T) => boolean): [T[], T[]] {
  const pass: T[] = []
  const fail: T[] = []
  for (const item of array) {
    if (predicate(item)) {
      pass.push(item)
    } else {
      fail.push(item)
    }
  }
  return [pass, fail]
}

// ============================================================================
// Comparison Utilities
// ============================================================================

/**
 * Deep equality check for plain objects and arrays.
 */
export function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEquals(v, b[i]))
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>
    const aKeys = Object.keys(aObj)
    const bKeys = Object.keys(bObj)
    if (aKeys.length !== bKeys.length) return false
    return aKeys.every((key) => deepEquals(aObj[key], bObj[key]))
  }
  return false
}

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Get the number of iterations for property tests.
 * Uses FUZZ_ITERATIONS env var, defaulting to 100.
 */
export function getFuzzIterations(): number {
  const raw = parseInt(process.env.FUZZ_ITERATIONS ?? '100', 10)
  return isNaN(raw) ? 100 : raw
}

/**
 * Check if running in CI environment.
 */
export function isCI(): boolean {
  return (process.env.CI ?? 'false') === 'true'
}
