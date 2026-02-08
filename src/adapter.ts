/**
 * Adapter
 *
 * Domain-oriented persistence interface + in-memory mock implementation.
 * All methods are async to support both sync (bun:sqlite) and async adapters.
 */

import { type LocalDate, type LocalDateTime, addDays, daysBetween } from './time-date'

export type { LocalDate, LocalDateTime } from './time-date'

// ============================================================================
// Error Classes
// ============================================================================

export class DuplicateKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DuplicateKeyError'
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ForeignKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForeignKeyError'
  }
}

export class InvalidDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDataError'
  }
}

// ============================================================================
// Entity Types
// ============================================================================

export type Series = {
  id: string
  title: string
  description?: string
  createdAt: LocalDateTime
  locked?: boolean
  startDate?: LocalDate
  endDate?: LocalDate
  updatedAt?: LocalDateTime
  [key: string]: unknown
}

export type Pattern = {
  id: string
  seriesId: string
  type: string
  conditionId: string | null
  time?: string
  n?: number
  day?: number
  month?: number
  weekday?: number | string
  allDay?: boolean
  duration?: number
  fixed?: boolean
  [key: string]: unknown
}

export type Condition = {
  id: string
  seriesId: string
  parentId: string | null
  type: string
  operator?: string
  value?: number
  windowDays?: number
  seriesRef?: string
  comparison?: string
  days?: number[]
  [key: string]: unknown
}

export type Completion = {
  id: string
  seriesId: string
  instanceDate: LocalDate
  date: LocalDate
  startTime?: LocalDateTime
  endTime?: LocalDateTime
  durationMinutes?: number
  createdAt?: string
}

export type InstanceException = {
  id: string
  seriesId: string
  originalDate: LocalDate
  type: string
  newDate?: LocalDate
  newTime?: LocalDateTime
  [key: string]: unknown
}

export type AdaptiveDurationConfig = {
  seriesId: string
  fallbackDuration: number
  bufferPercent: number
  lastN: number
  windowDays: number
}

export type CyclingConfig = {
  seriesId: string
  currentIndex: number
  gapLeap: boolean
  mode?: string
}

export type CyclingItem = {
  seriesId: string
  position: number
  title: string
  duration: number
}

export type Reminder = {
  id: string
  seriesId: string
  minutesBefore: number
  label: string
}

export type ReminderAck = {
  reminderId: string
  instanceDate: LocalDate
  acknowledgedAt: LocalDateTime
}

export type RelationalConstraint = {
  id: string
  type: string
  sourceTarget: { tag: string } | { seriesId: string }
  destinationTarget: { tag: string } | { seriesId: string }
  withinMinutes?: number
  [key: string]: unknown
}

export type Link = {
  id: string
  parentSeriesId: string
  childSeriesId: string
  targetDistance: number
  earlyWobble: number
  lateWobble: number
}

export type Tag = {
  id: string
  name: string
}

// ============================================================================
// Adapter Interface
// ============================================================================

export interface Adapter {
  transaction<T>(fn: () => Promise<T>): Promise<T>

  // Series
  createSeries(series: Series): Promise<void>
  getSeries(id: string): Promise<Series | null>
  getAllSeries(): Promise<Series[]>
  getSeriesByTag(tagName: string): Promise<Series[]>
  updateSeries(id: string, changes: Partial<Series>): Promise<void>
  deleteSeries(id: string): Promise<void>

  // Pattern
  createPattern(pattern: Pattern): Promise<void>
  getPattern(id: string): Promise<Pattern | null>
  getPatternsBySeries(seriesId: string): Promise<Pattern[]>
  deletePattern(id: string): Promise<void>

  // Pattern Weekday
  setPatternWeekdays(patternId: string, weekdays: string[]): Promise<void>
  getPatternWeekdays(patternId: string): Promise<string[]>
  getAllPatternWeekdays(): Promise<{ patternId: string; weekday: string }[]>

  // Condition
  createCondition(condition: Condition): Promise<void>
  getCondition(id: string): Promise<Condition | null>
  getConditionsBySeries(seriesId: string): Promise<Condition[]>
  updateCondition(id: string, changes: Partial<Condition>): Promise<void>
  deleteCondition(id: string): Promise<void>

  // Adaptive Duration
  setAdaptiveDuration(seriesId: string, config: AdaptiveDurationConfig | null): Promise<void>
  getAdaptiveDuration(seriesId: string): Promise<AdaptiveDurationConfig | null>

  // Cycling Config
  setCyclingConfig(seriesId: string, config: CyclingConfig | null): Promise<void>
  getCyclingConfig(seriesId: string): Promise<CyclingConfig | null>
  updateCyclingIndex(seriesId: string, index: number): Promise<void>

  // Cycling Items
  setCyclingItems(seriesId: string, items: CyclingItem[]): Promise<void>
  getCyclingItems(seriesId: string): Promise<CyclingItem[]>

  // Instance Exception
  createInstanceException(exception: InstanceException): Promise<void>
  getInstanceException(seriesId: string, originalDate: LocalDate): Promise<InstanceException | null>
  getExceptionsBySeries(seriesId: string): Promise<InstanceException[]>
  getExceptionsInRange(seriesId: string, start: LocalDate, end: LocalDate): Promise<InstanceException[]>
  getAllExceptions(): Promise<InstanceException[]>
  deleteInstanceException(id: string): Promise<void>

  // Completion
  createCompletion(completion: Completion): Promise<void>
  getCompletion(id: string): Promise<Completion | null>
  getCompletionsBySeries(seriesId: string): Promise<Completion[]>
  getCompletionByInstance(seriesId: string, instanceDate: LocalDate): Promise<Completion | null>
  deleteCompletion(id: string): Promise<void>
  getAllCompletions(): Promise<Completion[]>
  countCompletionsInWindow(seriesId: string, start: LocalDate, end: LocalDate): Promise<number>
  daysSinceLastCompletion(seriesId: string, asOf: LocalDate): Promise<number | null>
  getRecentDurations(
    seriesId: string,
    options: { lastN: number } | { windowDays: number; asOf: LocalDate }
  ): Promise<number[]>

  // Tag
  createTag(name: string): Promise<string>
  getTagByName(name: string): Promise<Tag | null>
  addTagToSeries(seriesId: string, tagName: string): Promise<void>
  removeTagFromSeries(seriesId: string, tagName: string): Promise<void>
  getTagsForSeries(seriesId: string): Promise<Tag[]>
  getAllSeriesTags(): Promise<{ seriesId: string; tagId: string }[]>
  deleteTag(id: string): Promise<void>

  // Reminder
  createReminder(reminder: Reminder): Promise<void>
  getReminder(id: string): Promise<Reminder | null>
  getRemindersBySeries(seriesId: string): Promise<Reminder[]>
  getAllReminders(): Promise<Reminder[]>
  updateReminder(id: string, changes: Partial<Reminder>): Promise<void>
  deleteReminder(id: string): Promise<void>

  // Reminder Acknowledgment
  acknowledgeReminder(reminderId: string, instanceDate: LocalDate, acknowledgedAt: LocalDateTime): Promise<void>
  isReminderAcknowledged(reminderId: string, instanceDate: LocalDate): Promise<boolean>
  getReminderAcksInRange(start: LocalDate, end: LocalDate): Promise<ReminderAck[]>
  purgeOldReminderAcks(olderThan: LocalDate): Promise<void>

  // Relational Constraint
  createRelationalConstraint(constraint: RelationalConstraint): Promise<void>
  getRelationalConstraint(id: string): Promise<RelationalConstraint | null>
  getAllRelationalConstraints(): Promise<RelationalConstraint[]>
  deleteRelationalConstraint(id: string): Promise<void>

  // Link
  createLink(link: Link): Promise<void>
  getLink(id: string): Promise<Link | null>
  getLinkByChild(childSeriesId: string): Promise<Link | null>
  getLinksByParent(parentSeriesId: string): Promise<Link[]>
  getAllLinks(): Promise<Link[]>
  updateLink(id: string, changes: Partial<Link>): Promise<void>
  deleteLink(id: string): Promise<void>

  // Lifecycle (optional — persistent adapters may implement)
  close?(): Promise<void>
}

// ============================================================================
// Mock Adapter
// ============================================================================

export function createMockAdapter(): Adapter {
  // ---- State ----
  const state = {
    series: new Map<string, Series>(),
    patterns: new Map<string, Pattern>(),
    weekdays: new Map<string, string[]>(),
    conditions: new Map<string, Condition>(),
    completions: new Map<string, Completion>(),
    adaptiveDurations: new Map<string, AdaptiveDurationConfig>(),
    cyclingConfigs: new Map<string, CyclingConfig>(),
    cyclingItems: new Map<string, CyclingItem[]>(),
    exceptions: new Map<string, InstanceException>(),
    tags: new Map<string, Tag>(),
    seriesTags: new Map<string, Set<string>>(),
    reminders: new Map<string, Reminder>(),
    acks: new Map<string, ReminderAck>(),
    constraints: new Map<string, RelationalConstraint>(),
    links: new Map<string, Link>(),
  }

  // ---- Transaction ----
  let txDepth = 0
  let snapshot: typeof state | null = null

  function restoreState(snap: typeof state) {
    Object.assign(state, snap)
  }

  // ---- Helpers ----
  function clone<T>(obj: T): T {
    return structuredClone(obj)
  }

  function addAliases<T>(obj: T): T {
    if (typeof obj !== 'object' || obj === null) return obj
    const record = obj as Record<string, unknown>
    for (const key of Object.keys(record)) {
      const sk = key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
      if (sk !== key && !(sk in record)) {
        record[sk] = record[key]
      }
    }
    return obj
  }

  function ca<T>(obj: T): T {
    return addAliases(clone(obj))
  }

  function durationMinutes(start: string, end: string): number {
    const [sd, st] = start.split('T') as [string, string]
    const [ed, et] = end.split('T') as [string, string]
    const [sh, sm] = st.split(':').map(Number) as [number, number]
    const [eh, em] = et.split(':').map(Number) as [number, number]
    const days = daysBetween(sd as LocalDate, ed as LocalDate)
    return days * 1440 + (eh - sh) * 60 + (em - sm)
  }

  function cascadeDeletePattern(patternId: string) {
    state.patterns.delete(patternId)
    state.weekdays.delete(patternId)
  }

  function cascadeDeleteCondition(conditionId: string) {
    // Find and delete children first
    for (const [id, c] of state.conditions) {
      if (c.parentId === conditionId) {
        cascadeDeleteCondition(id)
      }
    }
    state.conditions.delete(conditionId)
  }

  function cascadeDeleteReminder(reminderId: string) {
    state.reminders.delete(reminderId)
    // Delete associated acks
    for (const [key, ack] of state.acks) {
      if (ack.reminderId === reminderId) {
        state.acks.delete(key)
      }
    }
  }

  function wouldCycleCondition(conditionId: string, newParentId: string | null): boolean {
    if (newParentId === null) return false
    let current: string | null = newParentId
    while (current !== null) {
      if (current === conditionId) return true
      const cond = state.conditions.get(current)
      if (!cond) break
      current = cond.parentId ?? null
    }
    return false
  }

  function linkRootDepth(seriesId: string): number {
    let depth = 0
    let current = seriesId
    while (true) {
      const link = [...state.links.values()].find((l) => l.childSeriesId === current)
      if (!link) break
      depth++
      current = link.parentSeriesId
    }
    return depth
  }

  function linkSubtreeDepth(seriesId: string): number {
    const children = [...state.links.values()].filter((l) => l.parentSeriesId === seriesId)
    if (children.length === 0) return 0
    return 1 + Math.max(...children.map((c) => linkSubtreeDepth(c.childSeriesId)))
  }

  function wouldCycleLink(parentId: string, childId: string): boolean {
    let current = parentId
    while (true) {
      if (current === childId) return true
      const link = [...state.links.values()].find((l) => l.childSeriesId === current)
      if (!link) break
      current = link.parentSeriesId
    }
    return false
  }

  // ---- Adapter implementation ----
  const adapter = {
    // ================================================================
    // Transaction
    // ================================================================
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      const isOutermost = txDepth === 0
      if (isOutermost) {
        snapshot = clone(state)
      }
      txDepth++
      try {
        const result = await fn()
        txDepth--
        if (txDepth === 0) snapshot = null
        return result
      } catch (e) {
        txDepth--
        if (txDepth === 0 && snapshot) {
          restoreState(snapshot)
          snapshot = null
        }
        throw e
      }
    },

    // ================================================================
    // Series
    // ================================================================
    async createSeries(series: Series) {
      if (state.series.has(series.id)) {
        throw new DuplicateKeyError(`Series '${series.id}' already exists`)
      }
      state.series.set(series.id, clone(series))
    },

    async getSeries(id: string) {
      const s = state.series.get(id)
      return s ? clone(s) : null
    },

    async getAllSeries() {
      return [...state.series.values()].map(clone)
    },

    async getSeriesByTag(tagName: string) {
      const tag = [...state.tags.values()].find((t) => t.name === tagName)
      if (!tag) return []
      const result: Series[] = []
      for (const [seriesId, tagIds] of state.seriesTags) {
        if (tagIds.has(tag.id)) {
          const s = state.series.get(seriesId)
          if (s) result.push(clone(s))
        }
      }
      return result
    },

    async updateSeries(id: string, changes: Partial<Series>) {
      const existing = state.series.get(id)
      if (!existing) throw new NotFoundError(`Series '${id}' not found`)
      state.series.set(id, { ...existing, ...changes })
    },

    async deleteSeries(id: string) {
      // RESTRICT: check completions
      for (const c of state.completions.values()) {
        if (c.seriesId === id) {
          throw new ForeignKeyError(`Cannot delete series '${id}': has completions`)
        }
      }
      // RESTRICT: check parent links (this series is a parent with children)
      for (const l of state.links.values()) {
        if (l.parentSeriesId === id) {
          throw new ForeignKeyError(`Cannot delete series '${id}': has linked children`)
        }
      }

      // CASCADE: patterns (and their weekdays)
      for (const [pid, p] of state.patterns) {
        if (p.seriesId === id) cascadeDeletePattern(pid)
      }
      // CASCADE: conditions
      for (const [cid, c] of state.conditions) {
        if (c.seriesId === id) state.conditions.delete(cid)
      }
      // CASCADE: adaptive duration
      state.adaptiveDurations.delete(id)
      // CASCADE: cycling config + items
      state.cyclingConfigs.delete(id)
      state.cyclingItems.delete(id)
      // CASCADE: instance exceptions
      for (const [eid, e] of state.exceptions) {
        if (e.seriesId === id) state.exceptions.delete(eid)
      }
      // CASCADE: reminders (and their acks)
      for (const [rid, r] of state.reminders) {
        if (r.seriesId === id) cascadeDeleteReminder(rid)
      }
      // CASCADE: tag associations (not the tags themselves)
      state.seriesTags.delete(id)
      // CASCADE: links where this series is a child
      for (const [lid, l] of state.links) {
        if (l.childSeriesId === id) state.links.delete(lid)
      }

      state.series.delete(id)
    },

    // ================================================================
    // Pattern
    // ================================================================
    async createPattern(pattern: Pattern) {
      if (!state.series.has(pattern.seriesId)) {
        throw new ForeignKeyError(`Series '${pattern.seriesId}' not found`)
      }
      if (state.patterns.has(pattern.id)) {
        throw new DuplicateKeyError(`Pattern '${pattern.id}' already exists`)
      }
      state.patterns.set(pattern.id, clone(pattern))
    },

    async getPattern(id: string) {
      const p = state.patterns.get(id)
      return p ? ca(p) : null
    },

    async getPatternsBySeries(seriesId: string) {
      return [...state.patterns.values()].filter((p) => p.seriesId === seriesId).map(ca)
    },

    async deletePattern(id: string) {
      cascadeDeletePattern(id)
    },

    // ================================================================
    // Pattern Weekday
    // ================================================================
    async setPatternWeekdays(patternId: string, weekdays: string[]) {
      state.weekdays.set(patternId, [...weekdays])
    },

    async getPatternWeekdays(patternId: string) {
      return [...(state.weekdays.get(patternId) ?? [])]
    },

    async getAllPatternWeekdays() {
      const result: { patternId: string; weekday: string }[] = []
      for (const [patternId, days] of state.weekdays) {
        for (const weekday of days) {
          result.push({ patternId, weekday })
        }
      }
      return result
    },

    // ================================================================
    // Condition
    // ================================================================
    async createCondition(condition: Condition) {
      if (!state.series.has(condition.seriesId)) {
        throw new ForeignKeyError(`Series '${condition.seriesId}' not found`)
      }
      if (condition.parentId !== null && condition.parentId !== undefined) {
        if (!state.conditions.has(condition.parentId)) {
          throw new ForeignKeyError(`Parent condition '${condition.parentId}' not found`)
        }
      }
      if (state.conditions.has(condition.id)) {
        throw new DuplicateKeyError(`Condition '${condition.id}' already exists`)
      }
      state.conditions.set(condition.id, clone(condition))
    },

    async getCondition(id: string) {
      const c = state.conditions.get(id)
      return c ? ca(c) : null
    },

    async getConditionsBySeries(seriesId: string) {
      return [...state.conditions.values()].filter((c) => c.seriesId === seriesId).map(ca)
    },

    async updateCondition(id: string, changes: Partial<Condition>) {
      const existing = state.conditions.get(id)
      if (!existing) throw new NotFoundError(`Condition '${id}' not found`)
      if ('parentId' in changes && changes.parentId !== null && changes.parentId !== undefined) {
        if (!state.conditions.has(changes.parentId)) {
          throw new ForeignKeyError(`Parent condition '${changes.parentId}' not found`)
        }
        if (wouldCycleCondition(id, changes.parentId)) {
          throw new InvalidDataError(`Setting parentId '${changes.parentId}' would create a cycle`)
        }
      }
      state.conditions.set(id, { ...existing, ...changes })
    },

    async deleteCondition(id: string) {
      cascadeDeleteCondition(id)
    },

    // ================================================================
    // Adaptive Duration
    // ================================================================
    async setAdaptiveDuration(seriesId: string, config: AdaptiveDurationConfig | null) {
      if (config === null) {
        state.adaptiveDurations.delete(seriesId)
      } else {
        state.adaptiveDurations.set(seriesId, clone(config))
      }
    },

    async getAdaptiveDuration(seriesId: string) {
      const c = state.adaptiveDurations.get(seriesId)
      return c ? clone(c) : null
    },

    // ================================================================
    // Cycling Config
    // ================================================================
    async setCyclingConfig(seriesId: string, config: CyclingConfig | null) {
      if (config === null) {
        state.cyclingConfigs.delete(seriesId)
        state.cyclingItems.delete(seriesId)
      } else {
        state.cyclingConfigs.set(seriesId, clone(config))
      }
    },

    async getCyclingConfig(seriesId: string) {
      const c = state.cyclingConfigs.get(seriesId)
      return c ? clone(c) : null
    },

    async updateCyclingIndex(seriesId: string, index: number) {
      const existing = state.cyclingConfigs.get(seriesId)
      if (!existing) throw new NotFoundError(`Cycling config for '${seriesId}' not found`)
      state.cyclingConfigs.set(seriesId, { ...existing, currentIndex: index })
    },

    // ================================================================
    // Cycling Items
    // ================================================================
    async setCyclingItems(seriesId: string, items: CyclingItem[]) {
      state.cyclingItems.set(seriesId, clone(items))
    },

    async getCyclingItems(seriesId: string) {
      const items = state.cyclingItems.get(seriesId)
      if (!items) return []
      return clone(items).sort((a, b) => a.position - b.position).map(addAliases)
    },

    // ================================================================
    // Instance Exception
    // ================================================================
    async createInstanceException(exception: InstanceException) {
      if (!state.series.has(exception.seriesId)) {
        throw new ForeignKeyError(`Series '${exception.seriesId}' not found`)
      }
      // Unique (seriesId, originalDate)
      for (const e of state.exceptions.values()) {
        if (e.seriesId === exception.seriesId && e.originalDate === exception.originalDate) {
          throw new DuplicateKeyError(
            `Exception for series '${exception.seriesId}' on '${exception.originalDate}' already exists`
          )
        }
      }
      state.exceptions.set(exception.id, clone(exception))
    },

    async getInstanceException(seriesId: string, originalDate: LocalDate) {
      for (const e of state.exceptions.values()) {
        if (e.seriesId === seriesId && e.originalDate === originalDate) {
          return ca(e)
        }
      }
      return null
    },

    async getExceptionsBySeries(seriesId: string) {
      return [...state.exceptions.values()].filter((e) => e.seriesId === seriesId).map(ca)
    },

    async getExceptionsInRange(seriesId: string, start: LocalDate, end: LocalDate) {
      return [...state.exceptions.values()]
        .filter(
          (e) =>
            e.seriesId === seriesId &&
            (e.originalDate as string) >= (start as string) &&
            (e.originalDate as string) <= (end as string)
        )
        .map(ca)
    },

    async getAllExceptions() {
      return [...state.exceptions.values()].map(ca)
    },

    async deleteInstanceException(id: string) {
      state.exceptions.delete(id)
    },

    // ================================================================
    // Completion
    // ================================================================
    async createCompletion(completion: Completion) {
      if (!state.series.has(completion.seriesId)) {
        throw new ForeignKeyError(`Series '${completion.seriesId}' not found`)
      }
      // Unique (seriesId, instanceDate)
      for (const c of state.completions.values()) {
        if (c.seriesId === completion.seriesId && c.instanceDate === completion.instanceDate) {
          throw new DuplicateKeyError(
            `Completion for series '${completion.seriesId}' on '${completion.instanceDate}' already exists`
          )
        }
      }
      if (state.completions.has(completion.id)) {
        throw new DuplicateKeyError(`Completion '${completion.id}' already exists`)
      }
      state.completions.set(completion.id, clone(completion))
    },

    async getCompletion(id: string) {
      const c = state.completions.get(id)
      return c ? ca(c) : null
    },

    async getCompletionsBySeries(seriesId: string) {
      return [...state.completions.values()].filter((c) => c.seriesId === seriesId).map(ca)
    },

    async getCompletionByInstance(seriesId: string, instanceDate: LocalDate) {
      for (const c of state.completions.values()) {
        if (c.seriesId === seriesId && c.instanceDate === instanceDate) {
          return ca(c)
        }
      }
      return null
    },

    async deleteCompletion(id: string) {
      state.completions.delete(id)
    },

    async getAllCompletions() {
      return [...state.completions.values()].map(ca)
    },

    async countCompletionsInWindow(seriesId: string, start: LocalDate, end: LocalDate) {
      let count = 0
      for (const c of state.completions.values()) {
        if (
          c.seriesId === seriesId &&
          (c.date as string) >= (start as string) &&
          (c.date as string) <= (end as string)
        ) {
          count++
        }
      }
      return count
    },

    async daysSinceLastCompletion(seriesId: string, asOf: LocalDate) {
      let latest: LocalDate | null = null
      for (const c of state.completions.values()) {
        if (c.seriesId === seriesId) {
          if (latest === null || (c.date as string) > (latest as string)) {
            latest = c.date
          }
        }
      }
      if (latest === null) return null
      return daysBetween(latest, asOf)
    },

    async getRecentDurations(
      seriesId: string,
      options: { lastN: number } | { windowDays: number; asOf: LocalDate }
    ) {
      const completions = [...state.completions.values()]
        .filter((c) => c.seriesId === seriesId)
        .sort((a, b) => ((b.date as string) > (a.date as string) ? 1 : -1))

      let filtered: Completion[]
      if ('lastN' in options) {
        filtered = completions.slice(0, options.lastN)
      } else {
        const windowStart = addDays(options.asOf, -(options.windowDays - 1))
        filtered = completions.filter(
          (c) =>
            (c.date as string) >= (windowStart as string) &&
            (c.date as string) <= (options.asOf as string)
        )
      }

      return filtered.map((c) => durationMinutes(c.startTime as string, c.endTime as string))
    },

    // ================================================================
    // Tag
    // ================================================================
    async createTag(name: string) {
      // Return existing if name exists
      for (const t of state.tags.values()) {
        if (t.name === name) return t.id
      }
      const id = crypto.randomUUID()
      state.tags.set(id, { id, name })
      return id
    },

    async getTagByName(name: string) {
      for (const t of state.tags.values()) {
        if (t.name === name) return clone(t)
      }
      return null
    },

    async addTagToSeries(seriesId: string, tagName: string) {
      // Create tag if needed
      let tagId: string | undefined
      for (const t of state.tags.values()) {
        if (t.name === tagName) {
          tagId = t.id
          break
        }
      }
      if (!tagId) {
        tagId = crypto.randomUUID()
        state.tags.set(tagId, { id: tagId, name: tagName })
      }
      // Create association (idempotent)
      if (!state.seriesTags.has(seriesId)) {
        state.seriesTags.set(seriesId, new Set())
      }
      state.seriesTags.get(seriesId)!.add(tagId)
    },

    async removeTagFromSeries(seriesId: string, tagName: string) {
      const tag = [...state.tags.values()].find((t) => t.name === tagName)
      if (!tag) return
      const tagIds = state.seriesTags.get(seriesId)
      if (tagIds) tagIds.delete(tag.id)
    },

    async getTagsForSeries(seriesId: string) {
      const tagIds = state.seriesTags.get(seriesId)
      if (!tagIds) return []
      return [...tagIds]
        .map((id) => state.tags.get(id))
        .filter((t): t is Tag => t !== undefined)
        .map(clone)
    },

    async getAllSeriesTags() {
      const result: { seriesId: string; tagId: string }[] = []
      for (const [seriesId, tagIds] of state.seriesTags) {
        for (const tagId of tagIds) {
          result.push({ seriesId, tagId })
        }
      }
      return result
    },

    async deleteTag(id: string) {
      state.tags.delete(id)
      // Cascade: remove all associations
      for (const tagIds of state.seriesTags.values()) {
        tagIds.delete(id)
      }
    },

    // ================================================================
    // Reminder
    // ================================================================
    async createReminder(reminder: Reminder) {
      if (state.reminders.has(reminder.id)) {
        throw new DuplicateKeyError(`Reminder '${reminder.id}' already exists`)
      }
      state.reminders.set(reminder.id, clone(reminder))
    },

    async getReminder(id: string) {
      const r = state.reminders.get(id)
      return r ? ca(r) : null
    },

    async getRemindersBySeries(seriesId: string) {
      return [...state.reminders.values()].filter((r) => r.seriesId === seriesId).map(ca)
    },

    async getAllReminders() {
      return [...state.reminders.values()].map(ca)
    },

    async updateReminder(id: string, changes: Partial<Reminder>) {
      const existing = state.reminders.get(id)
      if (!existing) throw new NotFoundError(`Reminder '${id}' not found`)
      state.reminders.set(id, { ...existing, ...changes })
    },

    async deleteReminder(id: string) {
      cascadeDeleteReminder(id)
    },

    // ================================================================
    // Reminder Acknowledgment
    // ================================================================
    async acknowledgeReminder(
      reminderId: string,
      instanceDate: LocalDate,
      acknowledgedAt: LocalDateTime
    ) {
      const key = `${reminderId}:${instanceDate}`
      state.acks.set(key, { reminderId, instanceDate, acknowledgedAt })
    },

    async isReminderAcknowledged(reminderId: string, instanceDate: LocalDate) {
      return state.acks.has(`${reminderId}:${instanceDate}`)
    },

    async getReminderAcksInRange(start: LocalDate, end: LocalDate) {
      return [...state.acks.values()]
        .filter(
          (a) =>
            (a.instanceDate as string) >= (start as string) &&
            (a.instanceDate as string) <= (end as string)
        )
        .map(ca)
    },

    async purgeOldReminderAcks(olderThan: LocalDate) {
      for (const [key, ack] of state.acks) {
        if ((ack.instanceDate as string) < (olderThan as string)) {
          state.acks.delete(key)
        }
      }
    },

    async getAcknowledgedRemindersInRange(start: LocalDate, end: LocalDate) {
      return [...state.acks.values()]
        .filter(
          (a) =>
            (a.instanceDate as string) >= (start as string) &&
            (a.instanceDate as string) <= (end as string)
        )
        .map((a) => ({
          reminder_id: a.reminderId,
          instance_date: a.instanceDate,
          acknowledged_at: a.acknowledgedAt,
        }))
    },

    // ================================================================
    // Relational Constraint
    // ================================================================
    async createRelationalConstraint(constraint: RelationalConstraint) {
      if (state.constraints.has(constraint.id)) {
        throw new DuplicateKeyError(`Constraint '${constraint.id}' already exists`)
      }
      state.constraints.set(constraint.id, clone(constraint))
    },

    async getRelationalConstraint(id: string) {
      const c = state.constraints.get(id)
      return c ? ca(c) : null
    },

    async getAllRelationalConstraints() {
      return [...state.constraints.values()].map(ca)
    },

    async deleteRelationalConstraint(id: string) {
      state.constraints.delete(id)
    },

    // Alias used by constraint tests
    async getConstraints() {
      return [...state.constraints.values()].map(ca)
    },

    // ================================================================
    // Link
    // ================================================================
    async createLink(link: Link) {
      // Self-link prevention
      if (link.parentSeriesId === link.childSeriesId) {
        throw new InvalidDataError('Cannot link a series to itself')
      }
      // FK validation
      if (!state.series.has(link.parentSeriesId)) {
        throw new ForeignKeyError(`Parent series '${link.parentSeriesId}' not found`)
      }
      if (!state.series.has(link.childSeriesId)) {
        throw new ForeignKeyError(`Child series '${link.childSeriesId}' not found`)
      }
      // One parent per child
      for (const l of state.links.values()) {
        if (l.childSeriesId === link.childSeriesId) {
          throw new DuplicateKeyError(`Series '${link.childSeriesId}' already has a parent link`)
        }
      }
      // Cycle detection
      if (wouldCycleLink(link.parentSeriesId, link.childSeriesId)) {
        throw new InvalidDataError('Link would create a cycle')
      }
      // Depth check: total chain depth must not exceed 32
      const depth = linkRootDepth(link.parentSeriesId) + 1 + linkSubtreeDepth(link.childSeriesId)
      if (depth > 32) {
        throw new InvalidDataError(`Chain depth ${depth} exceeds maximum of 32`)
      }

      if (state.links.has(link.id)) {
        throw new DuplicateKeyError(`Link '${link.id}' already exists`)
      }
      state.links.set(link.id, clone(link))
    },

    async getLink(id: string) {
      const l = state.links.get(id)
      return l ? ca(l) : null
    },

    async getLinkByChild(childSeriesId: string) {
      for (const l of state.links.values()) {
        if (l.childSeriesId === childSeriesId) return ca(l)
      }
      return null
    },

    async getLinksByParent(parentSeriesId: string) {
      return [...state.links.values()]
        .filter((l) => l.parentSeriesId === parentSeriesId)
        .map(ca)
    },

    async getAllLinks() {
      return [...state.links.values()].map(ca)
    },

    async updateLink(id: string, changes: Partial<Link>) {
      const existing = state.links.get(id)
      if (!existing) throw new NotFoundError(`Link '${id}' not found`)
      state.links.set(id, { ...existing, ...changes })
    },

    async deleteLink(id: string) {
      state.links.delete(id)
    },
  }

  return adapter
}

export type MockAdapter = Adapter
