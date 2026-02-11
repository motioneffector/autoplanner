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
import type { Adapter, Completion } from './adapter'
import {
  loadFullSeries as _loadFullSeries,
  loadAllFullSeries as _loadAllFullSeries,
  persistNewSeries as _persistNewSeries,
  persistConditionTree,
} from './series-assembly'
import { reflow, type ReflowInput } from './reflow'
import type { SeriesId } from './types'

// ============================================================================
// Error Classes
// ============================================================================

export {
  ValidationError, NotFoundError, LockedSeriesError,
  CompletionsExistError, LinkedChildrenExistError,
  NonExistentInstanceError, AlreadyCancelledError, CancelledInstanceError,
  CycleDetectedError, ChainDepthExceededError, DuplicateCompletionError,
} from './errors'
import {
  ValidationError, NotFoundError, LockedSeriesError,
  CompletionsExistError, LinkedChildrenExistError,
  NonExistentInstanceError, AlreadyCancelledError, CancelledInstanceError,
  CycleDetectedError, ChainDepthExceededError, DuplicateCompletionError,
} from './errors'

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

type InternalInstance = ScheduleInstance & { _patternTime?: LocalDateTime; _hasExplicitTime?: boolean }

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

export type EnrichedPattern = PatternInput & {
  id: string
  conditionId?: string | null
  _anchor?: LocalDate
}

export type FullSeries = {
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

export type StoredConstraint = ConstraintInput & { id: string }

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
  getCacheStats(): { patternHits: number; patternMisses: number; cspHits: number; cspMisses: number }
  getConditionDeps(): Map<string, Set<string>>
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
  // Handle short formats: '8:30' → '08:30:00', '08:30' → '08:30:00'
  const parts = s.split(':')
  const h = (parts[0] || '00').padStart(2, '0')
  const m = (parts[1] || '00').padStart(2, '0')
  const sec = (parts[2] || '00').padStart(2, '0')
  return `${h}:${m}:${sec}` as LocalTime
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
      while ((d as string) < (end as string)) {
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
        if (day > daysInMonth(y, month)) continue // skip Feb 29 on non-leap years etc.
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

  // Find first Monday on or before the effective start to establish week grid
  let monday = effectiveStart
  while (dayOfWeekNum(monday) !== 1) {
    monday = addDays(monday, -1)
  }

  // Generate dates from Monday-aligned weeks
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

  // ========== Schedule Cache State ==========
  let cacheGeneration = 0
  const scheduleResultCache = new Map<string, { generation: number; schedule: Schedule }>()
  let cacheStats = { patternHits: 0, patternMisses: 0, cspHits: 0, cspMisses: 0 }

  // ========== Condition Dependency Index ==========
  // Reverse index: targetSeriesId → Set<dependentSeriesId>
  const conditionDeps = new Map<string, Set<string>>()

  function collectConditionRefs(condition: ConditionNode, seriesId: string): void {
    switch (condition.type) {
      case 'completionCount':
        if (condition.seriesRef !== 'self') {
          if (!conditionDeps.has(condition.seriesRef)) {
            conditionDeps.set(condition.seriesRef, new Set())
          }
          conditionDeps.get(condition.seriesRef)!.add(seriesId)
        }
        break
      case 'and':
        for (const c of condition.conditions) collectConditionRefs(c, seriesId)
        break
      case 'or':
        for (const c of condition.conditions) collectConditionRefs(c, seriesId)
        break
      case 'not':
        collectConditionRefs(condition.condition, seriesId)
        break
    }
  }

  function buildConditionDependencyIndex(): void {
    conditionDeps.clear()
    for (const [id, series] of seriesCache) {
      for (const pattern of series.patterns || []) {
        if (pattern.condition) {
          collectConditionRefs(pattern.condition, id)
        }
      }
    }
  }

  // ========== Pattern Date Cache ==========
  // Key: "seriesId:patternIdx:start:end:anchor" → Set<LocalDate>
  const patternDateCache = new Map<string, Set<LocalDate>>()

  function getCachedPatternDates(
    pattern: EnrichedPattern, start: LocalDate, end: LocalDate,
    seriesStart: LocalDate, seriesId: string, patternIdx: number,
    anchor: LocalDate | undefined
  ): Set<LocalDate> {
    const key = `${seriesId}:${patternIdx}:${start}:${end}:${anchor ?? 'none'}`
    const cached = patternDateCache.get(key)
    if (cached) { cacheStats.patternHits++; return cached }
    cacheStats.patternMisses++
    const result = getPatternDates(pattern, start, end, seriesStart)
    patternDateCache.set(key, result)
    return result
  }

  function evictPatternCacheForSeries(seriesId: string): void {
    for (const key of [...patternDateCache.keys()]) {
      if (key.startsWith(seriesId + ':')) patternDateCache.delete(key)
    }
  }

  // ========== Invalidation Scope ==========
  type InvalidationScope = {
    type: 'series'; seriesId: string
  } | {
    type: 'global'
  } | {
    type: 'link' | 'constraint' | 'exception' | 'completion'
  }

  // ========== CSP Fingerprint Cache ==========
  // Content-addressable: fingerprint of day's CSP inputs → solver output
  // NEVER cleared for correctness. If inputs change, fingerprint changes.
  const cspResultCache = new Map<string, {
    assignments: Array<{ seriesId: string; time: string }>
    conflicts: Array<{ type: string; message?: string }>
  }>()

  function computeCspFingerprint(
    seriesInputs: ReflowInput['series'],
    chains: ReflowInput['chains']
  ): string {
    const sortedSeries = [...seriesInputs].sort((a, b) =>
      (a.id as string).localeCompare(b.id as string)
    )
    const seriesParts = sortedSeries.map(s =>
      `${s.id}|${s.fixed}|${s.idealTime}|${s.duration}|${s.allDay}|${s.timeWindow?.start ?? ''}|${s.timeWindow?.end ?? ''}`
    )
    const sortedChains = [...chains].sort((a, b) => {
      const k1 = `${a.parentId}:${a.childId}`
      const k2 = `${b.parentId}:${b.childId}`
      return k1.localeCompare(k2)
    })
    const chainParts = sortedChains.map(c =>
      `${c.parentId}|${c.childId}|${c.distance}|${c.earlyWobble}|${c.lateWobble}`
    )
    return seriesParts.join(';') + '||' + chainParts.join(';')
  }

  function defensiveCopy(schedule: Schedule): Schedule {
    return structuredClone(schedule)
  }

  // ========== Adapter Helpers ==========
  // Delegations to series-assembly.ts — fat-series marshaling

  function loadFullSeries(id: string): Promise<FullSeries | null> {
    return _loadFullSeries(adapter, id)
  }

  function loadAllFullSeries(): Promise<FullSeries[]> {
    return _loadAllFullSeries(adapter)
  }

  // Cache-aware series loading: prefers seriesCache, falls back to adapter
  async function getFullSeries(id: string): Promise<FullSeries | null> {
    if (seriesCache.has(id)) return { ...seriesCache.get(id)! }
    return loadFullSeries(id)
  }

  function persistNewSeries(data: FullSeries): Promise<void> {
    return _persistNewSeries(adapter, data)
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
    return { start: today, end: addDays(today, 7) }
  }

  async function triggerReflow(scope?: InvalidationScope) {
    // Pattern cache: evict on series definition changes
    if (scope?.type === 'series') {
      evictPatternCacheForSeries(scope.seriesId)
    } else if (scope?.type === 'global') {
      patternDateCache.clear()
    }
    // completions, exceptions, links, constraints → NO pattern eviction

    cacheGeneration++
    scheduleResultCache.clear()

    const win = getDefaultWindow()
    const schedule = await getSchedule(win.start, win.end)
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

  // Get cycling title for a series instance.
  // instanceOffset projects forward: instance 0 uses the current cycling position,
  // instance 1 assumes instance 0 will be completed, etc.
  function getCyclingTitle(series: FullSeries, seriesId: string, instanceOffset: number): string {
    const cycling = series.cycling
    if (!cycling || !cycling.items || cycling.items.length === 0) return series.title

    const items = cycling.items
    const mode = cycling.mode || 'sequential'

    if (mode === 'random') {
      const completionCount = (completionsBySeries.get(seriesId) || []).length
      const hash = simpleHash(seriesId + ':' + (completionCount + instanceOffset))
      return items[hash % items.length]!
    }

    // Sequential mode: base from completions, project forward by offset
    const completionCount = (completionsBySeries.get(seriesId) || []).length
    const index = (completionCount + instanceOffset) % items.length
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
  // Priority: completion > rescheduled exception > chain-computed > pattern time
  function getParentEndTime(
    parentSeries: FullSeries,
    parentId: string,
    instanceDate: LocalDate,
    chainEndTimes?: Map<string, Map<string, LocalDateTime>>
  ): LocalDateTime | null {
    // 1. Check if parent has a completion on this date with endTime (actual data)
    const parentCompIds = completionsBySeries.get(parentId) || []
    for (const cId of parentCompIds) {
      const c = completions.get(cId)
      if (c && (c.date as string) === (instanceDate as string) && c.endTime) {
        return c.endTime as LocalDateTime
      }
    }

    // 2. Check if parent is rescheduled
    const exKey = `${parentId}:${instanceDate}`
    const exception = exceptions.get(exKey)
    if (exception?.type === 'rescheduled' && exception.newTime) {
      const parentDur = getSeriesDuration(parentSeries)
      return addMinutesToTime(exception.newTime, parentDur)
    }

    // 3. Check chain-computed end times (from topo-sorted parent instances)
    const chainEnd = chainEndTimes?.get(parentId)?.get(instanceDate as string)
    if (chainEnd) return chainEnd

    // 4. Fallback to pattern time + duration
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

  // ========== Reflow Integration ==========
  // After buildSchedule generates instances, applyReflow runs the CSP solver
  // per-day to distribute flexible items and avoid overlaps.

  function applyReflow(
    instances: InternalInstance[],
    linksMap: Map<string, InternalLink>
  ): Conflict[] {
    const allConflicts: Conflict[] = []

    // Group by date
    const byDate = new Map<string, InternalInstance[]>()
    for (const inst of instances) {
      const d = inst.date as string
      if (!byDate.has(d)) byDate.set(d, [])
      byDate.get(d)!.push(inst)
    }

    for (const [dateStr, dayInstances] of byDate) {
      const date = dateStr as LocalDate

      // Build SeriesInput[] — one entry per instance with count=1
      // Synthetic IDs ensure uniqueness when multiple instances share a seriesId
      const seriesInputs: ReflowInput['series'] = []
      const instanceMap = new Map<string, InternalInstance>()

      for (let i = 0; i < dayInstances.length; i++) {
        const inst = dayInstances[i]!
        const syntheticId = `${inst.seriesId}::${i}` as SeriesId
        instanceMap.set(syntheticId as string, inst)

        const internal = inst as InternalInstance
        // Treat as fixed for reflow if: (a) pattern says fixed, or
        // (b) item has an explicit time outside the default waking-hours window.
        // This prevents reflow from overriding DST-adjusted, chain-placed,
        // or rescheduled times that intentionally fall outside 07:00-23:00.
        const instTimeStr = timeOf(inst.time as LocalDateTime) as string
        const outsideWindow = instTimeStr < '07:00:00' || instTimeStr > '23:00:00'
        const isFixed = !!inst.fixed || (!!internal._hasExplicitTime && outsideWindow)

        seriesInputs.push({
          id: syntheticId,
          fixed: isFixed,
          idealTime: inst.time,
          duration: (inst.duration || 60) as Duration,
          daysBefore: 0,
          daysAfter: 0,
          ...(!isFixed && !inst.allDay ? { timeWindow: { start: '07:00:00' as LocalTime, end: '23:00:00' as LocalTime } } : {}),
          allDay: inst.allDay || false,
          count: 1,
          cancelled: false,
          conditionSatisfied: true,
          adaptiveDuration: false,
        })
      }

      // Build ChainInput[] for chains where both parent and child exist on this day
      const chains: ReflowInput['chains'] = []
      const daySeriesIds = new Set(dayInstances.map(i => i.seriesId as string))

      for (let i = 0; i < dayInstances.length; i++) {
        const inst = dayInstances[i]!
        const link = linksMap.get(inst.seriesId as string)
        if (!link || !daySeriesIds.has(link.parentId)) continue

        const childSynth = `${inst.seriesId}::${i}` as SeriesId
        // Find the parent's synthetic ID
        const parentIdx = dayInstances.findIndex(di => (di.seriesId as string) === link.parentId)
        if (parentIdx < 0) continue
        const parentSynth = `${link.parentId}::${parentIdx}` as SeriesId

        // If parent has a completion with endTime on this date, the child's
        // position was already computed from the completion endTime in buildSchedule.
        // Don't send this chain to CSP — derivation would overwrite the
        // completion-adjusted time with the parent's pattern-based position.
        const parentCompIds = completionsBySeries.get(link.parentId) || []
        let parentHasCompletionOnDate = false
        for (const cId of parentCompIds) {
          const c = completions.get(cId)
          if (c && (c.date as string) === (date as string) && c.endTime) {
            parentHasCompletionOnDate = true
            break
          }
        }

        if (parentHasCompletionOnDate) {
          // Mark child as fixed — its position is locked to the completion endTime
          const childInput = seriesInputs.find(si => (si.id as string) === (childSynth as string))
          if (childInput) {
            childInput.fixed = true
            delete (childInput as any).timeWindow
          }
          continue  // skip chain — don't let CSP derivation overwrite it
        }

        chains.push({
          parentId: parentSynth,
          childId: childSynth,
          distance: link.distance || 0,
          earlyWobble: link.earlyWobble || 0,
          lateWobble: link.lateWobble || 0,
        })
      }

      // Check CSP fingerprint cache before running solver
      const fingerprint = computeCspFingerprint(seriesInputs, chains)
      const cachedCsp = cspResultCache.get(fingerprint)
      if (cachedCsp) {
        cacheStats.cspHits++
        for (const assignment of cachedCsp.assignments) {
          const inst = instanceMap.get(assignment.seriesId)
          if (inst) inst.time = assignment.time as LocalDateTime
        }
        for (const c of cachedCsp.conflicts) {
          allConflicts.push({
            type: c.type,
            seriesIds: [],
            instances: [],
            date,
            description: c.message || `Reflow conflict: ${c.type}`,
          })
        }
        continue
      }

      cacheStats.cspMisses++

      // Run CSP solver for this day
      const result = reflow({
        series: seriesInputs,
        constraints: [],
        chains,
        today: date,
        windowStart: date,
        windowEnd: date,
      })

      // Cache the result
      cspResultCache.set(fingerprint, {
        assignments: result.assignments.map(a => ({
          seriesId: a.seriesId as string,
          time: a.time as string,
        })),
        conflicts: result.conflicts.map(c => ({
          type: c.type,
          message: c.message,
        })),
      })

      // Apply optimized times back to instances
      for (const assignment of result.assignments) {
        const inst = instanceMap.get(assignment.seriesId as string)
        if (inst) {
          inst.time = assignment.time
        }
      }

      // Convert reflow conflicts to public Conflict type
      for (const c of result.conflicts) {
        allConflicts.push({
          type: c.type,
          seriesIds: [],
          instances: [],
          date,
          description: c.message || `Reflow conflict: ${c.type}`,
        })
      }
    }

    return allConflicts
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

      for (let pi = 0; pi < s.patterns.length; pi++) {
        const pattern = s.patterns[pi]!
        const patternDates = getCachedPatternDates(pattern, start, end, seriesStart, s.id, pi, undefined)
        for (const date of patternDates) {
          if (s.endDate && (date as string) >= (s.endDate as string)) continue
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

    // Per-series counter for cycling projection (instance 0 = current, 1 = next, etc.)
    const cyclingCounters = new Map<string, number>()

    // Topological sort: process parents before children so chain offsets
    // can use already-computed parent end times instead of pattern time
    const sortedSeries: FullSeries[] = []
    const remaining = new Set(allSeries.filter(s => s && s.id).map(s => s.id))
    const seriesMap = new Map(allSeries.filter(s => s && s.id).map(s => [s.id, s]))
    // Add root series (no parent link) first
    for (const s of allSeries) {
      if (s && s.id && !links.has(s.id)) {
        sortedSeries.push(s)
        remaining.delete(s.id)
      }
    }
    // Iteratively add children whose parents are already processed
    let sortProgress = true
    while (remaining.size > 0 && sortProgress) {
      sortProgress = false
      for (const id of remaining) {
        const link = links.get(id)
        if (link && !remaining.has(link.parentId)) {
          sortedSeries.push(seriesMap.get(id)!)
          remaining.delete(id)
          sortProgress = true
        }
      }
    }
    // Add any remaining (orphans or cycles) at the end
    for (const id of remaining) {
      sortedSeries.push(seriesMap.get(id)!)
    }

    // Track end times of already-built instances for chain offset computation
    const builtEndTimes = new Map<string, Map<string, LocalDateTime>>()

    // Second pass: generate instances with per-date condition evaluation
    // Conditions are evaluated per-date so weekday/daysSince conditions
    // correctly filter individual dates, not entire patterns
    for (const s of sortedSeries) {
      if (!s || !s.id || !s.patterns) continue
      const seriesStart = s.startDate || ('2000-01-01' as LocalDate)
      const allowedDates = sameDayRestrictions.get(s.id)

      // Determine anchor for weekly daysOfWeek patterns:
      // If series has completions, use first completion date as anchor
      const firstCompDate = getLastCompletionDate(s.id) !== null
        ? getFirstCompletionDate(s.id)
        : null

      for (let patternIdx = 0; patternIdx < s.patterns.length; patternIdx++) {
        const pattern = s.patterns[patternIdx]!
        // Always assign _anchor for weekly daysOfWeek (clears stale values on deletion)
        if (pattern.type === 'weekly' && pattern.daysOfWeek) {
          pattern._anchor = firstCompDate ?? undefined
        }

        const dates = getCachedPatternDates(pattern, start, end, seriesStart, s.id, patternIdx, pattern._anchor)

        for (const date of dates) {
          if (s.endDate && (date as string) >= (s.endDate as string)) continue

          // Evaluate condition per-date (not once for entire window)
          if (pattern.condition && !evaluateConditionForDate(pattern.condition, s.id, date)) continue

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

          // Track whether this instance has an explicitly-set time or fell to the 09:00 default
          let hasExplicitTime = !!pattern.time

          if (exception?.type === 'rescheduled' && exception.newTime) {
            instanceTime = exception.newTime
            hasExplicitTime = true  // rescheduled = explicit placement
            // Update date if rescheduled to a different day
            const newDate = dateOf(exception.newTime)
            if ((newDate as string) !== (date as string)) {
              instanceDate = newDate
            }
          } else if (isAllDay) {
            instanceTime = makeDateTime(date, makeTime(0, 0, 0))
            hasExplicitTime = true  // all-day items are intentionally placed
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
              const parentEnd = getParentEndTime(parentSeries, link.parentId, date, builtEndTimes)
              if (parentEnd) {
                const target = addMinutesToTime(parentEnd, link.distance || 0)
                instanceTime = target
                hasExplicitTime = true  // chain-placed: don't let reflow move it
                if (!pattern.time) {
                  // No explicit pattern time — update so conflict detector
                  // uses chain-computed time (not the 09:00 default)
                  patternTimeOriginal = target
                }
                // If pattern HAS explicit time, keep patternTimeOriginal as-is
                // so chainCannotFit detects the configuration mismatch
              }
            }
          }

          // Determine duration (adaptive or pattern)
          let duration = pattern.duration as number | undefined
          if (s.adaptiveDuration) {
            const adaptiveDur = calculateAdaptiveDuration(s.id, s.adaptiveDuration)
            if (adaptiveDur !== null) duration = adaptiveDur
          }

          // Cycling title — project forward assuming future completions
          let title = s.title
          if (s.cycling && s.cycling.items && s.cycling.items.length > 0) {
            const offset = cyclingCounters.get(s.id) ?? 0
            title = getCyclingTitle(s, s.id, offset)
            cyclingCounters.set(s.id, offset + 1)
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
          inst._hasExplicitTime = hasExplicitTime
          instances.push(inst)

          // Record end time for downstream chain children
          const endTime = addMinutesToTime(instanceTime, (duration || 60) as number)
          if (!builtEndTimes.has(s.id)) builtEndTimes.set(s.id, new Map())
          builtEndTimes.get(s.id)!.set(instanceDate as string, endTime)
        }
      }
    }

    // Run CSP solver to distribute flexible items (mutates instance times in-place)
    applyReflow(instances, links)

    // Detect conflicts using the repositioned instances (proper format with seriesIds/instances)
    const conflicts = detectConflicts(instances, allConstraintsList, seriesById)

    instances.sort((a, b) => (a.time as string).localeCompare(b.time as string))

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

          // Track flagged pairs to avoid duplicates between instance and pattern checks
          const flaggedPairs = new Set<string>()

          // 1. Instance-based check (for instances within the current window)
          const targetInstances = instances.filter(i => targetSeriesIds.includes(i.seriesId))
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
              for (const s1 of series1) {
                for (const s2 of series2) {
                  if (s1 !== s2) {
                    const pairKey = s1 < s2 ? `${s1}:${s2}` : `${s2}:${s1}`
                    if (flaggedPairs.has(pairKey)) continue
                    flaggedPairs.add(pairKey)
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

          // 2. Pattern-based check for weekly series — catches adjacency
          //    regardless of which days fall in the current window
          for (let a = 0; a < targetSeriesIds.length; a++) {
            for (let b = a + 1; b < targetSeriesIds.length; b++) {
              const idA = targetSeriesIds[a]!
              const idB = targetSeriesIds[b]!
              const pairKey = idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`
              if (flaggedPairs.has(pairKey)) continue

              const sA = seriesById.get(idA)
              const sB = seriesById.get(idB)
              if (!sA || !sB) continue

              // Collect all days-of-week each series fires on
              const daysA: number[] = []
              const daysB: number[] = []
              for (const pat of sA.patterns || []) {
                if (pat.type === 'weekly' && pat.daysOfWeek) daysA.push(...pat.daysOfWeek)
                if (pat.type === 'daily') for (let d = 0; d < 7; d++) daysA.push(d)
              }
              for (const pat of sB.patterns || []) {
                if (pat.type === 'weekly' && pat.daysOfWeek) daysB.push(...pat.daysOfWeek)
                if (pat.type === 'daily') for (let d = 0; d < 7; d++) daysB.push(d)
              }

              // Check if any day from A is adjacent to any day from B
              let adjacent = false
              for (const da of daysA) {
                if (adjacent) break
                for (const db of daysB) {
                  const diff = Math.abs(da - db)
                  if (diff === 1 || diff === 6) { // 6 = wrap-around (Sat-Sun)
                    adjacent = true
                    break
                  }
                }
              }

              if (adjacent) {
                flaggedPairs.add(pairKey)
                conflicts.push({
                  type: 'constraintViolation',
                  seriesIds: [idA, idB],
                  instances: [],
                  description: `${sA.title} and ${sB.title} have patterns on adjacent days`,
                })
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

        // For items with explicit time, check original pattern time (configuration error detection)
        // For flexible items (no explicit time), check actual post-reflow position
        const internal = childInst as InternalInstance
        const childTimeStr = (internal._hasExplicitTime ? (internal._patternTime || childInst.time) : childInst.time) as string
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
    if (input.endDate != null && input.startDate != null &&
        (input.endDate as string) <= (input.startDate as string)) {
      throw new ValidationError('endDate must be > startDate (exclusive)')
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

    buildConditionDependencyIndex()
    await triggerReflow({ type: 'series', seriesId: id })
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

    // Persist core series fields (title, startDate, endDate, updatedAt)
    await updatePersistedSeries(id, {
      ...(changes.title != null ? { title: changes.title } : {}),
      ...(changes.startDate != null ? { startDate: changes.startDate } : {}),
      ...(changes.endDate != null ? { endDate: changes.endDate } : {}),
      updatedAt: updated.updatedAt,
    })

    // Persist patterns: delete old, create new
    if (changes.patterns != null) {
      const oldConditions = await adapter.getConditionsBySeries(id)
      for (const c of oldConditions) await adapter.deleteCondition(c.id)
      const oldPatterns = await adapter.getPatternsBySeries(id)
      for (const p of oldPatterns) await adapter.deletePattern(p.id)
      for (const p of changes.patterns) {
        let condId: string | null = null
        if (p.condition) {
          condId = await persistConditionTree(adapter, id, p.condition, null)
        }
        const patternId = crypto.randomUUID()
        await adapter.createPattern({
          id: patternId,
          seriesId: id,
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
        if (p.daysOfWeek && Array.isArray(p.daysOfWeek)) {
          await adapter.setPatternWeekdays(patternId, p.daysOfWeek.map(String))
        }
      }
    }

    // Persist tags: diff old vs new
    if (changes.tags != null) {
      const oldTags = (s.tags || []) as string[]
      const newTags = changes.tags
      for (const tag of oldTags) {
        if (!newTags.includes(tag)) {
          await adapter.removeTagFromSeries(id, tag)
          // Update tagCache: remove this series from the tag
          const cached = tagCache.get(tag)
          if (cached) {
            const idx = cached.indexOf(id)
            if (idx >= 0) cached.splice(idx, 1)
            if (cached.length === 0) tagCache.delete(tag)
          }
        }
      }
      for (const tag of newTags) {
        if (!oldTags.includes(tag)) {
          await adapter.addTagToSeries(id, tag)
          // Update tagCache: add this series to the tag
          if (!tagCache.has(tag)) tagCache.set(tag, [])
          if (!tagCache.get(tag)!.includes(id)) tagCache.get(tag)!.push(id)
        }
      }
    }

    // Persist cycling config
    if (changes.cycling != null) {
      await adapter.setCyclingConfig(id, {
        seriesId: id,
        currentIndex: changes.cycling.currentIndex ?? 0,
        gapLeap: changes.cycling.gapLeap ?? false,
        ...(changes.cycling.mode != null ? { mode: changes.cycling.mode } : {}),
      })
      const items = changes.cycling.items && Array.isArray(changes.cycling.items)
        ? changes.cycling.items
        : []
      await adapter.setCyclingItems(id,
        items.map((title: string, i: number) => ({
          seriesId: id,
          position: i,
          title,
          duration: 0,
        }))
      )
    }

    // Persist adaptive duration
    if (changes.adaptiveDuration != null) {
      await adapter.setAdaptiveDuration(id, {
        seriesId: id,
        ...changes.adaptiveDuration,
      } as import('./adapter').AdaptiveDurationConfig)
    }

    seriesCache.set(id, { ...updated } as FullSeries)
    buildConditionDependencyIndex()
    await triggerReflow({ type: 'series', seriesId: id })
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
    buildConditionDependencyIndex()
    await triggerReflow({ type: 'series', seriesId: id })
  }

  async function splitSeries(id: string, splitDate: LocalDate): Promise<string> {
    const s = await getFullSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)

    const originalEnd = splitDate
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

    // Update tagCache for new series
    if (newSeries.tags && Array.isArray(newSeries.tags)) {
      for (const tag of newSeries.tags) {
        if (!tagCache.has(tag)) tagCache.set(tag, [])
        if (!tagCache.get(tag)!.includes(newId)) tagCache.get(tag)!.push(newId)
      }
    }

    // Copy constraints that reference the original series (snapshot to avoid mutation during iteration)
    for (const [cid, constraint] of [...constraints]) {
      const targetsOriginal = (
        (constraint.target?.type === 'seriesId' && constraint.target.seriesId === id) ||
        (constraint.secondTarget?.type === 'seriesId' && constraint.secondTarget.seriesId === id)
      )
      if (targetsOriginal) {
        const newConstraintId = uuid()
        const newTarget = constraint.target?.type === 'seriesId' && constraint.target.seriesId === id
          ? { type: 'seriesId' as const, seriesId: newId }
          : constraint.target
        const newSecondTarget = constraint.secondTarget?.type === 'seriesId' && constraint.secondTarget.seriesId === id
          ? { type: 'seriesId' as const, seriesId: newId }
          : constraint.secondTarget
        const newConstraint = {
          id: newConstraintId,
          type: constraint.type,
          target: newTarget,
          secondTarget: newSecondTarget,
          ...(constraint.withinMinutes != null ? { withinMinutes: constraint.withinMinutes } : {}),
        }
        constraints.set(newConstraintId, newConstraint as StoredConstraint)
        await adapter.createRelationalConstraint({
          id: newConstraintId,
          type: constraint.type,
          sourceTarget: newTarget ?? { seriesId: newId },
          destinationTarget: newSecondTarget ?? { seriesId: newId },
          ...(constraint.withinMinutes != null ? { withinMinutes: constraint.withinMinutes } : {}),
        })
      }
    }

    // Copy incoming link (if original is a chain child, new series should be too)
    const originalLink = links.get(id)
    if (originalLink) {
      const newLink: InternalLink = {
        parentId: originalLink.parentId,
        childId: newId,
        distance: originalLink.distance,
        ...(originalLink.earlyWobble != null ? { earlyWobble: originalLink.earlyWobble } : {}),
        ...(originalLink.lateWobble != null ? { lateWobble: originalLink.lateWobble } : {}),
      }
      links.set(newId, newLink)
      if (!linksByParent.has(originalLink.parentId)) linksByParent.set(originalLink.parentId, [])
      linksByParent.get(originalLink.parentId)!.push(newId)
      await adapter.createLink({
        id: uuid(),
        parentSeriesId: originalLink.parentId,
        childSeriesId: newId,
        targetDistance: originalLink.distance,
        earlyWobble: originalLink.earlyWobble ?? 0,
        lateWobble: originalLink.lateWobble ?? 0,
      })
    }

    await triggerReflow({ type: 'global' })
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
    await triggerReflow({ type: 'link' })
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
    await triggerReflow({ type: 'link' })
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
    await triggerReflow({ type: 'constraint' })
    return id
  }

  async function removeConstraint(id: string): Promise<void> {
    constraints.delete(id)
    await adapter.deleteRelationalConstraint(id)
    await triggerReflow({ type: 'constraint' })
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
      const dates = getPatternDates(pattern, date, addDays(date, 1), seriesStart)
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
      const dates = getPatternDates(pattern, date, addDays(date, 1), seriesStart)
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

    await adapter.createInstanceException({
      id: uuid(), seriesId, originalDate: date, type: 'cancelled',
    })
    exceptions.set(exKey, { seriesId, date, type: 'cancelled' })
    await triggerReflow({ type: 'exception' })
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

    await adapter.createInstanceException({
      id: uuid(), seriesId, originalDate: date, type: 'rescheduled', newTime,
    })
    exceptions.set(exKey, { seriesId, date, type: 'rescheduled', newTime })
    await triggerReflow({ type: 'exception' })
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
    await triggerReflow({ type: 'completion' })
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
    await triggerReflow({ type: 'completion' })
  }

  // ========== Schedule ==========

  async function getSchedule(start: LocalDate, end: LocalDate): Promise<Schedule> {
    // end is exclusive: [start, end)
    if ((end as string) <= (start as string)) {
      return { instances: [], conflicts: [] }
    }
    const key = `${start}:${end}`
    const cached = scheduleResultCache.get(key)
    if (cached && cached.generation === cacheGeneration) {
      return defensiveCopy(cached.schedule)
    }
    const schedule = await buildSchedule(start, end)
    scheduleResultCache.set(key, { generation: cacheGeneration, schedule })
    return defensiveCopy(schedule)
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
        const checkEnd = addDays(asOfDate, 2)
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
          const checkEnd = addDays(asOfDate, 2)
          const dates = getPatternDates(pattern, checkStart, checkEnd, seriesStart)
          for (const date of dates) {
            acks.add(`${date}:${id}`)
            await adapter.acknowledgeReminder(id, date, asOf)
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

    // Hydrate constraints
    const allConstraints = await adapter.getAllRelationalConstraints()
    for (const rc of allConstraints) {
      if (!constraints.has(rc.id)) {
        // Reconstruct ConstraintTarget with type discriminator
        // Adapter stores { tag: string } | { seriesId: string } without type field
        const src = rc.sourceTarget as Record<string, unknown>
        const dst = rc.destinationTarget as Record<string, unknown>
        const target: ConstraintTarget = 'tag' in src
          ? { type: 'tag', tag: src.tag as string }
          : { type: 'seriesId', seriesId: src.seriesId as string }
        const secondTarget: ConstraintTarget = 'tag' in dst
          ? { type: 'tag', tag: dst.tag as string }
          : { type: 'seriesId', seriesId: dst.seriesId as string }
        constraints.set(rc.id, {
          id: rc.id,
          type: rc.type,
          target,
          secondTarget,
          ...(rc.withinMinutes != null ? { withinMinutes: rc.withinMinutes } : {}),
        })
      }
    }

    // Hydrate reminders
    const allReminders = await adapter.getAllReminders()
    for (const r of allReminders) {
      if (!reminders.has(r.id)) {
        reminders.set(r.id, {
          id: r.id,
          seriesId: r.seriesId,
          type: r.label,
          offset: r.minutesBefore,
        })
        if (!reminderAcks.has(r.id)) reminderAcks.set(r.id, new Set())
        if (!remindersBySeriesMap.has(r.seriesId)) remindersBySeriesMap.set(r.seriesId, [])
        if (!remindersBySeriesMap.get(r.seriesId)!.includes(r.id)) {
          remindersBySeriesMap.get(r.seriesId)!.push(r.id)
        }
      }
    }

    // Hydrate reminder acks
    const today = new Date().toISOString().slice(0, 10) as LocalDate
    const ackStart = addDays(today, -30)
    const ackEnd = addDays(today, 30)
    const allAcks = await adapter.getReminderAcksInRange(ackStart, ackEnd)
    for (const ack of allAcks) {
      if (!reminderAcks.has(ack.reminderId)) reminderAcks.set(ack.reminderId, new Set())
      reminderAcks.get(ack.reminderId)!.add(`${ack.instanceDate}:${ack.reminderId}`)
    }

    // Rebuild tag cache and series cache from all series
    const allSeries = await loadAllFullSeries()
    for (const s of allSeries) {
      seriesCache.set(s.id, { ...s })
      if (s.tags && Array.isArray(s.tags)) {
        for (const tag of s.tags) {
          if (!tagCache.has(tag)) tagCache.set(tag, [])
          if (!tagCache.get(tag)!.includes(s.id)) {
            tagCache.get(tag)!.push(s.id)
          }
        }
      }
    }

    // Build condition dependency index from hydrated series
    buildConditionDependencyIndex()
  }

  function getCacheStats() {
    return { ...cacheStats }
  }

  function getConditionDeps(): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>()
    for (const [key, value] of conditionDeps) {
      result.set(key, new Set(value))
    }
    return result
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
    getCacheStats,
    getConditionDeps,
  }
}
