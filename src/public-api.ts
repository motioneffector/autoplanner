/**
 * Public API Module
 *
 * Consumer-facing interface that ties all components together.
 * Handles initialization, validation, event emission, and timezone handling.
 */

import type { LocalDate, LocalTime, LocalDateTime } from './time-date'
import {
  addDays, makeDate, makeTime, makeDateTime,
} from './time-date'
import type { Adapter, Completion } from './adapter'
import {
  loadFullSeries as _loadFullSeries,
  loadAllFullSeries as _loadAllFullSeries,
  persistNewSeries as _persistNewSeries,
} from './series-assembly'
import { createSeriesStore } from './internal/series-store'
import { createCompletionTracker } from './internal/completion-tracker'
import { createExceptionStore } from './internal/exception-store'
import { createLinkManager } from './internal/link-manager'
import { createConstraintManager } from './internal/constraint-manager'
import { createConditionEvaluator } from './internal/condition-evaluator'
import { createReminderManager } from './internal/reminder-manager'
import { createScheduleEngine } from './internal/schedule-engine'
import type { InvalidationScope } from './internal/types'
import {
  uuid, isValidTimezone,
  resolveTimeForDate,
  getPatternDates,
  addMinutesToTime,
} from './internal/helpers'

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
  ValidationError, NotFoundError,
  CompletionsExistError, LinkedChildrenExistError,
  NonExistentInstanceError, AlreadyCancelledError, CancelledInstanceError,
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
}

export type StoredConstraint = ConstraintInput & { id: string }

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

  // Phase 1 stores
  const exceptionStore = createExceptionStore({ adapter })
  const seriesStore = createSeriesStore({
    adapter,
    persistNewSeries: (data) => _persistNewSeries(adapter, data),
    loadFullSeries: (id) => _loadFullSeries(adapter, id),
    loadAllFullSeries: () => _loadAllFullSeries(adapter),
  })
  const completionTracker = createCompletionTracker({
    adapter,
    getFullSeries: seriesStore.getFullSeries,
  })

  // Phase 2 managers
  const linkManager = createLinkManager({
    adapter,
    getFullSeries: seriesStore.getFullSeries,
    completionReader: completionTracker.reader,
    exceptionReader: exceptionStore.reader,
    timezone,
  })
  const constraintManager = createConstraintManager({ adapter })
  const conditionEvaluator = createConditionEvaluator({
    seriesReader: seriesStore.reader,
    countInWindow: completionTracker.countInWindow,
    getLastDate: completionTracker.getLastDate,
  })
  const reminderManager = createReminderManager({
    adapter,
    getFullSeries: seriesStore.getFullSeries,
    completionReader: completionTracker.reader,
    exceptionReader: exceptionStore.reader,
    onReminderDue: (reminder) => emit('reminderDue', Object.freeze({ ...reminder })),
  })

  // Phase 3: Schedule engine
  const scheduleEngine = createScheduleEngine({
    getAllSeries: seriesStore.getAllSeries,
    seriesReader: seriesStore.reader,
    completionReader: completionTracker.reader,
    getLastDate: completionTracker.getLastDate,
    getFirstDate: completionTracker.getFirstDate,
    exceptionReader: exceptionStore.reader,
    linkReader: linkManager.reader,
    getParentEndTime: linkManager.getParentEndTime,
    constraintReader: constraintManager.reader,
    evaluateCondition: conditionEvaluator.evaluate,
    timezone,
  })

  // Cache-aware series loading — delegates to seriesStore
  function getFullSeries(id: string): Promise<FullSeries | null> {
    return seriesStore.getFullSeries(id)
  }

  // Event handlers
  const eventHandlers = new Map<string, ((...args: unknown[]) => void)[]>()
  let cachedConflicts: Conflict[] = []

  function emit(event: string, ...args: unknown[]): boolean {
    const handlers = eventHandlers.get(event) || []
    let hadErrors = false
    for (const handler of handlers) {
      try { handler(...args) } catch (e) { hadErrors = true; console.error(`Event handler error on '${event}':`, e) }
    }
    return !hadErrors
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
    scheduleEngine.invalidate(scope)
    const win = getDefaultWindow()
    const schedule = await scheduleEngine.getSchedule(win.start, win.end)
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

  // ========== Series Management ==========

  async function createSeries(input: CreateSeriesInput): Promise<string> {
    const id = await seriesStore.create(input)
    conditionEvaluator.rebuildIndex()
    await triggerReflow({ type: 'series', seriesId: id })
    return id
  }

  async function getSeries(id: string): Promise<FullSeries | null> {
    const s = await getFullSeries(id)
    if (!s) return null

    const result: FullSeries = { ...s }

    // Enrich with link info
    const link = linkManager.reader.get(id)
    if (link) {
      result.parentId = link.parentId
    }

    // Add reminderOffsets
    const offsets = reminderManager.getOffsetsForSeries(id)
    if (offsets.length > 0) {
      result.reminderOffsets = offsets
    }

    return result
  }

  async function getAllSeries(): Promise<FullSeries[]> {
    const all = await seriesStore.getAllSeries()
    return all.map(s => {
      const link = linkManager.reader.get(s.id)
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
    await seriesStore.update(id, changes)
    conditionEvaluator.rebuildIndex()
    await triggerReflow({ type: 'series', seriesId: id })
  }

  async function lock(id: string): Promise<void> {
    await seriesStore.lock(id)
  }

  async function unlock(id: string): Promise<void> {
    await seriesStore.unlock(id)
  }

  async function deleteSeries(id: string): Promise<void> {
    // Cross-domain validation: check completions and links before deleting
    const seriesCompletions = completionTracker.reader.getBySeriesId(id)
    if (seriesCompletions.length > 0) {
      throw new CompletionsExistError(`Cannot delete series ${id}: completions exist`)
    }
    const children = linkManager.reader.getByParent(id)
    if (children.length > 0) {
      throw new LinkedChildrenExistError(`Cannot delete series ${id}: linked children exist`)
    }
    await seriesStore.delete(id)
    conditionEvaluator.rebuildIndex()
    await triggerReflow({ type: 'series', seriesId: id })
  }

  async function splitSeries(id: string, splitDate: LocalDate): Promise<string> {
    const s = await getFullSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)

    const newId = uuid()
    const newSeries: FullSeries = {
      ...s,
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

    await seriesStore.handleSplit(id, splitDate, newSeries)

    // Copy constraints that reference the original series
    await constraintManager.copyForSplit(id, newId)

    // Copy incoming link (if original is a chain child, new series should be too)
    await linkManager.copyForSplit(id, newId)

    await triggerReflow({ type: 'global' })
    return newId
  }

  // ========== Links (delegates to linkManager) ==========

  async function linkSeries(parentId: string, childId: string, options: LinkOptions): Promise<void> {
    await linkManager.link(parentId, childId, options)
    await triggerReflow({ type: 'link' })
  }

  async function unlinkSeries(childId: string): Promise<void> {
    await linkManager.unlink(childId)
    await triggerReflow({ type: 'link' })
  }

  // ========== Constraints (delegates to constraintManager) ==========

  async function addConstraint(constraint: ConstraintInput): Promise<string> {
    const id = await constraintManager.add(constraint)
    await triggerReflow({ type: 'constraint' })
    return id
  }

  async function removeConstraint(id: string): Promise<void> {
    await constraintManager.remove(id)
    await triggerReflow({ type: 'constraint' })
  }

  async function getConstraints(): Promise<StoredConstraint[]> {
    return constraintManager.reader.getAll()
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
        if (!pattern.condition || conditionEvaluator.evaluate(pattern.condition, seriesId, date)) {
          found = true
          break
        }
      }
    }
    if (!found) return null

    const exKey = `${seriesId}:${date}`
    const exception = exceptionStore.reader.getByKey(exKey)
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
    const existing = exceptionStore.reader.getByKey(exKey)
    if (existing?.type === 'cancelled') {
      throw new AlreadyCancelledError(`Instance on ${date} is already cancelled`)
    }

    await adapter.createInstanceException({
      id: uuid(), seriesId, originalDate: date, type: 'cancelled',
    })
    exceptionStore.set(exKey, { seriesId, date, type: 'cancelled' })
    await triggerReflow({ type: 'exception' })
  }

  async function rescheduleInstance(seriesId: string, date: LocalDate, newTime: LocalDateTime): Promise<void> {
    const s = await getFullSeries(seriesId)
    if (!s) throw new NotFoundError(`Series ${seriesId} not found`)

    const exKey = `${seriesId}:${date}`
    const existing = exceptionStore.reader.getByKey(exKey)
    if (existing?.type === 'cancelled') {
      throw new CancelledInstanceError(`Cannot reschedule cancelled instance on ${date}`)
    }

    // Chain bounds validation
    const link = linkManager.reader.get(seriesId)
    if (link) {
      const parentSeries = await getFullSeries(link.parentId)
      if (parentSeries) {
        const parentEnd = linkManager.getParentEndTime(parentSeries, link.parentId, date)
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
    exceptionStore.set(exKey, { seriesId, date, type: 'rescheduled', newTime })
    await triggerReflow({ type: 'exception' })
  }

  // ========== Completions ==========

  async function logCompletion(seriesId: string, date: LocalDate, options?: LogCompletionOptions): Promise<string> {
    const id = await completionTracker.log(seriesId, date, options)
    await triggerReflow({ type: 'completion' })
    return id
  }

  async function getCompletions(seriesId: string): Promise<Completion[]> {
    return completionTracker.getCompletions(seriesId)
  }

  async function deleteCompletion(id: string): Promise<void> {
    await completionTracker.deleteCompletion(id)
    await triggerReflow({ type: 'completion' })
  }

  // ========== Schedule ==========

  async function getSchedule(start: LocalDate, end: LocalDate): Promise<Schedule> {
    return scheduleEngine.getSchedule(start, end)
  }

  async function getConflicts(): Promise<Conflict[]> {
    return [...cachedConflicts]
  }

  // ========== Reminders (delegates to reminderManager) ==========

  async function createReminder(seriesId: string, options: ReminderOptions): Promise<string> {
    return reminderManager.create(seriesId, options)
  }

  async function getPendingReminders(asOf: LocalDateTime): Promise<PendingReminder[]> {
    return reminderManager.getPending(asOf)
  }

  async function checkReminders(asOf: LocalDateTime): Promise<void> {
    return reminderManager.check(asOf)
  }

  async function acknowledgeReminder(id: string, asOf: LocalDateTime): Promise<void> {
    return reminderManager.acknowledge(id, asOf)
  }

  // ========== Conditions ==========

  async function evaluateCondition(condition: ConditionNode, date: LocalDate): Promise<boolean> {
    return conditionEvaluator.evaluate(condition, '', date)
  }

  async function getActiveConditions(seriesId: string, date: LocalDate): Promise<ActiveConditionInfo[]> {
    const s = await getFullSeries(seriesId)
    if (!s) return []

    const active: ActiveConditionInfo[] = []
    for (const pattern of (s.patterns || [])) {
      if (pattern.condition) {
        const result = conditionEvaluator.evaluate(pattern.condition, seriesId, date)
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
    return linkManager.getChainDepthSync(seriesId)
  }

  // ========== Hydration ==========
  // Load persisted state from adapter into in-memory maps.
  // Call once after createAutoplanner() when using a persistent adapter.

  async function hydrate(): Promise<void> {
    await linkManager.hydrate()
    await completionTracker.hydrate()
    await exceptionStore.hydrate()
    await constraintManager.hydrate()
    await reminderManager.hydrate()
    await seriesStore.hydrate()
    conditionEvaluator.rebuildIndex()
  }

  function getCacheStats() {
    return scheduleEngine.getCacheStats()
  }

  function getConditionDeps(): Map<string, Set<string>> {
    return conditionEvaluator.getDeps()
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
