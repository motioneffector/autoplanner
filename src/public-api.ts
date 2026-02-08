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
import { expandPattern, toExpandablePattern, type Pattern } from './pattern-expansion'
import type { Adapter, Completion, Condition } from './adapter'

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

export type { Adapter } from './adapter'

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

type InternalInstance = ScheduleInstance & { _patternTime?: LocalDateTime }

export type PendingReminder = {
  id: string
  seriesId: string
  type: string
  offset?: number
  offsetMinutes?: number
  instanceDate?: LocalDate
}

// ============================================================================
// Public Input/Output Types
// ============================================================================

export type ConditionNode =
  | { type: 'completionCount'; seriesRef: string; comparison: string; value: number; windowDays?: number }
  | { type: 'weekday'; days: number[] }
  | { type: 'and'; conditions: ConditionNode[] }
  | { type: 'or'; conditions: ConditionNode[] }
  | { type: 'not'; condition: ConditionNode }

export type PatternInput = {
  type: string
  time?: string
  n?: number
  day?: number
  dayOfMonth?: number
  month?: number
  weekday?: number | string
  dayOfWeek?: number
  allDay?: boolean
  duration?: number
  fixed?: boolean
  days?: number[]
  daysOfWeek?: number[]
  condition?: ConditionNode
}

export type CyclingInput = {
  mode?: string
  currentIndex?: number
  gapLeap?: boolean
  items: string[]
}

export type AdaptiveDurationInput = {
  fallback?: number
  lastN?: number
  multiplier?: number
  [key: string]: unknown
}

export type CreateSeriesInput = {
  title: string
  patterns?: PatternInput[]
  tags?: string[]
  startDate?: LocalDate
  endDate?: LocalDate
  cycling?: CyclingInput
  adaptiveDuration?: AdaptiveDurationInput
}

export type LinkOptions = {
  distance?: number
  earlyWobble?: number
  lateWobble?: number
}

export type ConstraintTarget =
  | { type: 'tag'; tag: string }
  | { type: 'seriesId'; seriesId: string }

export type ConstraintInput = {
  type: string
  firstSeries?: string
  secondSeries?: string
  target?: ConstraintTarget
  secondTarget?: ConstraintTarget
  withinMinutes?: number
  [key: string]: unknown
}

export type LogCompletionOptions = {
  startTime?: LocalDateTime
  endTime?: LocalDateTime
}

export type ReminderOptions = {
  type: string
  offset?: number
}

export type ActiveConditionInfo = {
  condition: ConditionNode
  active: boolean
  patternType: string
}

// ============================================================================
// Internal Types (not exported)
// ============================================================================

type EnrichedPattern = PatternInput & {
  id: string
  conditionId?: string | null
  _anchor?: LocalDate
}

type FullSeries = {
  id: string
  title: string
  description?: string
  createdAt: LocalDateTime
  updatedAt?: LocalDateTime
  locked?: boolean
  startDate?: LocalDate
  endDate?: LocalDate
  patterns: EnrichedPattern[]
  tags?: string[]
  cycling?: CyclingInput
  adaptiveDuration?: AdaptiveDurationInput
  parentId?: string
  reminderOffsets?: number[]
  [key: string]: unknown
}

type InternalCompletion = {
  id: string
  seriesId: string
  date: LocalDate
  instanceDate: LocalDate
  startTime?: LocalDateTime
  endTime?: LocalDateTime
}

type InternalException = {
  seriesId: string
  date: LocalDate
  type: 'cancelled' | 'rescheduled'
  newTime?: LocalDateTime
}

type InternalLink = {
  parentId: string
  childId: string
  distance: number
  earlyWobble?: number
  lateWobble?: number
}

type StoredConstraint = ConstraintInput & { id: string }

type InternalReminder = {
  id: string
  seriesId: string
  type: string
  offset?: number
}

export type Autoplanner = {
  createSeries(input: CreateSeriesInput): Promise<string>
  getSeries(id: string): Promise<FullSeries | null>
  getAllSeries(): Promise<FullSeries[]>
  getSeriesByTag(tag: string): Promise<FullSeries[]>
  updateSeries(id: string, changes: Partial<CreateSeriesInput>): Promise<void>
  lock(id: string): Promise<void>
  unlock(id: string): Promise<void>
  deleteSeries(id: string): Promise<void>
  splitSeries(id: string, splitDate: LocalDate): Promise<string>
  linkSeries(parentId: string, childId: string, options: LinkOptions): Promise<void>
  unlinkSeries(childId: string): Promise<void>
  addConstraint(constraint: ConstraintInput): Promise<string>
  removeConstraint(id: string): Promise<void>
  getConstraints(): Promise<StoredConstraint[]>
  getInstance(seriesId: string, date: LocalDate): Promise<ScheduleInstance | null>
  cancelInstance(seriesId: string, date: LocalDate): Promise<void>
  rescheduleInstance(seriesId: string, date: LocalDate, newTime: LocalDateTime): Promise<void>
  logCompletion(seriesId: string, date: LocalDate, options?: LogCompletionOptions): Promise<string>
  getCompletions(seriesId: string): Promise<Completion[]>
  deleteCompletion(id: string): Promise<void>
  getSchedule(start: LocalDate, end: LocalDate): Promise<Schedule>
  getConflicts(): Promise<Conflict[]>
  createReminder(seriesId: string, options: ReminderOptions): Promise<string>
  getPendingReminders(asOf: LocalDateTime): Promise<PendingReminder[]>
  checkReminders(asOf: LocalDateTime): Promise<void>
  acknowledgeReminder(id: string, asOf: LocalDateTime): Promise<void>
  evaluateCondition(condition: ConditionNode, date: LocalDate): Promise<boolean>
  getActiveConditions(seriesId: string, date: LocalDate): Promise<ActiveConditionInfo[]>
  getChainDepth(seriesId: string): Promise<number>
  hydrate(): Promise<void>
  on(event: string, handler: (...args: unknown[]) => void): void
}

// ============================================================================
// Mock Adapter
// ============================================================================


// ============================================================================
// SQLite Adapter Re-export
// ============================================================================


// ============================================================================
// Helpers
// ============================================================================

const WEEKDAY_NAMES: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function numToWeekday(n: number): Weekday {
  return WEEKDAY_NAMES[((n % 7) + 7) % 7]!
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
  const [hS, mS, sS] = (normalized as string).split(':') as [string, string, string]
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

function getPatternDates(pattern: EnrichedPattern, start: LocalDate, end: LocalDate, seriesStart: LocalDate): Set<LocalDate> {
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
  if (!isValidTimezone(config.timezone)) {
    throw new ValidationError(`Invalid timezone: ${config.timezone}`)
  }

  const adapter = config.adapter
  const timezone = config.timezone

  // Internal state
  const seriesCache = new Map<string, FullSeries>()
  const completions = new Map<string, InternalCompletion>()
  const completionsByKey = new Map<string, string>()
  const completionsBySeries = new Map<string, string[]>()
  const exceptions = new Map<string, InternalException>()
  const links = new Map<string, InternalLink>()
  const linksByParent = new Map<string, string[]>()
  const constraints = new Map<string, StoredConstraint>()
  const reminders = new Map<string, InternalReminder>()
  const remindersBySeriesMap = new Map<string, string[]>()
  const reminderAcks = new Map<string, Set<string>>()

  // ========== Adapter Helpers ==========
  // Load a complete "fat" series object from the adapter's normalized data.
  // Assembles patterns, conditions, tags, cycling, and adaptive duration
  // into a single object matching the internal representation.

  function reconstructConditionTree(
    rootId: string,
    conditionsById: Map<string, Condition>,
    childrenByParent: Map<string, Condition[]>,
  ): ConditionNode | null {
    const cond = conditionsById.get(rootId)
    if (!cond) return null
    const result: Record<string, unknown> = { ...cond }
    delete result.id
    delete result.seriesId
    delete result.parentId
    if (cond.type === 'and' || cond.type === 'or') {
      const children = childrenByParent.get(rootId) || []
      result.conditions = children
        .map((c: Condition) => reconstructConditionTree(c.id, conditionsById, childrenByParent))
        .filter(Boolean)
    } else if (cond.type === 'not') {
      const children = childrenByParent.get(rootId) || []
      if (children.length > 0) {
        result.condition = reconstructConditionTree(children[0]!.id, conditionsById, childrenByParent)
      }
    }
    return result as unknown as ConditionNode
  }

  async function loadFullSeries(id: string): Promise<FullSeries | null> {
    const s = await adapter.getSeries(id)
    if (!s) return null
    const result = { ...s } as FullSeries

    // Patterns + weekdays
    const patterns = await adapter.getPatternsBySeries(id)
    const enrichedPatterns: EnrichedPattern[] = []
    for (const p of patterns) {
      const pat = { ...p } as EnrichedPattern
      const weekdays = await adapter.getPatternWeekdays(p.id)
      if (weekdays.length > 0) pat.days = weekdays.map((d: string) => Number(d))
      // Remove adapter-level fields not expected by internal code
      delete (pat as Record<string, unknown>).seriesId
      enrichedPatterns.push(pat)
    }
    result.patterns = enrichedPatterns

    // Conditions (for pattern condition trees)
    const conditions = await adapter.getConditionsBySeries(id)
    if (conditions.length > 0) {
      const conditionsById = new Map<string, Condition>()
      const childrenByParent = new Map<string, Condition[]>()
      for (const c of conditions) {
        conditionsById.set(c.id, c)
        if (c.parentId) {
          if (!childrenByParent.has(c.parentId)) childrenByParent.set(c.parentId, [])
          childrenByParent.get(c.parentId)!.push(c)
        }
      }
      // Attach condition trees to patterns
      for (const pat of result.patterns) {
        if (pat.conditionId && conditionsById.has(pat.conditionId)) {
          const tree = reconstructConditionTree(pat.conditionId, conditionsById, childrenByParent)
          if (tree) pat.condition = tree
        }
      }
    }

    // Tags
    const tags = await adapter.getTagsForSeries(id)
    if (tags.length > 0) result.tags = tags.map((t: { name: string }) => t.name)

    // Cycling
    const cycling = await adapter.getCyclingConfig(id)
    if (cycling) {
      const items = await adapter.getCyclingItems(id)
      result.cycling = {
        ...(cycling.mode != null ? { mode: cycling.mode } : {}),
        currentIndex: cycling.currentIndex,
        ...(cycling.gapLeap != null ? { gapLeap: cycling.gapLeap } : {}),
        items: items.map((i: { title: string }) => i.title),
      }
    }

    // Adaptive duration
    const adaptive = await adapter.getAdaptiveDuration(id)
    if (adaptive) result.adaptiveDuration = adaptive as AdaptiveDurationInput

    return result
  }

  async function loadAllFullSeries(): Promise<FullSeries[]> {
    const allSeries = await adapter.getAllSeries()
    const results: FullSeries[] = []
    for (const s of allSeries) {
      if (s && s.id) {
        const full = await loadFullSeries(s.id)
        if (full) results.push(full)
      }
    }
    return results
  }

  // Cache-aware series loading: prefers seriesCache, falls back to adapter
  async function getFullSeries(id: string): Promise<FullSeries | null> {
    if (seriesCache.has(id)) return { ...seriesCache.get(id)! }
    return loadFullSeries(id)
  }

  // Persist a new fat series object into the adapter's normalized tables
  async function persistNewSeries(data: FullSeries): Promise<void> {
    await adapter.createSeries({
      id: data.id,
      title: data.title,
      createdAt: data.createdAt,
      ...(data.locked != null ? { locked: data.locked } : {}),
      ...(data.startDate != null ? { startDate: data.startDate } : {}),
      ...(data.endDate != null ? { endDate: data.endDate } : {}),
      ...(data.updatedAt != null ? { updatedAt: data.updatedAt } : {}),
    })

    if (data.patterns && Array.isArray(data.patterns)) {
      for (const p of data.patterns) {
        let condId: string | null = null
        if (p.condition) {
          condId = await persistConditionTree(data.id, p.condition, null)
        }
        const patternId = uuid()
        await adapter.createPattern({
          id: patternId,
          seriesId: data.id,
          type: p.type,
          conditionId: condId,
          ...(p.time != null ? { time: p.time } : {}),
          ...(p.n != null ? { n: p.n } : {}),
          ...(p.day != null ? { day: p.day } : {}),
          ...(p.month != null ? { month: p.month } : {}),
          ...(p.weekday != null ? { weekday: p.weekday } : {}),
          ...(p.allDay != null ? { allDay: p.allDay } : {}),
          ...(p.duration != null ? { duration: p.duration } : {}),
          ...(p.fixed != null ? { fixed: p.fixed } : {}),
        })
        if (p.days && Array.isArray(p.days)) {
          await adapter.setPatternWeekdays(patternId, p.days.map(String))
        }
        if (p.daysOfWeek && Array.isArray(p.daysOfWeek)) {
          await adapter.setPatternWeekdays(patternId, p.daysOfWeek.map(String))
        }
      }
    }

    if (data.tags && Array.isArray(data.tags)) {
      for (const tag of data.tags) {
        await adapter.addTagToSeries(data.id, tag)
      }
    }

    if (data.cycling) {
      await adapter.setCyclingConfig(data.id, {
        seriesId: data.id,
        currentIndex: data.cycling.currentIndex ?? 0,
        gapLeap: data.cycling.gapLeap ?? false,
        ...(data.cycling.mode != null ? { mode: data.cycling.mode } : {}),
      })
      if (data.cycling.items && Array.isArray(data.cycling.items)) {
        await adapter.setCyclingItems(data.id,
          data.cycling.items.map((title: string, i: number) => ({
            seriesId: data.id,
            position: i,
            title,
            duration: 0,
          }))
        )
      }
    }

    if (data.adaptiveDuration) {
      await adapter.setAdaptiveDuration(data.id, {
        seriesId: data.id,
        ...data.adaptiveDuration,
      } as import('./adapter').AdaptiveDurationConfig)
    }
  }

  // Persist a condition tree recursively, return root condition ID
  async function persistConditionTree(seriesId: string, condition: ConditionNode, parentId: string | null): Promise<string> {
    const id = uuid()
    // Use record view for serialization — condition fields vary by type
    const c = condition as Record<string, unknown>
    await adapter.createCondition({
      id,
      seriesId,
      parentId,
      type: condition.type,
      ...(c.operator != null ? { operator: c.operator as string } : {}),
      ...(c.comparison != null ? { comparison: c.comparison as string } : {}),
      ...(c.value != null ? { value: c.value as number } : {}),
      ...(c.windowDays != null ? { windowDays: c.windowDays as number } : {}),
      ...(c.seriesRef != null ? { seriesRef: c.seriesRef as string } : {}),
      ...(c.days != null ? { days: c.days as number[] } : {}),
    })

    if ((condition.type === 'and' || condition.type === 'or') && condition.conditions) {
      for (const child of condition.conditions) {
        await persistConditionTree(seriesId, child, id)
      }
    } else if (condition.type === 'not' && condition.condition) {
      await persistConditionTree(seriesId, condition.condition, id)
    }
    return id
  }

  // Update only the core series fields in the adapter (not patterns/tags/etc)
  async function updatePersistedSeries(id: string, changes: Record<string, unknown>): Promise<void> {
    await adapter.updateSeries(id, changes)
  }

  // Event handlers
  const eventHandlers = new Map<string, ((...args: unknown[]) => void)[]>()
  let cachedConflicts: Conflict[] = []

  function emit(event: string, ...args: unknown[]) {
    const handlers = eventHandlers.get(event) || []
    for (const handler of handlers) {
      try { handler(...args) } catch { /* isolated */ }
    }
  }

  function on(event: string, handler: (...args: unknown[]) => void) {
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
  function evaluateConditionForDate(condition: ConditionNode, seriesId: string, asOf: LocalDate): boolean {
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
        return (condition.conditions || []).every((c: ConditionNode) =>
          evaluateConditionForDate(c, seriesId, asOf)
        )
      case 'or':
        return (condition.conditions || []).some((c: ConditionNode) =>
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
  function getCyclingTitle(series: FullSeries, seriesId: string): string {
    const cycling = series.cycling
    if (!cycling || !cycling.items || cycling.items.length === 0) return series.title

    const items = cycling.items
    const mode = cycling.mode || 'sequential'

    if (mode === 'random') {
      // Use a hash of series id + completion count for pseudo-random
      const completionCount = (completionsBySeries.get(seriesId) || []).length
      const hash = simpleHash(seriesId + ':' + completionCount)
      return items[hash % items.length]!
    }

    // Sequential mode: use completion count
    const completionCount = (completionsBySeries.get(seriesId) || []).length
    const index = completionCount % items.length
    return items[index]!
  }

  // Calculate adaptive duration for a series
  function calculateAdaptiveDuration(seriesId: string, config: AdaptiveDurationInput): number | null {
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
  function getParentEndTime(parentSeries: FullSeries, parentId: string, instanceDate: LocalDate): LocalDateTime | null {
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
      const patternTime = normalizeTime((pattern?.time || '09:00:00') as LocalTime)
      const resolvedTime = resolveTimeForDate(instanceDate, patternTime, timezone)
      const parentTime = makeDateTime(instanceDate, resolvedTime)
      const parentDur = getSeriesDuration(parentSeries)
      return addMinutesToTime(parentTime, parentDur)
    }

    return null
  }

  function getSeriesDuration(series: FullSeries): number {
    if (series.patterns && series.patterns.length > 0) {
      return series.patterns[0]!.duration || 60
    }
    return 60
  }

  // Build schedule for [start, end] — both ends inclusive
  async function buildSchedule(start: LocalDate, end: LocalDate): Promise<Schedule> {
    // Use local cache if available (has full data including patterns),
    // fall back to adapter for series created outside the planner
    const adapterSeries = await loadAllFullSeries()
    const allSeries: FullSeries[] = []
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
    const seriesById = new Map<string, FullSeries>()
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
    function resolveConstraintTarget(target: ConstraintTarget): string[] {
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
            const patternTime = (pattern.time || '09:00:00') as LocalTime
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

          const inst: InternalInstance = {
            seriesId: s.id,
            title,
            date: instanceDate,
            time: instanceTime,
          }
          if (duration != null) inst.duration = duration
          if (pattern.fixed != null) inst.fixed = pattern.fixed
          if (isAllDay) inst.allDay = true
          inst._patternTime = patternTimeOriginal
          instances.push(inst)
        }
      }
    }

    instances.sort((a, b) => (a.time as string).localeCompare(b.time as string))

    const conflicts = detectConflicts(instances, allConstraintsList, seriesById)
    return { instances, conflicts }
  }

  function detectConflicts(
    instances: ScheduleInstance[],
    allConstraintsList: StoredConstraint[],
    seriesById: Map<string, FullSeries>
  ): Conflict[] {
    const conflicts: Conflict[] = []

    // 1. Fixed-fixed overlap detection
    const fixedInstances = instances.filter(i => i.fixed && !i.allDay)
    for (let i = 0; i < fixedInstances.length; i++) {
      for (let j = i + 1; j < fixedInstances.length; j++) {
        const a = fixedInstances[i]!
        const b = fixedInstances[j]!
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
                  seriesIds: [constraint.firstSeries!, constraint.secondSeries!],
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
            const d1 = sortedDates[i]!
            const d2 = sortedDates[i + 1]!
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
        const originalTime = (childInst as InternalInstance)._patternTime || childInst.time
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

  function resolveConstraintTargetFromInstances(target: ConstraintTarget, instances: ScheduleInstance[]): string[] {
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

  async function createSeries(input: CreateSeriesInput): Promise<string> {
    if (!input.title || input.title.trim() === '') {
      throw new ValidationError('Series title is required')
    }

    const id = uuid()
    const now = makeDateTime(
      makeDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()),
      makeTime(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds())
    )

    const seriesData: FullSeries = {
      id,
      title: input.title,
      patterns: (input.patterns || []) as EnrichedPattern[],
      locked: false,
      createdAt: now,
      updatedAt: now,
      ...(input.tags != null ? { tags: input.tags } : {}),
      ...(input.startDate != null ? { startDate: input.startDate } : {}),
      ...(input.endDate != null ? { endDate: input.endDate } : {}),
      ...(input.cycling != null ? { cycling: input.cycling } : {}),
      ...(input.adaptiveDuration != null ? { adaptiveDuration: input.adaptiveDuration } : {}),
    }

    await persistNewSeries(seriesData)

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
    return id
  }

  async function getSeries(id: string): Promise<FullSeries | null> {
    const s = await getFullSeries(id)
    if (!s) return null

    const result: FullSeries = { ...s }

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

  async function getAllSeries(): Promise<FullSeries[]> {
    const all = await loadAllFullSeries()
    return all.filter(s => s && s.id).map(s => {
      const link = links.get(s.id)
      const result: FullSeries = { ...s }
      if (link) result.parentId = link.parentId
      return result
    })
  }

  async function getSeriesByTag(tag: string): Promise<FullSeries[]> {
    const all = await getAllSeries()
    return all.filter(s => s.tags && s.tags.includes(tag))
  }

  async function updateSeries(id: string, changes: Partial<CreateSeriesInput>): Promise<void> {
    const s = await getFullSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)
    if (s.locked) throw new LockedSeriesError(`Series ${id} is locked`)

    const updated = { ...s, ...changes, id: s.id, createdAt: s.createdAt }
    updated.updatedAt = makeDateTime(
      makeDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()),
      makeTime(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds())
    )

    await updatePersistedSeries(id, { ...changes, updatedAt: updated.updatedAt })
    seriesCache.set(id, { ...updated } as FullSeries)
    await triggerReflow()
  }

  async function lock(id: string): Promise<void> {
    const s = await getFullSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)
    await updatePersistedSeries(id, { locked: true })
    if (seriesCache.has(id)) seriesCache.set(id, { ...seriesCache.get(id)!, locked: true })
  }

  async function unlock(id: string): Promise<void> {
    const s = await getFullSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)
    await updatePersistedSeries(id, { locked: false })
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
    const s = await getFullSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)

    const originalEnd = addDays(splitDate, -1)
    const updatedOriginal = { ...(seriesCache.get(id) || s), endDate: originalEnd }
    await updatePersistedSeries(id, { endDate: originalEnd })
    seriesCache.set(id, { ...updatedOriginal })

    const newId = uuid()
    const cachedOriginal = seriesCache.get(id) || s
    const newSeries: FullSeries = {
      ...cachedOriginal,
      id: newId,
      startDate: splitDate,
      ...(s.endDate != null ? { endDate: s.endDate } : {}),
      ...(s.cycling ? { cycling: { ...s.cycling } } : {}),
      createdAt: s.createdAt,
      updatedAt: makeDateTime(
        makeDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()),
        makeTime(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds())
      ),
    }
    await persistNewSeries(newSeries)
    seriesCache.set(newId, { ...newSeries })
    await triggerReflow()
    return newId
  }

  // ========== Links ==========

  async function linkSeries(parentId: string, childId: string, options: LinkOptions): Promise<void> {
    const parent = await getFullSeries(parentId)
    if (!parent) throw new NotFoundError(`Parent series ${parentId} not found`)
    const child = await getFullSeries(childId)
    if (!child) throw new NotFoundError(`Child series ${childId} not found`)

    if (parentId === childId) throw new CycleDetectedError('Cannot link series to itself')

    if (links.has(childId)) {
      throw new CycleDetectedError(`Series ${childId} is already linked`)
    }

    // Cycle detection
    let current = parentId
    let depth = 0
    while (links.has(current)) {
      current = links.get(current)!.parentId
      depth++
      if (current === childId) throw new CycleDetectedError('Linking would create a cycle')
      if (depth > 32) break
    }

    const chainDepth = getChainDepthSync(parentId) + 1
    if (chainDepth > 32) {
      throw new ChainDepthExceededError(`Chain depth ${chainDepth} exceeds maximum of 32`)
    }

    const linkData: InternalLink = {
      parentId,
      childId,
      distance: options.distance || 0,
      ...(options.earlyWobble != null ? { earlyWobble: options.earlyWobble } : {}),
      ...(options.lateWobble != null ? { lateWobble: options.lateWobble } : {}),
    }

    links.set(childId, linkData)
    if (!linksByParent.has(parentId)) linksByParent.set(parentId, [])
    linksByParent.get(parentId)!.push(childId)

    await adapter.createLink({
      id: uuid(),
      parentSeriesId: parentId,
      childSeriesId: childId,
      targetDistance: options.distance || 0,
      earlyWobble: options.earlyWobble ?? 0,
      lateWobble: options.lateWobble ?? 0,
    })
    await triggerReflow()
  }

  function getChainDepthSync(seriesId: string): number {
    let depth = 0
    let current = seriesId
    while (links.has(current)) {
      current = links.get(current)!.parentId
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
      const adapterLink = await adapter.getLinkByChild(childId)
      if (adapterLink) await adapter.deleteLink(adapterLink.id)
    }
    await triggerReflow()
  }

  // ========== Constraints ==========

  async function addConstraint(constraint: ConstraintInput): Promise<string> {
    const id = uuid()
    const data = { id, ...constraint }
    constraints.set(id, data)
    await adapter.createRelationalConstraint({
      id,
      type: constraint.type,
      sourceTarget: constraint.target ?? { seriesId: constraint.firstSeries! },
      destinationTarget: constraint.secondTarget ?? { seriesId: constraint.secondSeries! },
      ...(constraint.withinMinutes != null ? { withinMinutes: constraint.withinMinutes } : {}),
    })
    await triggerReflow()
    return id
  }

  async function removeConstraint(id: string): Promise<void> {
    constraints.delete(id)
    await adapter.deleteRelationalConstraint(id)
    await triggerReflow()
  }

  async function getConstraints(): Promise<StoredConstraint[]> {
    return [...constraints.values()]
  }

  // ========== Instance Operations ==========

  async function getInstance(seriesId: string, date: LocalDate): Promise<ScheduleInstance | null> {
    const s = await getFullSeries(seriesId)
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
      const patternTime = (pattern?.time || '09:00:00') as LocalTime
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
    const s = await getFullSeries(seriesId)
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
    await adapter.createInstanceException({
      id: uuid(), seriesId, originalDate: date, type: 'cancelled',
    })
    await triggerReflow()
  }

  async function rescheduleInstance(seriesId: string, date: LocalDate, newTime: LocalDateTime): Promise<void> {
    const s = await getFullSeries(seriesId)
    if (!s) throw new NotFoundError(`Series ${seriesId} not found`)

    const exKey = `${seriesId}:${date}`
    const existing = exceptions.get(exKey)
    if (existing?.type === 'cancelled') {
      throw new CancelledInstanceError(`Cannot reschedule cancelled instance on ${date}`)
    }

    // Chain bounds validation
    const link = links.get(seriesId)
    if (link) {
      const parentSeries = await getFullSeries(link.parentId)
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
    await adapter.createInstanceException({
      id: uuid(), seriesId, originalDate: date, type: 'rescheduled', newTime,
    })
    await triggerReflow()
  }

  // ========== Completions ==========

  async function logCompletion(seriesId: string, date: LocalDate, options?: LogCompletionOptions): Promise<string> {
    const s = await getFullSeries(seriesId)
    if (!s) throw new NotFoundError(`Series ${seriesId} not found`)

    const key = `${seriesId}:${date}`
    if (completionsByKey.has(key)) {
      throw new DuplicateCompletionError(`Completion already exists for ${seriesId} on ${date}`)
    }

    const id = uuid()
    const completion: InternalCompletion = {
      id,
      seriesId,
      date,
      instanceDate: date,
      ...(options?.startTime != null ? { startTime: options.startTime } : {}),
      ...(options?.endTime != null ? { endTime: options.endTime } : {}),
    }

    completions.set(id, completion)
    completionsByKey.set(key, id)
    if (!completionsBySeries.has(seriesId)) completionsBySeries.set(seriesId, [])
    completionsBySeries.get(seriesId)!.push(id)

    await adapter.createCompletion({
      id,
      seriesId,
      instanceDate: date,
      date,
      ...(options?.startTime != null ? { startTime: options.startTime } : {}),
      ...(options?.endTime != null ? { endTime: options.endTime } : {}),
    })
    await triggerReflow()
    return id
  }

  async function getCompletions(seriesId: string): Promise<Completion[]> {
    // Try adapter first for persistence support
    const fromAdapter = await adapter.getCompletionsBySeries(seriesId)
    if (fromAdapter && fromAdapter.length > 0) return fromAdapter
    // Fallback to local state
    const ids = completionsBySeries.get(seriesId) || []
    return ids.map(id => completions.get(id)).filter((c): c is InternalCompletion => c != null) as Completion[]
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
      await adapter.deleteCompletion(id)
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

  async function createReminder(seriesId: string, options: ReminderOptions): Promise<string> {
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

    await adapter.createReminder({
      id,
      seriesId,
      minutesBefore: typeof options.offset === 'number' ? options.offset : 0,
      label: options.type || '',
    })
    return id
  }

  async function getPendingReminders(asOf: LocalDateTime): Promise<PendingReminder[]> {
    const pending: PendingReminder[] = []
    const asOfDate = dateOf(asOf)

    for (const [id, reminder] of reminders) {
      const s = await getFullSeries(reminder.seriesId)
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
            const patternTime = normalizeTime((pattern?.time || '09:00:00') as LocalTime)
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
                ...(reminder.offset != null ? { offset: reminder.offset } : {}),
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
      const s = await getFullSeries(reminder.seriesId)
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

  async function evaluateCondition(condition: ConditionNode, date: LocalDate): Promise<boolean> {
    return evaluateConditionForDate(condition, '', date)
  }

  async function getActiveConditions(seriesId: string, date: LocalDate): Promise<ActiveConditionInfo[]> {
    const s = await getFullSeries(seriesId)
    if (!s) return []

    const active: ActiveConditionInfo[] = []
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

  // ========== Hydration ==========
  // Load persisted state from adapter into in-memory maps.
  // Call once after createAutoplanner() when using a persistent adapter.

  async function hydrate(): Promise<void> {
    // Hydrate links
    const allLinks = await adapter.getAllLinks()
    for (const l of allLinks) {
      const childId = l.childSeriesId
      const parentId = l.parentSeriesId
      if (!links.has(childId)) {
        links.set(childId, { parentId, childId, distance: l.targetDistance, earlyWobble: l.earlyWobble, lateWobble: l.lateWobble })
        if (!linksByParent.has(parentId)) linksByParent.set(parentId, [])
        if (!linksByParent.get(parentId)!.includes(childId)) {
          linksByParent.get(parentId)!.push(childId)
        }
      }
    }

    // Hydrate completions
    const allComps = await adapter.getAllCompletions()
    for (const c of allComps) {
      if (!completions.has(c.id)) {
        completions.set(c.id, c)
        const dateKey = `${c.seriesId}:${c.date ?? c.instanceDate}`
        completionsByKey.set(dateKey, c.id)
        if (!completionsBySeries.has(c.seriesId)) completionsBySeries.set(c.seriesId, [])
        if (!completionsBySeries.get(c.seriesId)!.includes(c.id)) {
          completionsBySeries.get(c.seriesId)!.push(c.id)
        }
      }
    }

    // Hydrate exceptions
    const allExceptions = await adapter.getAllExceptions()
    for (const e of allExceptions) {
      const key = `${e.seriesId}:${e.originalDate}`
      if (!exceptions.has(key)) {
        exceptions.set(key, {
          seriesId: e.seriesId,
          date: e.originalDate,
          type: e.type as 'cancelled' | 'rescheduled',
          ...(e.newTime != null ? { newTime: e.newTime } : {}),
        })
      }
    }
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
    hydrate,
    on,
  }
}
