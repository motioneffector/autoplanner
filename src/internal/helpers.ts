/**
 * Internal Helpers
 *
 * Pure utility functions shared across internal modules.
 * Extracted from public-api.ts lines 286-529.
 */

import type { LocalDate, LocalTime, LocalDateTime, Weekday } from '../time-date'
import {
  addDays, dayOfWeek, makeDate, makeTime, makeDateTime,
  yearOf, monthOf, dayOf, hourOf, minuteOf, secondOf,
  dateOf, timeOf, daysBetween, daysInMonth,
} from '../time-date'
import { expandPattern, toExpandablePattern } from '../pattern-expansion'
import type { EnrichedPattern } from '../public-api'

// ============================================================================
// Weekday Helpers
// ============================================================================

const WEEKDAY_NAMES: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function numToWeekday(n: number): Weekday {
  return WEEKDAY_NAMES[((n % 7) + 7) % 7]!
}

export function dayOfWeekNum(date: LocalDate): number {
  const w = dayOfWeek(date)
  return WEEKDAY_NAMES.indexOf(w)
}

// ============================================================================
// ID Generation
// ============================================================================

export function uuid(): string {
  return crypto.randomUUID()
}

// ============================================================================
// Timezone Helpers
// ============================================================================

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function formatInTz(epochMs: number, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  })
  const parts = fmt.formatToParts(new Date(epochMs))
  const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value)
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour') % 24, minute: get('minute'), second: get('second'),
  }
}

export function normalizeTime(t: LocalTime): LocalTime {
  const s = t as string
  const parts = s.split(':')
  const h = (parts[0] || '00').padStart(2, '0')
  const m = (parts[1] || '00').padStart(2, '0')
  const sec = (parts[2] || '00').padStart(2, '0')
  return `${h}:${m}:${sec}` as LocalTime
}

export function resolveTimeForDate(dateStr: LocalDate, timeStr: LocalTime, tz: string): LocalTime {
  const normalized = normalizeTime(timeStr)
  if (tz === 'UTC') return normalized

  const y = yearOf(dateStr)
  const mo = monthOf(dateStr)
  const d = dayOf(dateStr)
  const [hS, mS, sS] = (normalized as string).split(':') as [string, string, string]
  const h = parseInt(hS), m = parseInt(mS), s = parseInt(sS || '0')
  if (isNaN(h) || isNaN(m) || isNaN(s)) throw new Error(`Non-numeric time components in '${normalized}'`)

  // Get offset at noon (safe from DST edges)
  const noonEpoch = Date.UTC(y, mo - 1, d, 12, 0, 0)
  const noonLocal = formatInTz(noonEpoch, tz)
  const offsetHours = 12 - noonLocal.hour

  // Estimate epoch for target time
  const targetEpoch = Date.UTC(y, mo - 1, d, h + offsetHours, m, s)
  const resolved = formatInTz(targetEpoch, tz)

  if (resolved.hour === h && resolved.minute === m && resolved.day === d) {
    return normalized
  }

  // Try ±1 hour offset adjustment
  for (const adj of [-1, 1]) {
    const altEpoch = Date.UTC(y, mo - 1, d, h + offsetHours + adj, m, s)
    const alt = formatInTz(altEpoch, tz)
    if (alt.hour === h && alt.minute === m && alt.day === d) return normalized
  }

  // DST gap — find first valid time after the gap
  for (let i = 0; i <= 120; i++) {
    const testEpoch = targetEpoch + i * 60000
    const curr = formatInTz(testEpoch, tz)
    if (curr.day !== d) continue
    const prev = formatInTz(testEpoch - 60000, tz)
    if (prev.hour < curr.hour || prev.day !== d) {
      return makeTime(curr.hour, curr.minute, 0)
    }
  }

  return makeTime(h + 1, 0, 0)
}

// ============================================================================
// Pattern Date Expansion
// ============================================================================

export function getPatternDates(pattern: EnrichedPattern, start: LocalDate, end: LocalDate, seriesStart: LocalDate): Set<LocalDate> {
  const effectiveStart = (seriesStart as string) > (start as string) ? seriesStart : start
  const result = new Set<LocalDate>()

  switch (pattern.type) {
    case 'daily': {
      let d = effectiveStart
      while ((d as string) < (end as string)) {
        result.add(d)
        d = addDays(d, 1)
      }
      return result
    }

    case 'everyNDays': {
      const n = pattern.n || 2
      const gap = daysBetween(seriesStart, effectiveStart)
      const rem = ((gap % n) + n) % n
      const offset = rem === 0 ? 0 : n - rem
      let d = addDays(effectiveStart, offset)
      while ((d as string) < (end as string)) {
        result.add(d)
        d = addDays(d, n)
      }
      return result
    }

    case 'weekly': {
      if (pattern.daysOfWeek && Array.isArray(pattern.daysOfWeek)) {
        return getWeeklyDaysOfWeekDates(pattern.daysOfWeek, start, end, seriesStart, pattern._anchor)
      }
      const expandable = toExpandablePattern(pattern, seriesStart)
      return expandPattern(expandable, { start, end }, seriesStart)
    }

    case 'monthly': {
      const day = pattern.day || pattern.dayOfMonth || dayOf(seriesStart)
      const startYear = yearOf(start)
      const startMonth = monthOf(start)
      const endYear = yearOf(end)
      const endMonth = monthOf(end)
      for (let y = startYear; y <= endYear; y++) {
        const mStart = y === startYear ? startMonth : 1
        const mEnd = y === endYear ? endMonth : 12
        for (let m = mStart; m <= mEnd; m++) {
          if (day > daysInMonth(y, m)) continue
          const d = makeDate(y, m, day)
          if ((d as string) >= (effectiveStart as string) && (d as string) < (end as string)) {
            result.add(d)
          }
        }
      }
      return result
    }

    case 'yearly': {
      const month = pattern.month || monthOf(seriesStart)
      const day = pattern.day || pattern.dayOfMonth || dayOf(seriesStart)
      for (let y = yearOf(start); y <= yearOf(end); y++) {
        if (day > daysInMonth(y, month)) continue
        const d = makeDate(y, month, day)
        if ((d as string) >= (effectiveStart as string) && (d as string) < (end as string)) {
          result.add(d)
        }
      }
      return result
    }

    default: {
      const expandable = toExpandablePattern(pattern, seriesStart)
      return expandPattern(expandable, { start, end }, seriesStart)
    }
  }
}

export function getWeeklyDaysOfWeekDates(
  daysOfWeek: number[], start: LocalDate, end: LocalDate,
  seriesStart: LocalDate, anchor?: LocalDate
): Set<LocalDate> {
  const result = new Set<LocalDate>()
  const effectiveStart = (seriesStart as string) > (start as string) ? seriesStart : start

  let effectiveAnchor: LocalDate
  if (anchor) {
    effectiveAnchor = anchor
  } else {
    const lowestDow = Math.min(...daysOfWeek)
    effectiveAnchor = effectiveStart
    while (dayOfWeekNum(effectiveAnchor) !== lowestDow) {
      effectiveAnchor = addDays(effectiveAnchor, 1)
    }
  }

  let monday = effectiveStart
  while (dayOfWeekNum(monday) !== 1) {
    monday = addDays(monday, -1)
  }

  while ((monday as string) < (end as string)) {
    for (const dow of daysOfWeek) {
      const offset = ((dow - 1) + 7) % 7
      const date = addDays(monday, offset)
      if ((date as string) >= (start as string) &&
          (date as string) < (end as string) &&
          (date as string) >= (effectiveStart as string) &&
          (date as string) >= (seriesStart as string)) {
        result.add(date)
      }
    }
    monday = addDays(monday, 7)
  }

  return result
}

// ============================================================================
// Hashing
// ============================================================================

export function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// ============================================================================
// Time Arithmetic
// ============================================================================

export function addMinutesToTime(dt: LocalDateTime, mins: number): LocalDateTime {
  const d = dateOf(dt)
  const t = timeOf(dt)
  const h = hourOf(t)
  const m = minuteOf(t)
  const s = secondOf(t)
  let totalMinutes = h * 60 + m + mins
  let dayAdj = 0
  while (totalMinutes < 0) { totalMinutes += 1440; dayAdj-- }
  while (totalMinutes >= 1440) { totalMinutes -= 1440; dayAdj++ }
  const newH = Math.floor(totalMinutes / 60)
  const newM = totalMinutes % 60
  const newDate = dayAdj !== 0 ? addDays(d, dayAdj) : d
  return makeDateTime(newDate, makeTime(newH, newM, s))
}

export function subtractMinutes(dt: LocalDateTime, mins: number): LocalDateTime {
  return addMinutesToTime(dt, -mins)
}
