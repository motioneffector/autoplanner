/**
 * Time & Date Utilities
 *
 * Pure functions for date/time parsing, formatting, arithmetic, and timezone conversion.
 * Uses Julian Day Number for all date arithmetic to avoid month-length edge cases.
 * Zero external dependencies — uses Intl.DateTimeFormat for timezone support.
 */

import { Result, Ok, Err } from './result'

// ============================================================================
// Branded Types
// ============================================================================

declare const __localDate: unique symbol
declare const __localTime: unique symbol
declare const __localDateTime: unique symbol

/** ISO 8601 date string: YYYY-MM-DD */
export type LocalDate = string & { readonly [__localDate]: true }

/** ISO 8601 time string: HH:MM:SS */
export type LocalTime = string & { readonly [__localTime]: true }

/** ISO 8601 datetime string: YYYY-MM-DDThh:mm:ss */
export type LocalDateTime = string & { readonly [__localDateTime]: true }

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

// ============================================================================
// Errors
// ============================================================================

export { ParseError } from './errors'
import { ParseError } from './errors'

// ============================================================================
// Helpers
// ============================================================================

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  const days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month === 2 && isLeapYear(year)) return 29
  return days[month]!
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n
}

function pad4(n: number): string {
  if (n < 10) return '000' + n
  if (n < 100) return '00' + n
  if (n < 1000) return '0' + n
  return '' + n
}

// ============================================================================
// Julian Day Number (for date arithmetic)
// ============================================================================

function dateToJDN(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12)
  const y = year + 4800 - a
  const m = month + 12 * a - 3
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  )
}

function jdnToDate(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044
  const b = Math.floor((4 * a + 3) / 146097)
  const c = a - Math.floor(146097 * b / 4)
  const d = Math.floor((4 * c + 3) / 1461)
  const e = c - Math.floor(1461 * d / 4)
  const m = Math.floor((5 * e + 2) / 153)
  const day = e - Math.floor((153 * m + 2) / 5) + 1
  const month = m + 3 - 12 * Math.floor(m / 10)
  const year = 100 * b + d - 4800 + Math.floor(m / 10)
  return { year, month, day }
}

// ============================================================================
// Parsing
// ============================================================================

export function parseDate(str: string): Result<LocalDate, ParseError> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str)
  if (!match) return Err(new ParseError(`Invalid date format: '${str}'`))

  const year = parseInt(match[1]!, 10)
  const month = parseInt(match[2]!, 10)
  const day = parseInt(match[3]!, 10)

  if (month < 1 || month > 12)
    return Err(new ParseError(`Invalid month in date: '${str}'`))
  if (day < 1 || day > daysInMonth(year, month))
    return Err(new ParseError(`Invalid day in date: '${str}'`))

  return Ok(str as LocalDate)
}

export function parseTime(str: string): Result<LocalTime, ParseError> {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(str)
  if (!match) return Err(new ParseError(`Invalid time format: '${str}'`))

  const hour = parseInt(match[1]!, 10)
  const minute = parseInt(match[2]!, 10)
  const second = match[3] ? parseInt(match[3], 10) : 0

  if (hour > 23)
    return Err(new ParseError(`Invalid hour in time: '${str}'`))
  if (minute > 59)
    return Err(new ParseError(`Invalid minute in time: '${str}'`))
  if (second > 59)
    return Err(new ParseError(`Invalid second in time: '${str}'`))

  const normalized = `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`
  return Ok(normalized as LocalTime)
}

export function parseDateTime(str: string): Result<LocalDateTime, ParseError> {
  const tIdx = str.indexOf('T')
  if (tIdx === -1) return Err(new ParseError(`Invalid datetime format (missing T): '${str}'`))

  const datePart = str.substring(0, tIdx)
  const timePart = str.substring(tIdx + 1)

  const dateResult = parseDate(datePart)
  if (!dateResult.ok) return Err(new ParseError(`Invalid datetime: '${str}'`))

  const timeResult = parseTime(timePart)
  if (!timeResult.ok) return Err(new ParseError(`Invalid datetime: '${str}'`))

  return Ok(`${dateResult.value}T${timeResult.value}` as LocalDateTime)
}

// ============================================================================
// Construction
// ============================================================================

export function makeDate(year: number, month: number, day: number): LocalDate {
  return `${pad4(year)}-${pad2(month)}-${pad2(day)}` as LocalDate
}

export function makeTime(hour: number, minute: number, second?: number): LocalTime {
  return `${pad2(hour)}:${pad2(minute)}:${pad2(second ?? 0)}` as LocalTime
}

export function makeDateTime(date: LocalDate, time: LocalTime): LocalDateTime {
  return `${date}T${time}` as LocalDateTime
}

// ============================================================================
// Component Extraction
// ============================================================================

export function yearOf(date: LocalDate): number {
  return parseInt(date.substring(0, 4), 10)
}

export function monthOf(date: LocalDate): number {
  return parseInt(date.substring(5, 7), 10)
}

export function dayOf(date: LocalDate): number {
  return parseInt(date.substring(8, 10), 10)
}

export function hourOf(time: LocalTime): number {
  return parseInt(time.substring(0, 2), 10)
}

export function minuteOf(time: LocalTime): number {
  return parseInt(time.substring(3, 5), 10)
}

export function secondOf(time: LocalTime): number {
  return parseInt(time.substring(6, 8), 10)
}

export function dateOf(dt: LocalDateTime): LocalDate {
  return dt.substring(0, 10) as LocalDate
}

export function timeOf(dt: LocalDateTime): LocalTime {
  return dt.substring(11) as LocalTime
}

// ============================================================================
// Formatting
// ============================================================================

export function formatDate(date: LocalDate): string {
  const y = yearOf(date)
  const m = monthOf(date)
  const d = dayOf(date)
  return `${pad4(y)}-${pad2(m)}-${pad2(d)}`
}

export function formatTime(time: LocalTime): string {
  const h = hourOf(time)
  const m = minuteOf(time)
  const s = secondOf(time)
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

export function formatDateTime(dt: LocalDateTime): string {
  return `${formatDate(dateOf(dt))}T${formatTime(timeOf(dt))}`
}

// ============================================================================
// Date Arithmetic (via JDN)
// ============================================================================

export function addDays(date: LocalDate, n: number): LocalDate {
  const jdn = dateToJDN(yearOf(date), monthOf(date), dayOf(date))
  const { year, month, day } = jdnToDate(jdn + n)
  return makeDate(year, month, day)
}

export function daysBetween(a: LocalDate, b: LocalDate): number {
  const jdnA = dateToJDN(yearOf(a), monthOf(a), dayOf(a))
  const jdnB = dateToJDN(yearOf(b), monthOf(b), dayOf(b))
  return jdnB - jdnA
}

// ============================================================================
// DateTime Arithmetic
// ============================================================================

export function addMinutes(dt: LocalDateTime, n: number): LocalDateTime {
  const date = dateOf(dt)
  const time = timeOf(dt)

  let totalMinutes =
    hourOf(time) * 60 + minuteOf(time) + n
  const seconds = secondOf(time)

  // Handle day overflow/underflow (avoid JS % sign-preservation bug)
  let dayDelta = Math.floor(totalMinutes / 1440)
  totalMinutes = totalMinutes - dayDelta * 1440

  const newHour = Math.floor(totalMinutes / 60)
  const newMinute = totalMinutes % 60

  const newDate = dayDelta === 0 ? date : addDays(date, dayDelta)
  const newTime = makeTime(newHour, newMinute, seconds)
  return makeDateTime(newDate, newTime)
}

export function minutesBetween(a: LocalDateTime, b: LocalDateTime): number {
  const days = daysBetween(dateOf(a), dateOf(b))
  const timeA = timeOf(a)
  const timeB = timeOf(b)
  const minutesA = hourOf(timeA) * 60 + minuteOf(timeA)
  const minutesB = hourOf(timeB) * 60 + minuteOf(timeB)
  return days * 1440 + (minutesB - minutesA)
}

// ============================================================================
// Day-of-Week
// ============================================================================

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export function dayOfWeek(date: LocalDate): Weekday {
  const jdn = dateToJDN(yearOf(date), monthOf(date), dayOf(date))
  // JDN 0 = Monday (Julian day 0 is Mon Jan 1, 4713 BC)
  // 1970-01-01 JDN = 2440588 → 2440588 mod 7 = 3 → thu (index 3)
  const idx = ((jdn % 7) + 7) % 7
  return WEEKDAYS[idx]!
}

export function weekdayToIndex(w: Weekday): number {
  return WEEKDAYS.indexOf(w)
}

export function indexToWeekday(i: number): Weekday {
  return WEEKDAYS[i]!
}

// ============================================================================
// Comparison
// ============================================================================

export function compareDates(a: LocalDate, b: LocalDate): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function compareTimes(a: LocalTime, b: LocalTime): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function compareDateTimes(a: LocalDateTime, b: LocalDateTime): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function dateEquals(a: LocalDate, b: LocalDate): boolean {
  return a === b
}

export function dateBefore(a: LocalDate, b: LocalDate): boolean {
  return a < b
}

export function dateAfter(a: LocalDate, b: LocalDate): boolean {
  return a > b
}

// ============================================================================
// Timezone Conversion
// ============================================================================

/** Given a UTC epoch in ms, return the UTC offset in minutes for timezone tz */
function utcOffsetAtMs(utcMs: number, tz: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(new Date(utcMs))
  const get = (type: string) => {
    const part = parts.find((p) => p.type === type)
    return part ? parseInt(part.value, 10) : 0
  }

  let h = get('hour')
  if (h === 24) h = 0
  const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'))
  return (localMs - utcMs) / 60000
}

/** Convert a LocalDateTime to epoch ms (treating it as UTC) */
function dtToMs(dt: LocalDateTime): number {
  const d = dateOf(dt), t = timeOf(dt)
  return Date.UTC(yearOf(d), monthOf(d) - 1, dayOf(d), hourOf(t), minuteOf(t), secondOf(t))
}

/** Convert epoch ms to a LocalDateTime (treating ms as UTC) */
function msToDt(ms: number): LocalDateTime {
  const d = new Date(ms)
  return makeDateTime(
    makeDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
    makeTime(d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())
  )
}

export function toLocal(utc: LocalDateTime, tz: string): LocalDateTime {
  const utcMs = dtToMs(utc)
  const offset = utcOffsetAtMs(utcMs, tz)
  return msToDt(utcMs + offset * 60000)
}

export function toUTC(local: LocalDateTime, tz: string): LocalDateTime {
  if (tz === 'UTC') return local

  const localMs = dtToMs(local)
  const year = yearOf(dateOf(local))

  // Determine standard and daylight offsets from Jan/Jul
  const janMs = Date.UTC(year, 0, 15, 12, 0, 0)
  const julMs = Date.UTC(year, 6, 15, 12, 0, 0)
  const janOffset = utcOffsetAtMs(janMs, tz)
  const julOffset = utcOffsetAtMs(julMs, tz)

  if (janOffset === julOffset) {
    // No DST transitions — simple conversion
    return msToDt(localMs - janOffset * 60000)
  }

  const stdOffset = Math.min(janOffset, julOffset)
  const dstOffset = Math.max(janOffset, julOffset)
  const dstStatus = isDSTAt(local, tz)

  if (dstStatus === 'gap') {
    // Scan minute-by-minute to find the exact transition UTC
    // DST transitions are always minute-aligned
    const utcViaDst = localMs - dstOffset * 60000 // before transition
    const utcViaStd = localMs - stdOffset * 60000 // after transition
    for (let ms = utcViaDst; ms <= utcViaStd; ms += 60000) {
      if (utcOffsetAtMs(ms, tz) !== stdOffset) {
        return msToDt(ms) // first post-transition UTC
      }
    }
    return msToDt(utcViaStd) // fallback
  }

  if (dstStatus === 'overlap') {
    // Use standard time (post-fallback)
    return msToDt(localMs - stdOffset * 60000)
  }

  if (dstStatus === true) {
    return msToDt(localMs - dstOffset * 60000)
  }

  return msToDt(localMs - stdOffset * 60000)
}

export function isDSTAt(
  dt: LocalDateTime,
  tz: string
): boolean | 'gap' | 'overlap' {
  if (tz === 'UTC') return false

  const localMs = dtToMs(dt)
  const year = yearOf(dateOf(dt))

  // Determine standard and daylight offsets
  const janMs = Date.UTC(year, 0, 15, 12, 0, 0)
  const julMs = Date.UTC(year, 6, 15, 12, 0, 0)
  const janOffset = utcOffsetAtMs(janMs, tz)
  const julOffset = utcOffsetAtMs(julMs, tz)

  if (janOffset === julOffset) return false // No DST in this timezone

  const stdOffset = Math.min(janOffset, julOffset)
  const dstOffset = Math.max(janOffset, julOffset)

  // Try both possible offsets to map local → UTC, then check round-trip
  const utcViaStd = localMs - stdOffset * 60000
  const utcViaDst = localMs - dstOffset * 60000

  const localViaStd = utcViaStd + utcOffsetAtMs(utcViaStd, tz) * 60000
  const localViaDst = utcViaDst + utcOffsetAtMs(utcViaDst, tz) * 60000

  const stdMapsBack = localViaStd === localMs
  const dstMapsBack = localViaDst === localMs

  if (stdMapsBack && dstMapsBack) return 'overlap'
  if (!stdMapsBack && !dstMapsBack) return 'gap'

  // Exactly one maps back — DST is active if daylight offset works
  return dstMapsBack
}
