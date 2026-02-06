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
  dateOf, daysBetween, weekdayToIndex,
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
  getCompletion: (id: string) => Promise<any>
  saveCompletion: (completion: any) => Promise<void>
  deleteCompletion: (id: string) => Promise<void>
  getCompletionsBySeries: (seriesId: string) => Promise<any[]>
  getReminder: (id: string) => Promise<any>
  saveReminder: (reminder: any) => Promise<void>
  deleteReminder: (id: string) => Promise<void>
  getException: (key: string) => Promise<any>
  saveException: (exception: any) => Promise<void>
  deleteException: (key: string) => Promise<void>
  getLink: (id: string) => Promise<any>
  saveLink: (link: any) => Promise<void>
  deleteLink: (id: string) => Promise<void>
  getConstraint: (id: string) => Promise<any>
  saveConstraint: (constraint: any) => Promise<void>
  deleteConstraint: (id: string) => Promise<void>
  transaction: <T>(fn: () => T) => T | Promise<T>
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
}

export type Conflict = {
  type: string
  seriesIds: string[]
  date?: LocalDate
  description?: string
}

export type Reminder = {
  id: string
  seriesId: string
  type: string
  offset?: number
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
  getPendingReminders(asOf: LocalDateTime): Promise<Reminder[]>
  checkReminders(asOf: LocalDateTime): Promise<void>
  acknowledgeReminder(id: string, asOf: LocalDateTime): Promise<void>
  evaluateCondition(condition: any, date: LocalDate): Promise<boolean>
  getActiveConditions(seriesId: string, date: LocalDate): Promise<any[]>
  on(event: string, handler: (...args: any[]) => void): void
}

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
  // Walk forward from the target epoch in 1-minute increments
  for (let i = 0; i <= 120; i++) {
    const testEpoch = targetEpoch + i * 60000
    const curr = formatInTz(testEpoch, tz)
    if (curr.day !== d) continue
    const prev = formatInTz(testEpoch - 60000, tz)
    // Gap boundary: previous minute was at an earlier hour or different day
    if (prev.hour < curr.hour || prev.day !== d) {
      return makeTime(curr.hour, curr.minute, 0)
    }
  }

  // Fallback: next whole hour
  return makeTime(h + 1, 0, 0)
}

function toExpandablePattern(p: any, seriesStart: LocalDate): Pattern {
  switch (p.type) {
    case 'daily':
      return { type: 'daily' }
    case 'weekly':
      if (p.dayOfWeek !== undefined) {
        return { type: 'weekdays', days: [numToWeekday(p.dayOfWeek)] }
      }
      return { type: 'weekly' }
    case 'monthly':
      return { type: 'monthly', day: p.day || dayOf(seriesStart) }
    case 'yearly':
      return { type: 'yearly', month: p.month || monthOf(seriesStart), day: p.day || dayOf(seriesStart) }
    default:
      return { type: 'daily' }
  }
}

function getPatternDates(pattern: any, start: LocalDate, end: LocalDate, seriesStart: LocalDate): Set<LocalDate> {
  const expandable = toExpandablePattern(pattern, seriesStart)
  return expandPattern(expandable, { start, end }, seriesStart)
}

function evaluateDateCondition(condition: any, date: LocalDate): boolean {
  if (!condition) return true
  if (condition.type === 'weekday') {
    const dow = dayOfWeekNum(date)
    return condition.days.includes(dow)
  }
  return true
}

// ============================================================================
// Implementation
// ============================================================================

const REQUIRED_ADAPTER_METHODS = [
  'getSeries', 'saveSeries', 'deleteSeries', 'getAllSeries',
  'getCompletion', 'saveCompletion', 'deleteCompletion', 'getCompletionsBySeries',
  'getReminder', 'saveReminder', 'deleteReminder',
  'getException', 'saveException', 'deleteException',
  'getLink', 'saveLink', 'deleteLink',
  'getConstraint', 'saveConstraint', 'deleteConstraint',
  'transaction',
]

export function createAutoplanner(config: AutoplannerConfig): Autoplanner {
  // Validate
  if (!config.adapter || typeof config.adapter !== 'object') {
    throw new ValidationError('Adapter is required')
  }
  for (const method of REQUIRED_ADAPTER_METHODS) {
    if (typeof (config.adapter as any)[method] !== 'function') {
      throw new ValidationError(`Adapter must implement ${method}`)
    }
  }
  if (!isValidTimezone(config.timezone)) {
    throw new ValidationError(`Invalid timezone: ${config.timezone}`)
  }

  const adapter = config.adapter
  const timezone = config.timezone

  // Internal state
  const completions = new Map<string, any>()           // id → completion
  const completionsByKey = new Map<string, string>()    // "seriesId:date" → completionId
  const completionsBySeries = new Map<string, string[]>() // seriesId → [completionId]
  const exceptions = new Map<string, any>()             // "seriesId:date" → exception
  const links = new Map<string, any>()                  // childId → link data
  const linksByParent = new Map<string, string[]>()     // parentId → [childId]
  const constraints = new Map<string, any>()            // constraintId → constraint
  const reminders = new Map<string, any>()              // reminderId → reminder
  const reminderAcks = new Map<string, Set<string>>()   // reminderId → set of ack keys

  // Event handlers
  const eventHandlers = new Map<string, ((...args: any[]) => void)[]>()

  // Cached reflow result
  let cachedConflicts: Conflict[] = []

  function emit(event: string, ...args: any[]) {
    const handlers = eventHandlers.get(event) || []
    for (const handler of handlers) {
      try { handler(...args) } catch { /* handler errors isolated */ }
    }
  }

  function on(event: string, handler: (...args: any[]) => void) {
    if (!eventHandlers.has(event)) eventHandlers.set(event, [])
    eventHandlers.get(event)!.push(handler)
  }

  // Get default reflow window (7 days from today, end-exclusive = 7 dates)
  function getDefaultWindow(): { start: LocalDate; end: LocalDate } {
    const now = new Date()
    const today = makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
    return { start: today, end: addDays(today, 6) }
  }

  async function triggerReflow() {
    const win = getDefaultWindow()
    const schedule = await buildSchedule(win.start, win.end)
    cachedConflicts = schedule.conflicts

    // Emit with frozen copy so handler mutations don't affect state
    const frozenSchedule = Object.freeze({
      instances: Object.freeze([...schedule.instances]),
      conflicts: Object.freeze([...schedule.conflicts]),
    })
    emit('reflow', frozenSchedule)

    for (const conflict of schedule.conflicts) {
      emit('conflict', Object.freeze({ ...conflict }))
    }
  }

  // Build schedule for [start, end) — end is exclusive
  async function buildSchedule(start: LocalDate, end: LocalDate): Promise<Schedule> {
    const allSeries = await adapter.getAllSeries()
    const instances: ScheduleInstance[] = []
    // end-exclusive: use end-1 as the inclusive end for expandPattern
    const inclusiveEnd = addDays(end, -1)
    if ((inclusiveEnd as string) < (start as string)) {
      return { instances: [], conflicts: [] }
    }

    for (const s of allSeries) {
      if (!s || !s.id || !s.patterns) continue
      const seriesStart = s.startDate || ('2000-01-01' as LocalDate)

      for (const pattern of s.patterns) {
        const dates = getPatternDates(pattern, start, inclusiveEnd, seriesStart)

        for (const date of dates) {
          // Check end date
          if (s.endDate && (date as string) > (s.endDate as string)) continue

          // Check condition
          if (pattern.condition && !evaluateDateCondition(pattern.condition, date)) continue

          // Check exceptions
          const exKey = `${s.id}:${date}`
          const exception = exceptions.get(exKey)
          if (exception?.type === 'cancelled') continue

          // Determine time
          let instanceTime: LocalDateTime
          if (exception?.type === 'rescheduled' && exception.newTime) {
            instanceTime = exception.newTime
          } else {
            const patternTime = pattern.time || ('09:00:00' as LocalTime)
            const resolvedTime = resolveTimeForDate(date, patternTime, timezone)
            instanceTime = makeDateTime(date, resolvedTime)
          }

          instances.push({
            seriesId: s.id,
            title: s.title,
            date,
            time: instanceTime,
            duration: pattern.duration as number | undefined,
            fixed: pattern.fixed,
          })
        }
      }
    }

    instances.sort((a, b) => (a.time as string).localeCompare(b.time as string))

    const conflicts = detectConflicts(instances)
    return { instances, conflicts }
  }

  function detectConflicts(instances: ScheduleInstance[]): Conflict[] {
    const conflicts: Conflict[] = []
    const fixedInstances = instances.filter(i => i.fixed)

    // Check for overlapping fixed instances
    for (let i = 0; i < fixedInstances.length; i++) {
      for (let j = i + 1; j < fixedInstances.length; j++) {
        const a = fixedInstances[i]
        const b = fixedInstances[j]
        if (a.date !== b.date) continue
        if (a.seriesId === b.seriesId) continue

        const durA = a.duration || 60
        const durB = b.duration || 60
        const startA = a.time as string
        const startB = b.time as string

        // Check overlap
        if (startA === startB || timesOverlap(a.time, durA, b.time, durB)) {
          // Deduplicate: check if we already have a conflict for this pair on this date
          const existing = conflicts.find(c =>
            c.date === a.date &&
            c.seriesIds.includes(a.seriesId) &&
            c.seriesIds.includes(b.seriesId)
          )
          if (!existing) {
            conflicts.push({
              type: 'overlap',
              seriesIds: [a.seriesId, b.seriesId],
              date: a.date,
              description: `Fixed overlap between ${a.title} and ${b.title} on ${a.date}`,
            })
          }
        }
      }
    }

    return conflicts
  }

  function timesOverlap(timeA: LocalDateTime, durA: number, timeB: LocalDateTime, durB: number): boolean {
    // Simple string comparison of start/end times
    const startA = timeA as string
    const startB = timeB as string
    // For simplicity: if same start time, always overlap
    if (startA === startB) return true
    // Otherwise check if intervals overlap
    // A: [startA, startA + durA), B: [startB, startB + durB)
    const hA = hourOf(timeA as any) * 60 + minuteOf(timeA as any)
    const hB = hourOf(timeB as any) * 60 + minuteOf(timeB as any)
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
      createdAt: now,
      updatedAt: now,
    }

    await adapter.saveSeries(seriesData)
    await triggerReflow()
    return id
  }

  async function getSeries(id: string): Promise<any> {
    const s = await adapter.getSeries(id)
    if (!s) return null

    // Enrich with link info
    const link = links.get(id)
    const result: any = { ...s }
    if (link) {
      result.parentId = link.parentId
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
    await triggerReflow()
  }

  async function lock(id: string): Promise<void> {
    const s = await adapter.getSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)
    await adapter.saveSeries({ ...s, locked: true })
    // Lock doesn't trigger reflow
  }

  async function unlock(id: string): Promise<void> {
    const s = await adapter.getSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)
    await adapter.saveSeries({ ...s, locked: false })
  }

  async function deleteSeries(id: string): Promise<void> {
    // Check completions
    const seriesCompletions = completionsBySeries.get(id) || []
    if (seriesCompletions.length > 0) {
      throw new CompletionsExistError(`Cannot delete series ${id}: completions exist`)
    }

    // Check linked children
    const children = linksByParent.get(id) || []
    if (children.length > 0) {
      throw new LinkedChildrenExistError(`Cannot delete series ${id}: linked children exist`)
    }

    await adapter.deleteSeries(id)
    await triggerReflow()
  }

  async function splitSeries(id: string, splitDate: LocalDate): Promise<string> {
    const s = await adapter.getSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)

    // Update original: set end date to day before split
    const originalEnd = addDays(splitDate, -1)
    await adapter.saveSeries({ ...s, endDate: originalEnd })

    // Create new series from split date
    const newId = uuid()
    const newSeries = {
      ...s,
      id: newId,
      startDate: splitDate,
      endDate: s.endDate,
      createdAt: s.createdAt,
      updatedAt: makeDateTime(
        makeDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()),
        makeTime(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds())
      ),
    }
    await adapter.saveSeries(newSeries)
    await triggerReflow()
    return newId
  }

  // ========== Links ==========

  async function linkSeries(parentId: string, childId: string, options: any): Promise<void> {
    const parent = await adapter.getSeries(parentId)
    if (!parent) throw new NotFoundError(`Parent series ${parentId} not found`)
    const child = await adapter.getSeries(childId)
    if (!child) throw new NotFoundError(`Child series ${childId} not found`)

    if (parentId === childId) throw new CycleDetectedError('Cannot link series to itself')

    // Check if child already linked
    if (links.has(childId)) {
      throw new CycleDetectedError(`Series ${childId} is already linked`)
    }

    // Cycle detection: walk parent chain from parentId
    let current = parentId
    let depth = 0
    while (links.has(current)) {
      current = links.get(current).parentId
      depth++
      if (current === childId) {
        throw new CycleDetectedError('Linking would create a cycle')
      }
      if (depth > 32) break
    }

    // Check total chain depth
    const chainDepth = getChainDepth(parentId) + 1
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

    await adapter.saveLink(linkData)
    await triggerReflow()
  }

  function getChainDepth(seriesId: string): number {
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
      await adapter.deleteLink(childId)
    }
    await triggerReflow()
  }

  // ========== Constraints ==========

  async function addConstraint(constraint: any): Promise<string> {
    const id = uuid()
    const data = { id, ...constraint }
    constraints.set(id, data)
    await adapter.saveConstraint(data)
    await triggerReflow()
    return id
  }

  async function removeConstraint(id: string): Promise<void> {
    constraints.delete(id)
    await adapter.deleteConstraint(id)
    await triggerReflow()
  }

  async function getConstraints(): Promise<any[]> {
    return [...constraints.values()]
  }

  // ========== Instance Operations ==========

  async function getInstance(seriesId: string, date: LocalDate): Promise<any> {
    const s = await adapter.getSeries(seriesId)
    if (!s) return null

    // Check if this date has an instance
    const seriesStart = s.startDate || ('2000-01-01' as LocalDate)
    let found = false
    for (const pattern of s.patterns) {
      const dates = getPatternDates(pattern, date, date, seriesStart)
      if (dates.has(date)) {
        if (!pattern.condition || evaluateDateCondition(pattern.condition, date)) {
          found = true
          break
        }
      }
    }
    if (!found) return null

    // Check exception
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

    // Verify instance exists on this date
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
    await adapter.saveException({ seriesId, date, type: 'cancelled' })
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

    exceptions.set(exKey, { seriesId, date, type: 'rescheduled', newTime })
    await adapter.saveException({ seriesId, date, type: 'rescheduled', newTime })
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

    await adapter.saveCompletion(completion)
    await triggerReflow()
    return id
  }

  async function getCompletions(seriesId: string): Promise<any[]> {
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
      await adapter.deleteCompletion(id)
    }
    await triggerReflow()
  }

  // ========== Schedule ==========

  async function getSchedule(start: LocalDate, end: LocalDate): Promise<Schedule> {
    return buildSchedule(start, end)
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
      offset: options.offset,
    }
    reminders.set(id, reminder)
    reminderAcks.set(id, new Set())
    await adapter.saveReminder(reminder)
    return id
  }

  async function getPendingReminders(asOf: LocalDateTime): Promise<Reminder[]> {
    const pending: Reminder[] = []
    const asOfDate = dateOf(asOf)

    for (const [id, reminder] of reminders) {
      const s = await adapter.getSeries(reminder.seriesId)
      if (!s) continue

      const acks = reminderAcks.get(id) || new Set()

      // Check instances around asOf date
      const seriesStart = s.startDate || ('2000-01-01' as LocalDate)
      for (const pattern of s.patterns) {
        // Check a few days around asOf
        const checkStart = addDays(asOfDate, -1)
        const checkEnd = addDays(asOfDate, 1)
        const dates = getPatternDates(pattern, checkStart, checkEnd, seriesStart)

        for (const date of dates) {
          // Skip cancelled instances
          const exKey = `${reminder.seriesId}:${date}`
          const exception = exceptions.get(exKey)
          if (exception?.type === 'cancelled') continue

          // Skip completed instances
          if (completionsByKey.has(exKey)) continue

          // Calculate fire time
          let instanceTime: LocalDateTime
          if (exception?.type === 'rescheduled' && exception.newTime) {
            instanceTime = exception.newTime
          } else {
            const patternTime = normalizeTime(pattern?.time || ('09:00:00' as LocalTime))
            instanceTime = makeDateTime(date, patternTime)
          }

          const fireTime = subtractMinutes(instanceTime, reminder.offset as number || 0)

          // Check if due and not acked
          if ((fireTime as string) <= (asOf as string)) {
            const ackKey = `${date}`
            if (!acks.has(ackKey)) {
              pending.push({
                id: reminder.id,
                seriesId: reminder.seriesId,
                type: reminder.type,
                offset: reminder.offset,
              })
            }
          }
        }
      }
    }

    return pending
  }

  function subtractMinutes(dt: LocalDateTime, mins: number): LocalDateTime {
    const d = dateOf(dt)
    const h = hourOf(dt as any)
    const m = minuteOf(dt as any)
    const s = secondOf(dt as any)
    let totalMinutes = h * 60 + m - mins
    let dayAdj = 0
    while (totalMinutes < 0) { totalMinutes += 1440; dayAdj-- }
    while (totalMinutes >= 1440) { totalMinutes -= 1440; dayAdj++ }
    const newH = Math.floor(totalMinutes / 60)
    const newM = totalMinutes % 60
    const newDate = dayAdj !== 0 ? addDays(d, dayAdj) : d
    return makeDateTime(newDate, makeTime(newH, newM, s))
  }

  async function checkReminders(asOf: LocalDateTime): Promise<void> {
    const pending = await getPendingReminders(asOf)
    for (const reminder of pending) {
      emit('reminderDue', Object.freeze({ ...reminder }))
    }
  }

  async function acknowledgeReminder(id: string, asOf: LocalDateTime): Promise<void> {
    if (!reminderAcks.has(id)) reminderAcks.set(id, new Set())
    const asOfDate = dateOf(asOf)
    // Acknowledge for all dates up to asOf
    const acks = reminderAcks.get(id)!
    // Just acknowledge for the asOf date
    const checkStart = addDays(asOfDate, -1)
    const checkEnd = addDays(asOfDate, 1)
    const reminder = reminders.get(id)
    if (reminder) {
      const s = await adapter.getSeries(reminder.seriesId)
      if (s) {
        const seriesStart = s.startDate || ('2000-01-01' as LocalDate)
        for (const pattern of s.patterns) {
          const dates = getPatternDates(pattern, checkStart, checkEnd, seriesStart)
          for (const date of dates) {
            acks.add(`${date}`)
          }
        }
      }
    }
  }

  // ========== Conditions ==========

  async function evaluateCondition(condition: any, date: LocalDate): Promise<boolean> {
    return evaluateDateCondition(condition, date)
  }

  async function getActiveConditions(seriesId: string, date: LocalDate): Promise<any[]> {
    const s = await adapter.getSeries(seriesId)
    if (!s) return []

    const active: any[] = []
    for (const pattern of (s.patterns || [])) {
      if (pattern.condition) {
        const result = evaluateDateCondition(pattern.condition, date)
        active.push({
          condition: pattern.condition,
          active: result,
          patternType: pattern.type,
        })
      }
    }
    return active
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
    on,
  }
}
