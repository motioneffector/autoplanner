/**
 * Public API Module
 *
 * Consumer-facing interface that ties all components together.
 * Handles initialization, validation, event emission, and timezone handling.
 */

import type { LocalDate, LocalTime, LocalDateTime, Weekday } from './time-date'
import type { Duration } from './core'
import {
  addDays, dayOfWeek, makeDate, makeTime, makeDateTime,
  yearOf, monthOf, dayOf, hourOf, minuteOf, secondOf,
  dateOf, timeOf, daysBetween, weekdayToIndex, daysInMonth,
} from './time-date'
import { expandPattern, type Pattern } from './pattern-expansion'

// ============================================================================
// Error Classes
// ============================================================================

export class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ValidationError' }
}

export class NotFoundError extends Error {
  constructor(message: string) { super(message); this.name = 'NotFoundError' }
}

export class LockedSeriesError extends Error {
  constructor(message: string) { super(message); this.name = 'LockedSeriesError' }
}

export class CompletionsExistError extends Error {
  constructor(message: string) { super(message); this.name = 'CompletionsExistError' }
}

export class LinkedChildrenExistError extends Error {
  constructor(message: string) { super(message); this.name = 'LinkedChildrenExistError' }
}

export class NonExistentInstanceError extends Error {
  constructor(message: string) { super(message); this.name = 'NonExistentInstanceError' }
}

export class AlreadyCancelledError extends Error {
  constructor(message: string) { super(message); this.name = 'AlreadyCancelledError' }
}

export class CancelledInstanceError extends Error {
  constructor(message: string) { super(message); this.name = 'CancelledInstanceError' }
}

export class CycleDetectedError extends Error {
  constructor(message: string) { super(message); this.name = 'CycleDetectedError' }
}

export class ChainDepthExceededError extends Error {
  constructor(message: string) { super(message); this.name = 'ChainDepthExceededError' }
}

export class DuplicateCompletionError extends Error {
  constructor(message: string) { super(message); this.name = 'DuplicateCompletionError' }
}

// ============================================================================
// Types
// ============================================================================

export type Adapter = {
  getSeries: (id: string) => Promise<any>
  saveSeries: (series: any) => Promise<void>
  deleteSeries: (id: string) => Promise<void>
  getAllSeries: () => Promise<any[]>
  getCompletion?: (id: string) => Promise<any>
  saveCompletion?: (completion: any) => Promise<void>
  deleteCompletion?: (id: string) => Promise<void>
  getCompletionsBySeries?: (seriesId: string) => Promise<any[]>
  getReminder?: (id: string) => Promise<any>
  saveReminder?: (reminder: any) => Promise<void>
  deleteReminder?: (id: string) => Promise<void>
  getException?: (key: string) => Promise<any>
  saveException?: (exception: any) => Promise<void>
  deleteException?: (key: string) => Promise<void>
  getLink?: (id: string) => Promise<any>
  saveLink?: (link: any) => Promise<void>
  deleteLink?: (id: string) => Promise<void>
  getConstraint?: (id: string) => Promise<any>
  saveConstraint?: (constraint: any) => Promise<void>
  deleteConstraint?: (id: string) => Promise<void>
  transaction?: <T>(fn: () => T) => T | Promise<T>
  close?: () => Promise<void>
}

export type AutoplannerConfig = {
  adapter: Adapter
  timezone: string
}

export type Schedule = {
  instances: ScheduleInstance[]
  conflicts: Conflict[]
}

export type ScheduleInstance = {
  seriesId: string
  title: string
  date: LocalDate
  time: LocalDateTime
  duration?: number
  fixed?: boolean
  allDay?: boolean
}

export type Conflict = {
  type: string
  seriesIds: string[]
  instances: Array<{ seriesId: string; title: string; date?: LocalDate; time?: LocalDateTime }>
  date?: LocalDate
  description?: string
  parentId?: string
  childId?: string
}

export type PendingReminder = {
  id: string
  seriesId: string
  type: string
  offset?: number
  offsetMinutes?: number
  instanceDate?: LocalDate
}

export type Autoplanner = {
  createSeries(input: any): Promise<string>
  getSeries(id: string): Promise<any>
  getAllSeries(): Promise<any[]>
  getSeriesByTag(tag: string): Promise<any[]>
  updateSeries(id: string, changes: any): Promise<void>
  lock(id: string): Promise<void>
  unlock(id: string): Promise<void>
  deleteSeries(id: string): Promise<void>
  splitSeries(id: string, splitDate: LocalDate): Promise<string>
  linkSeries(parentId: string, childId: string, options: any): Promise<void>
  unlinkSeries(childId: string): Promise<void>
  addConstraint(constraint: any): Promise<string>
  removeConstraint(id: string): Promise<void>
  getConstraints(): Promise<any[]>
  getInstance(seriesId: string, date: LocalDate): Promise<any>
  cancelInstance(seriesId: string, date: LocalDate): Promise<void>
  rescheduleInstance(seriesId: string, date: LocalDate, newTime: LocalDateTime): Promise<void>
  logCompletion(seriesId: string, date: LocalDate, options?: any): Promise<string>
  getCompletions(seriesId: string): Promise<any[]>
  deleteCompletion(id: string): Promise<void>
  getSchedule(start: LocalDate, end: LocalDate): Promise<Schedule>
  getConflicts(): Promise<Conflict[]>
  createReminder(seriesId: string, options: any): Promise<string>
  getPendingReminders(asOf: LocalDateTime): Promise<PendingReminder[]>
  checkReminders(asOf: LocalDateTime): Promise<void>
  acknowledgeReminder(id: string, asOf: LocalDateTime): Promise<void>
  evaluateCondition(condition: any, date: LocalDate): Promise<boolean>
  getActiveConditions(seriesId: string, date: LocalDate): Promise<any[]>
  getChainDepth(seriesId: string): Promise<number>
  on(event: string, handler: (...args: any[]) => void): void
}

// ============================================================================
// Mock Adapter
// ============================================================================

export function createMockAdapter(): Adapter {
  const seriesMap = new Map<string, any>()
  const completionMap = new Map<string, any>()
  const completionsBySeriesMap = new Map<string, any[]>()

  return {
    getSeries: async (id) => {
      const s = seriesMap.get(id)
      return s ? { ...s } : null
    },
    saveSeries: async (s) => {
      seriesMap.set(s.id, { ...s })
    },
    deleteSeries: async (id) => {
      seriesMap.delete(id)
    },
    getAllSeries: async () => {
      return [...seriesMap.values()].map(s => ({ ...s }))
    },
    saveCompletion: async (c) => {
      completionMap.set(c.id, { ...c })
      if (!completionsBySeriesMap.has(c.seriesId)) completionsBySeriesMap.set(c.seriesId, [])
      const list = completionsBySeriesMap.get(c.seriesId)!
      if (!list.some(x => x.id === c.id)) list.push({ ...c })
    },
    getCompletion: async (id) => {
      const c = completionMap.get(id)
      return c ? { ...c } : null
    },
    deleteCompletion: async (id) => {
      const c = completionMap.get(id)
      if (c) {
        completionMap.delete(id)
        const list = completionsBySeriesMap.get(c.seriesId)
        if (list) {
          const idx = list.findIndex((x: any) => x.id === id)
          if (idx >= 0) list.splice(idx, 1)
        }
      }
    },
    getCompletionsBySeries: async (seriesId) => {
      return (completionsBySeriesMap.get(seriesId) || []).map(c => ({ ...c }))
    },
    saveReminder: async () => {},
    getReminder: async () => null,
    deleteReminder: async () => {},
    saveException: async () => {},
    getException: async () => null,
    deleteException: async () => {},
    saveLink: async () => {},
    getLink: async () => null,
    deleteLink: async () => {},
    saveConstraint: async () => {},
    getConstraint: async () => null,
    deleteConstraint: async () => {},
    transaction: async (fn: any) => fn(),
    close: async () => {},
  }
}

// ============================================================================
// SQLite Adapter Re-export
// ============================================================================

export { createSqliteAdapter } from './sqlite-adapter'

// ============================================================================
// Helpers
// ============================================================================

const WEEKDAY_NAMES: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function numToWeekday(n: number): Weekday {
  return WEEKDAY_NAMES[((n % 7) + 7) % 7]
}

function dayOfWeekNum(date: LocalDate): number {
  const w = dayOfWeek(date)
  return WEEKDAY_NAMES.indexOf(w)
}

function uuid(): string {
  return crypto.randomUUID()
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function formatInTz(epochMs: number, tz: string) {
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

function normalizeTime(t: LocalTime): LocalTime {
  const s = t as string
  if (s.length === 5) return (s + ':00') as LocalTime
  return t
}

function resolveTimeForDate(dateStr: LocalDate, timeStr: LocalTime, tz: string): LocalTime {
  const normalized = normalizeTime(timeStr)
  if (tz === 'UTC') return normalized

  const y = yearOf(dateStr)
  const mo = monthOf(dateStr)
  const d = dayOf(dateStr)
  const [hS, mS, sS] = (normalized as string).split(':')
  const h = parseInt(hS), m = parseInt(mS), s = parseInt(sS || '0')

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

function toExpandablePattern(p: any, seriesStart: LocalDate): Pattern {
  switch (p.type) {
    case 'daily':
      return { type: 'daily' }
    case 'everyNDays':
      return { type: 'everyNDays', n: p.n || 2 }
    case 'weekly':
      if (p.daysOfWeek && Array.isArray(p.daysOfWeek)) {
        const days = p.daysOfWeek.map((d: number) => numToWeekday(d))
        return { type: 'weekdays', days }
      }
      if (p.dayOfWeek !== undefined) {
        return { type: 'weekdays', days: [numToWeekday(p.dayOfWeek)] }
      }
      return { type: 'weekly' }
    case 'everyNWeeks': {
      const weekday = typeof p.weekday === 'number' ? numToWeekday(p.weekday) : p.weekday
      return { type: 'everyNWeeks', n: p.n || 2, weekday }
    }
    case 'weekdays': {
      // Accept both string weekdays ('mon') and numeric (1 = Mon)
      const days = (p.days || []).map((d: any) => typeof d === 'number' ? numToWeekday(d) : d)
      return { type: 'weekdays', days }
    }
    case 'nthWeekdayOfMonth': {
      const weekday = typeof p.weekday === 'number' ? numToWeekday(p.weekday) : p.weekday
      return { type: 'nthWeekdayOfMonth', n: p.n, weekday }
    }
    case 'lastWeekdayOfMonth': {
      const weekday = typeof p.weekday === 'number' ? numToWeekday(p.weekday) : p.weekday
      return { type: 'lastWeekdayOfMonth', weekday }
    }
    case 'nthToLastWeekdayOfMonth': {
      const weekday = typeof p.weekday === 'number' ? numToWeekday(p.weekday) : p.weekday
      return { type: 'nthToLastWeekdayOfMonth', n: p.n, weekday }
    }
    case 'lastDayOfMonth':
      return { type: 'lastDayOfMonth' }
    case 'monthly':
      return { type: 'monthly', day: p.day || p.dayOfMonth || dayOf(seriesStart) }
    case 'yearly':
      return { type: 'yearly', month: p.month || monthOf(seriesStart), day: p.day || p.dayOfMonth || dayOf(seriesStart) }
    default:
      // Pass through as-is for union/except or unknown types
      return p as Pattern
  }
}

function getPatternDates(pattern: any, start: LocalDate, end: LocalDate, seriesStart: LocalDate): Set<LocalDate> {
  const effectiveStart = (seriesStart as string) > (start as string) ? seriesStart : start
  const result = new Set<LocalDate>()

  switch (pattern.type) {
    case 'daily': {
      let d = effectiveStart
      while ((d as string) <= (end as string)) {
        result.add(d)
        d = addDays(d, 1)
      }
      return result
    }

    case 'everyNDays': {
      const n = pattern.n || 2
      // Align to series anchor — only fire on days where (daysBetween(seriesStart, d) % n === 0)
      const gap = daysBetween(seriesStart, effectiveStart)
      const rem = ((gap % n) + n) % n
      const offset = rem === 0 ? 0 : n - rem
      let d = addDays(effectiveStart, offset)
      while ((d as string) <= (end as string)) {
        result.add(d)
        d = addDays(d, n)
      }
      return result
    }

    case 'weekly': {
      if (pattern.daysOfWeek && Array.isArray(pattern.daysOfWeek)) {
        return getWeeklyDaysOfWeekDates(pattern.daysOfWeek, start, end, seriesStart, pattern._anchor)
      }
      // Simple weekly: same day each week
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
          if (day > daysInMonth(y, m)) continue // skip invalid dates like Feb 30
          const d = makeDate(y, m, day)
          if ((d as string) >= (effectiveStart as string) && (d as string) <= (end as string)) {
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
        if (day > daysInMonth(y, month)) continue // skip Feb 29 on non-leap years etc.
        const d = makeDate(y, month, day)
        if ((d as string) >= (effectiveStart as string) && (d as string) <= (end as string)) {
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

function getWeeklyDaysOfWeekDates(
  daysOfWeek: number[], start: LocalDate, end: LocalDate,
  seriesStart: LocalDate, anchor?: LocalDate
): Set<LocalDate> {
  const result = new Set<LocalDate>()
  const effectiveStart = (seriesStart as string) > (start as string) ? seriesStart : start

  // Determine effective anchor:
  // - If anchor provided (e.g., first completion date), use it directly
  // - Otherwise, find first occurrence of the lowest daysOfWeek number >= effectiveStart
  let effectiveAnchor: LocalDate
  if (anchor) {
    effectiveAnchor = anchor
  } else {
    const lowestDow = Math.min(...daysOfWeek)
    // Find first occurrence of lowestDow on or after effectiveStart
    effectiveAnchor = effectiveStart
    while (dayOfWeekNum(effectiveAnchor) !== lowestDow) {
      effectiveAnchor = addDays(effectiveAnchor, 1)
    }
  }

  // Find first Monday on or before the effective anchor to establish week grid
  let monday = effectiveAnchor
  while (dayOfWeekNum(monday) !== 1) {
    monday = addDays(monday, -1)
  }

  // Generate dates from Monday-aligned weeks
  while ((monday as string) <= (end as string)) {
    for (const dow of daysOfWeek) {
      const offset = ((dow - 1) + 7) % 7
      const date = addDays(monday, offset)
      if ((date as string) >= (start as string) &&
          (date as string) <= (end as string) &&
          (date as string) >= (effectiveAnchor as string) &&
          (date as string) >= (seriesStart as string)) {
        result.add(date)
      }
    }
    monday = addDays(monday, 7)
  }

  return result
}

function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function addMinutesToTime(dt: LocalDateTime, mins: number): LocalDateTime {
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

function subtractMinutes(dt: LocalDateTime, mins: number): LocalDateTime {
  return addMinutesToTime(dt, -mins)
}

// ============================================================================
// Implementation
// ============================================================================

export function createAutoplanner(config: AutoplannerConfig): Autoplanner {
  if (!config.adapter || typeof config.adapter !== 'object') {
    throw new ValidationError('Adapter is required')
  }
  if (typeof config.adapter.getSeries !== 'function') {
    throw new ValidationError('Adapter must implement getSeries')
  }
  if (typeof config.adapter.saveSeries !== 'function') {
    throw new ValidationError('Adapter must implement saveSeries')
  }
  if (typeof config.adapter.getAllSeries !== 'function') {
    throw new ValidationError('Adapter must implement getAllSeries')
  }
  if (!isValidTimezone(config.timezone)) {
    throw new ValidationError(`Invalid timezone: ${config.timezone}`)
  }

  const adapter = config.adapter
  const timezone = config.timezone

  // Internal state
  const seriesCache = new Map<string, any>()    // full series objects (with patterns)
  const completions = new Map<string, any>()
  const completionsByKey = new Map<string, string>()
  const completionsBySeries = new Map<string, string[]>()
  const exceptions = new Map<string, any>()
  const links = new Map<string, any>()        // childId → link data
  const linksByParent = new Map<string, string[]>()
  const constraints = new Map<string, any>()
  const reminders = new Map<string, any>()
  const remindersBySeriesMap = new Map<string, string[]>()
  const reminderAcks = new Map<string, Set<string>>()

  // Event handlers
  const eventHandlers = new Map<string, ((...args: any[]) => void)[]>()
  let cachedConflicts: Conflict[] = []

  function emit(event: string, ...args: any[]) {
    const handlers = eventHandlers.get(event) || []
    for (const handler of handlers) {
      try { handler(...args) } catch { /* isolated */ }
    }
  }

  function on(event: string, handler: (...args: any[]) => void) {
    if (!eventHandlers.has(event)) eventHandlers.set(event, [])
    eventHandlers.get(event)!.push(handler)
  }

  function getDefaultWindow(): { start: LocalDate; end: LocalDate } {
    const now = new Date()
    const today = makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
    return { start: today, end: addDays(today, 6) }
  }

  async function triggerReflow() {
    const win = getDefaultWindow()
    const schedule = await buildSchedule(win.start, win.end)
    cachedConflicts = schedule.conflicts

    const frozenSchedule = Object.freeze({
      instances: Object.freeze([...schedule.instances]),
      conflicts: Object.freeze([...schedule.conflicts]),
    })
    emit('reflow', frozenSchedule)

    for (const conflict of schedule.conflicts) {
      emit('conflict', Object.freeze({ ...conflict }))
    }
  }

  // Count completions for a series in a window [windowStart, asOf]
  function countCompletionsInWindow(seriesId: string, windowDays: number, asOf: LocalDate): number {
    const windowStart = addDays(asOf, -(windowDays - 1))
    let count = 0
    const ids = completionsBySeries.get(seriesId) || []
    for (const id of ids) {
      const c = completions.get(id)
      if (!c) continue
      const d = c.date as string
      if (d >= (windowStart as string) && d <= (asOf as string)) count++
    }
    return count
  }

  // Get the last completion date for a series
  function getLastCompletionDate(seriesId: string): LocalDate | null {
    const ids = completionsBySeries.get(seriesId) || []
    let latest: string | null = null
    for (const id of ids) {
      const c = completions.get(id)
      if (!c) continue
      const d = c.date as string
      if (latest === null || d > latest) latest = d
    }
    return latest as LocalDate | null
  }

  // Get the first (earliest) completion date for a series
  function getFirstCompletionDate(seriesId: string): LocalDate | null {
    const ids = completionsBySeries.get(seriesId) || []
    let earliest: string | null = null
    for (const id of ids) {
      const c = completions.get(id)
      if (!c) continue
      const d = c.date as string
      if (earliest === null || d < earliest) earliest = d
    }
    return earliest as LocalDate | null
  }

  // Evaluate a condition on a given date
  function evaluateConditionForDate(condition: any, seriesId: string, asOf: LocalDate): boolean {
    if (!condition) return true
    switch (condition.type) {
      case 'completionCount': {
        const targetSeriesId = condition.seriesRef === 'self' ? seriesId : condition.seriesRef
        // For cross-series references, anchor window to target's last completion
        // (but only if the schedule start is within 2x windowDays of that completion)
        // For self-references, use the provided asOf date (schedule start)
        let evaluationDate = asOf
        if (condition.seriesRef !== 'self') {
          const lastComp = getLastCompletionDate(targetSeriesId)
          const windowDays = condition.windowDays || 14
          if (lastComp && daysBetween(lastComp, asOf) <= windowDays * 2) {
            evaluationDate = lastComp
          }
        }
        const count = countCompletionsInWindow(targetSeriesId, condition.windowDays || 14, evaluationDate)
        switch (condition.comparison) {
          case 'lessThan': return count < condition.value
          case 'greaterOrEqual': return count >= condition.value
          case 'greaterThan': return count > condition.value
          case 'lessOrEqual': return count <= condition.value
          case 'equal': return count === condition.value
          default: return true
        }
      }
      case 'and':
        return (condition.conditions || []).every((c: any) =>
          evaluateConditionForDate(c, seriesId, asOf)
        )
      case 'or':
        return (condition.conditions || []).some((c: any) =>
          evaluateConditionForDate(c, seriesId, asOf)
        )
      case 'not':
        return !evaluateConditionForDate(condition.condition, seriesId, asOf)
      case 'weekday': {
        const dow = dayOfWeekNum(asOf)
        return condition.days.includes(dow)
      }
      default:
        return true
    }
  }

  // Get cycling title for a series instance
  function getCyclingTitle(series: any, seriesId: string): string {
    const cycling = series.cycling
    if (!cycling || !cycling.items || cycling.items.length === 0) return series.title

    const items = cycling.items
    const mode = cycling.mode || 'sequential'

    if (mode === 'random') {
      // Use a hash of series id + completion count for pseudo-random
      const completionCount = (completionsBySeries.get(seriesId) || []).length
      const hash = simpleHash(seriesId + ':' + completionCount)
      return items[hash % items.length]
    }

    // Sequential mode: use completion count
    const completionCount = (completionsBySeries.get(seriesId) || []).length
    const index = completionCount % items.length
    return items[index]
  }

  // Calculate adaptive duration for a series
  function calculateAdaptiveDuration(seriesId: string, config: any): number | null {
    if (!config) return null
    const ids = completionsBySeries.get(seriesId) || []
    const durations: number[] = []

    for (const id of ids) {
      const c = completions.get(id)
      if (!c || !c.startTime || !c.endTime) continue
      // Calculate duration in minutes
      const startT = timeOf(c.startTime as LocalDateTime)
      const startH = hourOf(startT)
      const startM = minuteOf(startT)
      const endT = timeOf(c.endTime as LocalDateTime)
      const endH = hourOf(endT)
      const endM = minuteOf(endT)
      const dur = (endH * 60 + endM) - (startH * 60 + startM)
      if (dur > 0) durations.push(dur)
    }

    if (durations.length === 0) return config.fallback || null

    // Get last N durations
    const lastN = config.lastN || 5
    const recentDurations = durations.slice(-lastN)

    // Average
    const avg = recentDurations.reduce((a: number, b: number) => a + b, 0) / recentDurations.length

    // Apply multiplier
    const multiplier = config.multiplier || 1.0
    const result = Math.ceil(avg * multiplier)

    return Math.max(1, result)
  }

  // Get parent's effective end time for a given date
  function getParentEndTime(parentSeries: any, parentId: string, instanceDate: LocalDate): LocalDateTime | null {
    // Check if parent has a completion on this date with endTime
    const parentCompIds = completionsBySeries.get(parentId) || []
    for (const cId of parentCompIds) {
      const c = completions.get(cId)
      if (c && (c.date as string) === (instanceDate as string) && c.endTime) {
        return c.endTime as LocalDateTime
      }
    }

    // Check if parent is rescheduled
    const exKey = `${parentId}:${instanceDate}`
    const exception = exceptions.get(exKey)
    if (exception?.type === 'rescheduled' && exception.newTime) {
      const parentDur = getSeriesDuration(parentSeries)
      return addMinutesToTime(exception.newTime, parentDur)
    }

    // Use scheduled time + duration
    if (parentSeries.patterns && parentSeries.patterns.length > 0) {
      const pattern = parentSeries.patterns[0]
      const patternTime = normalizeTime(pattern?.time || ('09:00:00' as LocalTime))
      const resolvedTime = resolveTimeForDate(instanceDate, patternTime, timezone)
      const parentTime = makeDateTime(instanceDate, resolvedTime)
      const parentDur = getSeriesDuration(parentSeries)
      return addMinutesToTime(parentTime, parentDur)
    }

    return null
  }

  function getSeriesDuration(series: any): number {
    if (series.patterns && series.patterns.length > 0) {
      return series.patterns[0].duration || 60
    }
    return 60
  }

  // Build schedule for [start, end] — both ends inclusive
  async function buildSchedule(start: LocalDate, end: LocalDate): Promise<Schedule> {
    // Use local cache if available (has full data including patterns),
    // fall back to adapter for series created outside the planner
    const adapterSeries = await adapter.getAllSeries()
    const allSeries: any[] = []
    const seen = new Set<string>()
    // Prefer cached versions (they include patterns, startDate, etc.)
    for (const [id, s] of seriesCache) {
      allSeries.push(s)
      seen.add(id)
    }
    // Add any adapter-only series not in cache
    for (const s of adapterSeries) {
      if (s && s.id && !seen.has(s.id)) allSeries.push(s)
    }
    const instances: ScheduleInstance[] = []

    if ((end as string) < (start as string)) {
      return { instances: [], conflicts: [] }
    }

    // Build a map of series by id for chain lookups
    const seriesById = new Map<string, any>()
    for (const s of allSeries) {
      if (s && s.id) seriesById.set(s.id, s)
    }

    // Build constraint-based filtering data
    const allConstraintsList = [...constraints.values()]
    const mustBeOnSameDayConstraints = allConstraintsList.filter(c => c.type === 'mustBeOnSameDay')

    // First pass: collect all instances for tag-based constraint resolution
    const instancesBySeriesDate = new Map<string, Set<string>>()

    for (const s of allSeries) {
      if (!s || !s.id || !s.patterns) continue
      const seriesStart = s.startDate || ('2000-01-01' as LocalDate)
      const dates = new Set<string>()

      for (const pattern of s.patterns) {
        const patternDates = getPatternDates(pattern, start, end, seriesStart)
        for (const date of patternDates) {
          if (s.endDate && (date as string) > (s.endDate as string)) continue
          dates.add(date as string)
        }
      }
      instancesBySeriesDate.set(s.id, dates)
    }

    // Resolve tag-based targets for constraints
    function resolveConstraintTarget(target: any): string[] {
      if (!target) return []
      if (target.type === 'tag') {
        return allSeries.filter(s => s && s.tags && s.tags.includes(target.tag)).map(s => s.id)
      }
      if (target.type === 'seriesId') return [target.seriesId]
      return []
    }

    // Build mustBeOnSameDay restrictions
    const sameDayRestrictions = new Map<string, Set<string>>() // seriesId → allowed dates
    for (const c of mustBeOnSameDayConstraints) {
      const secondSeriesIds = c.secondTarget
        ? resolveConstraintTarget(c.secondTarget)
        : c.secondSeries ? [c.secondSeries] : []
      const secondDates = new Set<string>()
      for (const sid of secondSeriesIds) {
        const dates = instancesBySeriesDate.get(sid)
        if (dates) for (const d of dates) secondDates.add(d)
      }
      if (c.firstSeries) {
        sameDayRestrictions.set(c.firstSeries, secondDates)
      }
    }

    // Second pass: generate instances with condition evaluation
    // Conditions are evaluated at the SCHEDULE START for consistency
    // (the schedule is a snapshot — pattern activation is stable across the range)
    for (const s of allSeries) {
      if (!s || !s.id || !s.patterns) continue
      const seriesStart = s.startDate || ('2000-01-01' as LocalDate)
      const allowedDates = sameDayRestrictions.get(s.id)

      // Determine anchor for weekly daysOfWeek patterns:
      // If series has completions, use first completion date as anchor
      const firstCompDate = getLastCompletionDate(s.id) !== null
        ? getFirstCompletionDate(s.id)
        : null

      for (const pattern of s.patterns) {
        // Evaluate condition once at schedule start
        if (pattern.condition && !evaluateConditionForDate(pattern.condition, s.id, start)) continue

        // Annotate pattern with anchor for weekly daysOfWeek expansion
        if (pattern.type === 'weekly' && pattern.daysOfWeek && firstCompDate) {
          pattern._anchor = firstCompDate
        }

        const dates = getPatternDates(pattern, start, end, seriesStart)

        for (const date of dates) {
          if (s.endDate && (date as string) > (s.endDate as string)) continue

          // mustBeOnSameDay filter
          if (allowedDates && !allowedDates.has(date as string)) continue

          // Check exceptions
          const exKey = `${s.id}:${date}`
          const exception = exceptions.get(exKey)
          if (exception?.type === 'cancelled') continue

          // Determine time
          let instanceTime: LocalDateTime
          let instanceDate = date
          const isAllDay = pattern.allDay === true
          let patternTimeOriginal: LocalDateTime | undefined

          if (exception?.type === 'rescheduled' && exception.newTime) {
            instanceTime = exception.newTime
            // Update date if rescheduled to a different day
            const newDate = dateOf(exception.newTime)
            if ((newDate as string) !== (date as string)) {
              instanceDate = newDate
            }
          } else if (isAllDay) {
            instanceTime = makeDateTime(date, makeTime(0, 0, 0))
          } else {
            const patternTime = pattern.time || ('09:00:00' as LocalTime)
            const resolvedTime = resolveTimeForDate(date, patternTime, timezone)
            instanceTime = makeDateTime(date, resolvedTime)
          }

          // Store original pattern time for chain conflict detection
          patternTimeOriginal = instanceTime

          // Chain adjustment: if this series has a parent link, adjust time
          const link = links.get(s.id)
          if (link && !isAllDay) {
            const parentSeries = seriesById.get(link.parentId)
            if (parentSeries) {
              const parentEnd = getParentEndTime(parentSeries, link.parentId, date)
              if (parentEnd) {
                const target = addMinutesToTime(parentEnd, link.distance || 0)
                instanceTime = target
              }
            }
          }

          // Determine duration (adaptive or pattern)
          let duration = pattern.duration as number | undefined
          if (s.adaptiveDuration) {
            const adaptiveDur = calculateAdaptiveDuration(s.id, s.adaptiveDuration)
            if (adaptiveDur !== null) duration = adaptiveDur
          }

          // Cycling title
          let title = s.title
          if (s.cycling && s.cycling.items && s.cycling.items.length > 0) {
            title = getCyclingTitle(s, s.id)
          }

          instances.push({
            seriesId: s.id,
            title,
            date: instanceDate,
            time: instanceTime,
            duration,
            fixed: pattern.fixed,
            allDay: isAllDay || undefined,
            _patternTime: patternTimeOriginal,
          } as any)
        }
      }
    }

    instances.sort((a, b) => (a.time as string).localeCompare(b.time as string))

    const conflicts = detectConflicts(instances, allConstraintsList, seriesById)
    return { instances, conflicts }
  }

  function detectConflicts(
    instances: ScheduleInstance[],
    allConstraintsList: any[],
    seriesById: Map<string, any>
  ): Conflict[] {
    const conflicts: Conflict[] = []

    // 1. Fixed-fixed overlap detection
    const fixedInstances = instances.filter(i => i.fixed && !i.allDay)
    for (let i = 0; i < fixedInstances.length; i++) {
      for (let j = i + 1; j < fixedInstances.length; j++) {
        const a = fixedInstances[i]
        const b = fixedInstances[j]
        if (a.date !== b.date) continue
        if (a.seriesId === b.seriesId) continue

        const durA = a.duration || 60
        const durB = b.duration || 60

        if (timesOverlap(a.time, durA, b.time, durB)) {
          // Deduplicate by series pair (report once, not per day)
          const pairKey = [a.seriesId, b.seriesId].sort().join(':')
          const existing = conflicts.find(c =>
            c.type === 'overlap' &&
            c.seriesIds.sort().join(':') === pairKey
          )
          if (!existing) {
            conflicts.push({
              type: 'overlap',
              seriesIds: [a.seriesId, b.seriesId],
              instances: [
                { seriesId: a.seriesId, title: a.title, date: a.date, time: a.time },
                { seriesId: b.seriesId, title: b.title, date: b.date, time: b.time },
              ],
              date: a.date,
              description: `Fixed overlap between ${a.title} and ${b.title}`,
            })
          }
        }
      }
    }

    // 2. Constraint violation detection
    for (const constraint of allConstraintsList) {
      switch (constraint.type) {
        case 'mustBeBefore': {
          const firstInstances = instances.filter(i => i.seriesId === constraint.firstSeries)
          const secondInstances = instances.filter(i => i.seriesId === constraint.secondSeries)
          for (const first of firstInstances) {
            for (const second of secondInstances) {
              if (first.date !== second.date) continue
              if ((first.time as string) >= (second.time as string)) {
                conflicts.push({
                  type: 'constraintViolation',
                  seriesIds: [constraint.firstSeries, constraint.secondSeries],
                  instances: [
                    { seriesId: first.seriesId, title: first.title, date: first.date },
                    { seriesId: second.seriesId, title: second.title, date: second.date },
                  ],
                  date: first.date,
                  description: `${first.title} must be before ${second.title}`,
                })
              }
            }
          }
          break
        }
        case 'cantBeNextTo': {
          // Resolve target series
          const targetSeriesIds = constraint.target
            ? resolveConstraintTargetFromInstances(constraint.target, instances)
            : []
          const targetInstances = instances.filter(i => targetSeriesIds.includes(i.seriesId))
          // Check for adjacent days
          const dateSeriesMap = new Map<string, string[]>()
          for (const inst of targetInstances) {
            if (!dateSeriesMap.has(inst.date as string)) dateSeriesMap.set(inst.date as string, [])
            dateSeriesMap.get(inst.date as string)!.push(inst.seriesId)
          }
          const sortedDates = [...dateSeriesMap.keys()].sort()
          for (let i = 0; i < sortedDates.length - 1; i++) {
            const d1 = sortedDates[i]
            const d2 = sortedDates[i + 1]
            const daysDiff = daysBetween(d1 as LocalDate, d2 as LocalDate)
            if (daysDiff === 1) {
              const series1 = dateSeriesMap.get(d1)!
              const series2 = dateSeriesMap.get(d2)!
              // Check if different series
              for (const s1 of series1) {
                for (const s2 of series2) {
                  if (s1 !== s2) {
                    const inst1 = targetInstances.find(i => i.seriesId === s1 && (i.date as string) === d1)
                    const inst2 = targetInstances.find(i => i.seriesId === s2 && (i.date as string) === d2)
                    if (inst1 && inst2) {
                      conflicts.push({
                        type: 'constraintViolation',
                        seriesIds: [s1, s2],
                        instances: [
                          { seriesId: s1, title: inst1.title, date: inst1.date },
                          { seriesId: s2, title: inst2.title, date: inst2.date },
                        ],
                        date: inst1.date,
                        description: `${inst1.title} and ${inst2.title} are on adjacent days`,
                      })
                    }
                  }
                }
              }
            }
          }
          break
        }
      }
    }

    // 3. Chain cannot fit detection
    for (const [childId, link] of links) {
      const childInstances = instances.filter(i => i.seriesId === childId)
      const parentSeries = seriesById.get(link.parentId)
      if (!parentSeries) continue

      for (const childInst of childInstances) {
        const parentEnd = getParentEndTime(parentSeries, link.parentId, childInst.date)
        if (!parentEnd) continue

        const target = addMinutesToTime(parentEnd, link.distance || 0)
        const earliest = addMinutesToTime(target, -(link.earlyWobble || 0))
        const latest = addMinutesToTime(target, link.lateWobble || 0)

        // Use original pattern time (before chain adjustment) for conflict detection
        const originalTime = (childInst as any)._patternTime || childInst.time
        const childTimeStr = originalTime as string
        const earliestStr = earliest as string
        const latestStr = latest as string

        if (childTimeStr < earliestStr || childTimeStr > latestStr) {
          conflicts.push({
            type: 'chainCannotFit',
            seriesIds: [link.parentId, childId],
            instances: [
              { seriesId: childId, title: childInst.title, date: childInst.date },
            ],
            parentId: link.parentId,
            childId,
            description: `Child ${childInst.title} cannot fit within chain bounds`,
          })
        }
      }
    }

    return conflicts
  }

  function resolveConstraintTargetFromInstances(target: any, instances: ScheduleInstance[]): string[] {
    if (target.type === 'tag') {
      // Find series with this tag by checking all series in instances
      const seriesIds = new Set<string>()
      for (const inst of instances) {
        seriesIds.add(inst.seriesId)
      }
      const result: string[] = []
      // We need to check tags from the stored series
      for (const sid of seriesIds) {
        // Walk up to adapter to get tags... but we don't have series data here
        // Use a lookup approach
      }
      // Fallback: use tag resolution from seriesMap
      return resolveTagFromAdapter(target.tag)
    }
    return target.seriesId ? [target.seriesId] : []
  }

  // Tag resolution cache
  const tagCache = new Map<string, string[]>()
  function resolveTagFromAdapter(tag: string): string[] {
    return tagCache.get(tag) || []
  }

  function timesOverlap(timeA: LocalDateTime, durA: number, timeB: LocalDateTime, durB: number): boolean {
    if ((timeA as string) === (timeB as string)) return true
    const tA = timeOf(timeA)
    const tB = timeOf(timeB)
    const hA = hourOf(tA) * 60 + minuteOf(tA)
    const hB = hourOf(tB) * 60 + minuteOf(tB)
    const endA = hA + durA
    const endB = hB + durB
    return hA < endB && hB < endA
  }

  // ========== Series Management ==========

  async function createSeries(input: any): Promise<string> {
    if (!input.title || input.title.trim() === '') {
      throw new ValidationError('Series title is required')
    }

    const id = uuid()
    const now = makeDateTime(
      makeDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()),
      makeTime(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds())
    )

    const seriesData: any = {
      id,
      title: input.title,
      patterns: input.patterns || [],
      locked: false,
      tags: input.tags,
      startDate: input.startDate,
      endDate: input.endDate,
      cycling: input.cycling,
      adaptiveDuration: input.adaptiveDuration,
      createdAt: now,
      updatedAt: now,
    }

    await adapter.saveSeries(seriesData)

    // Cache full series object (including patterns) for buildSchedule
    seriesCache.set(id, { ...seriesData })

    // Update tag cache
    if (input.tags && Array.isArray(input.tags)) {
      for (const tag of input.tags) {
        if (!tagCache.has(tag)) tagCache.set(tag, [])
        tagCache.get(tag)!.push(id)
      }
    }

    await triggerReflow()
    return id as any
  }

  async function getSeries(id: string): Promise<any> {
    const s = await adapter.getSeries(id)
    if (!s) return null

    const result: any = { ...s }

    // Enrich with link info
    const link = links.get(id)
    if (link) {
      result.parentId = link.parentId
    }

    // Add reminderOffsets
    const reminderIds = remindersBySeriesMap.get(id) || []
    const offsets: number[] = []
    for (const rid of reminderIds) {
      const r = reminders.get(rid)
      if (r && r.offset != null) offsets.push(typeof r.offset === 'number' ? r.offset : 0)
    }
    if (offsets.length > 0) {
      result.reminderOffsets = offsets
    }

    return result
  }

  async function getAllSeries(): Promise<any[]> {
    const all = await adapter.getAllSeries()
    return all.filter(s => s && s.id).map(s => {
      const link = links.get(s.id)
      const result: any = { ...s }
      if (link) result.parentId = link.parentId
      return result
    })
  }

  async function getSeriesByTag(tag: string): Promise<any[]> {
    const all = await getAllSeries()
    return all.filter(s => s.tags && s.tags.includes(tag))
  }

  async function updateSeries(id: string, changes: any): Promise<void> {
    const s = await adapter.getSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)
    if (s.locked) throw new LockedSeriesError(`Series ${id} is locked`)

    const updated = { ...s, ...changes, id: s.id, createdAt: s.createdAt }
    updated.updatedAt = makeDateTime(
      makeDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()),
      makeTime(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds())
    )

    await adapter.saveSeries(updated)
    seriesCache.set(id, { ...updated })
    await triggerReflow()
  }

  async function lock(id: string): Promise<void> {
    const s = await adapter.getSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)
    const locked = { ...s, locked: true }
    await adapter.saveSeries(locked)
    if (seriesCache.has(id)) seriesCache.set(id, { ...seriesCache.get(id)!, locked: true })
  }

  async function unlock(id: string): Promise<void> {
    const s = await adapter.getSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)
    const unlocked = { ...s, locked: false }
    await adapter.saveSeries(unlocked)
    if (seriesCache.has(id)) seriesCache.set(id, { ...seriesCache.get(id)!, locked: false })
  }

  async function deleteSeries(id: string): Promise<void> {
    const seriesCompletions = completionsBySeries.get(id) || []
    if (seriesCompletions.length > 0) {
      throw new CompletionsExistError(`Cannot delete series ${id}: completions exist`)
    }
    const children = linksByParent.get(id) || []
    if (children.length > 0) {
      throw new LinkedChildrenExistError(`Cannot delete series ${id}: linked children exist`)
    }
    await adapter.deleteSeries(id)
    seriesCache.delete(id)
    await triggerReflow()
  }

  async function splitSeries(id: string, splitDate: LocalDate): Promise<string> {
    const s = await adapter.getSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)

    const originalEnd = addDays(splitDate, -1)
    const updatedOriginal = { ...(seriesCache.get(id) || s), endDate: originalEnd }
    await adapter.saveSeries(updatedOriginal)
    seriesCache.set(id, { ...updatedOriginal })

    const newId = uuid()
    const cachedOriginal = seriesCache.get(id) || s
    const newSeries = {
      ...cachedOriginal,
      id: newId,
      startDate: splitDate,
      endDate: s.endDate,
      cycling: s.cycling ? { ...s.cycling } : undefined,
      createdAt: s.createdAt,
      updatedAt: makeDateTime(
        makeDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()),
        makeTime(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds())
      ),
    }
    await adapter.saveSeries(newSeries)
    seriesCache.set(newId, { ...newSeries })
    await triggerReflow()
    return newId as any
  }

  // ========== Links ==========

  async function linkSeries(parentId: string, childId: string, options: any): Promise<void> {
    const parent = await adapter.getSeries(parentId)
    if (!parent) throw new NotFoundError(`Parent series ${parentId} not found`)
    const child = await adapter.getSeries(childId)
    if (!child) throw new NotFoundError(`Child series ${childId} not found`)

    if (parentId === childId) throw new CycleDetectedError('Cannot link series to itself')

    if (links.has(childId)) {
      throw new CycleDetectedError(`Series ${childId} is already linked`)
    }

    // Cycle detection
    let current = parentId
    let depth = 0
    while (links.has(current)) {
      current = links.get(current).parentId
      depth++
      if (current === childId) throw new CycleDetectedError('Linking would create a cycle')
      if (depth > 32) break
    }

    const chainDepth = getChainDepthSync(parentId) + 1
    if (chainDepth > 32) {
      throw new ChainDepthExceededError(`Chain depth ${chainDepth} exceeds maximum of 32`)
    }

    const linkData = {
      parentId,
      childId,
      distance: options.distance || 0,
      earlyWobble: options.earlyWobble,
      lateWobble: options.lateWobble,
    }

    links.set(childId, linkData)
    if (!linksByParent.has(parentId)) linksByParent.set(parentId, [])
    linksByParent.get(parentId)!.push(childId)

    if (adapter.saveLink) await adapter.saveLink(linkData)
    await triggerReflow()
  }

  function getChainDepthSync(seriesId: string): number {
    let depth = 0
    let current = seriesId
    while (links.has(current)) {
      current = links.get(current).parentId
      depth++
      if (depth > 33) return depth
    }
    return depth
  }

  async function unlinkSeries(childId: string): Promise<void> {
    const link = links.get(childId)
    if (link) {
      const parentChildren = linksByParent.get(link.parentId)
      if (parentChildren) {
        const idx = parentChildren.indexOf(childId)
        if (idx >= 0) parentChildren.splice(idx, 1)
      }
      links.delete(childId)
      if (adapter.deleteLink) await adapter.deleteLink(childId)
    }
    await triggerReflow()
  }

  // ========== Constraints ==========

  async function addConstraint(constraint: any): Promise<string> {
    const id = uuid()
    const data = { id, ...constraint }
    constraints.set(id, data)
    if (adapter.saveConstraint) await adapter.saveConstraint(data)
    await triggerReflow()
    return id
  }

  async function removeConstraint(id: string): Promise<void> {
    constraints.delete(id)
    if (adapter.deleteConstraint) await adapter.deleteConstraint(id)
    await triggerReflow()
  }

  async function getConstraints(): Promise<any[]> {
    return [...constraints.values()]
  }

  // ========== Instance Operations ==========

  async function getInstance(seriesId: string, date: LocalDate): Promise<any> {
    const s = await adapter.getSeries(seriesId)
    if (!s) return null

    const seriesStart = s.startDate || ('2000-01-01' as LocalDate)
    let found = false
    for (const pattern of s.patterns) {
      const dates = getPatternDates(pattern, date, date, seriesStart)
      if (dates.has(date)) {
        if (!pattern.condition || evaluateConditionForDate(pattern.condition, seriesId, date)) {
          found = true
          break
        }
      }
    }
    if (!found) return null

    const exKey = `${seriesId}:${date}`
    const exception = exceptions.get(exKey)
    if (exception?.type === 'cancelled') return null

    let instanceTime: LocalDateTime
    if (exception?.type === 'rescheduled' && exception.newTime) {
      instanceTime = exception.newTime
    } else {
      const pattern = s.patterns[0]
      const patternTime = pattern?.time || ('09:00:00' as LocalTime)
      const resolvedTime = resolveTimeForDate(date, patternTime, timezone)
      instanceTime = makeDateTime(date, resolvedTime)
    }

    return {
      seriesId,
      title: s.title,
      date,
      time: instanceTime,
    }
  }

  async function cancelInstance(seriesId: string, date: LocalDate): Promise<void> {
    const s = await adapter.getSeries(seriesId)
    if (!s) throw new NotFoundError(`Series ${seriesId} not found`)

    const seriesStart = s.startDate || ('2000-01-01' as LocalDate)
    let found = false
    for (const pattern of s.patterns) {
      const dates = getPatternDates(pattern, date, date, seriesStart)
      if (dates.has(date)) { found = true; break }
    }
    if (!found) {
      throw new NonExistentInstanceError(`No instance on ${date} for series ${seriesId}`)
    }

    const exKey = `${seriesId}:${date}`
    const existing = exceptions.get(exKey)
    if (existing?.type === 'cancelled') {
      throw new AlreadyCancelledError(`Instance on ${date} is already cancelled`)
    }

    exceptions.set(exKey, { seriesId, date, type: 'cancelled' })
    if (adapter.saveException) await adapter.saveException({ seriesId, date, type: 'cancelled' })
    await triggerReflow()
  }

  async function rescheduleInstance(seriesId: string, date: LocalDate, newTime: LocalDateTime): Promise<void> {
    const s = await adapter.getSeries(seriesId)
    if (!s) throw new NotFoundError(`Series ${seriesId} not found`)

    const exKey = `${seriesId}:${date}`
    const existing = exceptions.get(exKey)
    if (existing?.type === 'cancelled') {
      throw new CancelledInstanceError(`Cannot reschedule cancelled instance on ${date}`)
    }

    // Chain bounds validation
    const link = links.get(seriesId)
    if (link) {
      const parentSeries = await adapter.getSeries(link.parentId)
      if (parentSeries) {
        const parentEnd = getParentEndTime(parentSeries, link.parentId, date)
        if (parentEnd) {
          const target = addMinutesToTime(parentEnd, link.distance || 0)
          const earliest = addMinutesToTime(target, -(link.earlyWobble || 0))
          const latest = addMinutesToTime(target, link.lateWobble || 0)

          if ((newTime as string) < (earliest as string) || (newTime as string) > (latest as string)) {
            throw new ValidationError(`Reschedule time ${newTime} is outside chain bounds [${earliest}, ${latest}]`)
          }
        }
      }
    }

    exceptions.set(exKey, { seriesId, date, type: 'rescheduled', newTime })
    if (adapter.saveException) await adapter.saveException({ seriesId, date, type: 'rescheduled', newTime })
    await triggerReflow()
  }

  // ========== Completions ==========

  async function logCompletion(seriesId: string, date: LocalDate, options?: any): Promise<string> {
    const s = await adapter.getSeries(seriesId)
    if (!s) throw new NotFoundError(`Series ${seriesId} not found`)

    const key = `${seriesId}:${date}`
    if (completionsByKey.has(key)) {
      throw new DuplicateCompletionError(`Completion already exists for ${seriesId} on ${date}`)
    }

    const id = uuid()
    const completion: any = {
      id,
      seriesId,
      date,
      startTime: options?.startTime,
      endTime: options?.endTime,
    }

    completions.set(id, completion)
    completionsByKey.set(key, id)
    if (!completionsBySeries.has(seriesId)) completionsBySeries.set(seriesId, [])
    completionsBySeries.get(seriesId)!.push(id)

    if (adapter.saveCompletion) await adapter.saveCompletion(completion)
    await triggerReflow()
    return id
  }

  async function getCompletions(seriesId: string): Promise<any[]> {
    // Try adapter first for persistence support
    if (adapter.getCompletionsBySeries) {
      const fromAdapter = await adapter.getCompletionsBySeries(seriesId)
      if (fromAdapter && fromAdapter.length > 0) return fromAdapter
    }
    // Fallback to local state
    const ids = completionsBySeries.get(seriesId) || []
    return ids.map(id => completions.get(id)).filter(Boolean)
  }

  async function deleteCompletion(id: string): Promise<void> {
    const completion = completions.get(id)
    if (completion) {
      const key = `${completion.seriesId}:${completion.date}`
      completionsByKey.delete(key)
      const seriesIds = completionsBySeries.get(completion.seriesId)
      if (seriesIds) {
        const idx = seriesIds.indexOf(id)
        if (idx >= 0) seriesIds.splice(idx, 1)
      }
      completions.delete(id)
      if (adapter.deleteCompletion) await adapter.deleteCompletion(id)
    }
    await triggerReflow()
  }

  // ========== Schedule ==========

  async function getSchedule(start: LocalDate, end: LocalDate): Promise<Schedule> {
    // end is exclusive: getSchedule(Jan 15, Jan 16) = just Jan 15
    const lastDate = addDays(end, -1)
    if ((lastDate as string) < (start as string)) {
      return { instances: [], conflicts: [] }
    }
    return buildSchedule(start, lastDate)
  }

  async function getConflicts(): Promise<Conflict[]> {
    return [...cachedConflicts]
  }

  // ========== Reminders ==========

  async function createReminder(seriesId: string, options: any): Promise<string> {
    const id = uuid()
    const reminder = {
      id,
      seriesId,
      type: options.type,
      offset: typeof options.offset === 'number' ? options.offset : 0,
    }
    reminders.set(id, reminder)
    reminderAcks.set(id, new Set())

    if (!remindersBySeriesMap.has(seriesId)) remindersBySeriesMap.set(seriesId, [])
    remindersBySeriesMap.get(seriesId)!.push(id)

    if (adapter.saveReminder) await adapter.saveReminder(reminder)
    return id
  }

  async function getPendingReminders(asOf: LocalDateTime): Promise<PendingReminder[]> {
    const pending: PendingReminder[] = []
    const asOfDate = dateOf(asOf)

    for (const [id, reminder] of reminders) {
      const s = await adapter.getSeries(reminder.seriesId)
      if (!s) continue

      const acks = reminderAcks.get(id) || new Set()
      const seriesStart = s.startDate || ('2000-01-01' as LocalDate)

      for (const pattern of s.patterns) {
        // Only check today and tomorrow (not yesterday — yesterday's reminders are expired)
        const checkStart = asOfDate
        const checkEnd = addDays(asOfDate, 1)
        const dates = getPatternDates(pattern, checkStart, checkEnd, seriesStart)

        for (const date of dates) {
          const exKey = `${reminder.seriesId}:${date}`
          const exception = exceptions.get(exKey)
          if (exception?.type === 'cancelled') continue
          if (completionsByKey.has(exKey)) continue

          // Calculate fire time
          let instanceTime: LocalDateTime
          if (exception?.type === 'rescheduled' && exception.newTime) {
            instanceTime = exception.newTime
          } else if (pattern.allDay) {
            instanceTime = makeDateTime(date, makeTime(0, 0, 0))
          } else {
            const patternTime = normalizeTime(pattern?.time || ('09:00:00' as LocalTime))
            instanceTime = makeDateTime(date, patternTime)
          }

          const offsetMins = typeof reminder.offset === 'number' ? reminder.offset : 0
          const fireTime = subtractMinutes(instanceTime, offsetMins)

          if ((fireTime as string) <= (asOf as string)) {
            const ackKey = `${date}:${id}`
            if (!acks.has(ackKey)) {
              pending.push({
                id: reminder.id,
                seriesId: reminder.seriesId,
                type: reminder.type,
                offset: reminder.offset,
                offsetMinutes: offsetMins,
                instanceDate: date,
              })
            }
          }
        }
      }
    }

    return pending
  }

  async function checkReminders(asOf: LocalDateTime): Promise<void> {
    const pending = await getPendingReminders(asOf)
    for (const reminder of pending) {
      emit('reminderDue', Object.freeze({ ...reminder }))
    }
  }

  async function acknowledgeReminder(id: string, asOf: LocalDateTime): Promise<void> {
    if (!reminderAcks.has(id)) reminderAcks.set(id, new Set())
    const acks = reminderAcks.get(id)!
    const asOfDate = dateOf(asOf)

    const reminder = reminders.get(id)
    if (reminder) {
      const s = await adapter.getSeries(reminder.seriesId)
      if (s) {
        const seriesStart = s.startDate || ('2000-01-01' as LocalDate)
        for (const pattern of s.patterns) {
          const checkStart = addDays(asOfDate, -1)
          const checkEnd = addDays(asOfDate, 1)
          const dates = getPatternDates(pattern, checkStart, checkEnd, seriesStart)
          for (const date of dates) {
            acks.add(`${date}:${id}`)
          }
        }
      }
    }
  }

  // ========== Conditions ==========

  async function evaluateCondition(condition: any, date: LocalDate): Promise<boolean> {
    return evaluateConditionForDate(condition, '', date)
  }

  async function getActiveConditions(seriesId: string, date: LocalDate): Promise<any[]> {
    const s = await adapter.getSeries(seriesId)
    if (!s) return []

    const active: any[] = []
    for (const pattern of (s.patterns || [])) {
      if (pattern.condition) {
        const result = evaluateConditionForDate(pattern.condition, seriesId, date)
        active.push({
          condition: pattern.condition,
          active: result,
          patternType: pattern.type,
        })
      }
    }
    return active
  }

  // ========== Chain Depth ==========

  async function getChainDepthAsync(seriesId: string): Promise<number> {
    return getChainDepthSync(seriesId)
  }

  return {
    createSeries,
    getSeries,
    getAllSeries,
    getSeriesByTag,
    updateSeries,
    lock,
    unlock,
    deleteSeries,
    splitSeries,
    linkSeries,
    unlinkSeries,
    addConstraint,
    removeConstraint,
    getConstraints,
    getInstance,
    cancelInstance,
    rescheduleInstance,
    logCompletion,
    getCompletions,
    deleteCompletion,
    getSchedule,
    getConflicts,
    createReminder,
    getPendingReminders,
    checkReminders,
    acknowledgeReminder,
    evaluateCondition,
    getActiveConditions,
    getChainDepth: getChainDepthAsync,
    on,
  }
}
