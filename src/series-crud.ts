/**
 * Series CRUD
 *
 * Domain-level series management with validation, business rules,
 * tag management, and series splitting.
 */

import {
  type LocalDate,
  type LocalDateTime,
  type LocalTime,
  parseDate,
  parseTime,
  addDays,
  makeDateTime,
  makeTime,
} from './time-date'

import { type Adapter, type Series as AdapterSeries } from './adapter'

export type { LocalDate, LocalDateTime, LocalTime } from './time-date'

// ============================================================================
// Error Classes
// ============================================================================

export {
  ValidationError, NotFoundError, LockedSeriesError,
  CompletionsExistError, LinkedChildrenExistError,
} from './errors'
import {
  ValidationError, NotFoundError, LockedSeriesError,
  CompletionsExistError, LinkedChildrenExistError,
} from './errors'

// ============================================================================
// Types
// ============================================================================

// ============================================================================
// Result Type
// ============================================================================

export type CrudResult<T> = { ok: true; value: T } | { ok: false; error: { type: string; message: string } }

// ============================================================================
// Types
// ============================================================================

export type AdaptiveDurationInput = {
  type: 'adaptive'
  fallback: number
  bufferPercent: number
  min?: number
  max?: number
}

type PatternShape = {
  type: string
  n?: number
  day?: number
  month?: number
  weekday?: number | string
  allDay?: boolean
  duration?: number
  fixed?: boolean
  time?: string
  daysOfWeek?: (number | string)[]
  dayOfWeek?: number | string
  dayOfMonth?: number
  days?: number[]
  condition?: unknown
}

export type SeriesInput = {
  title: string
  startDate: LocalDate
  timeOfDay?: LocalTime | 'allDay'
  duration?: number | 'allDay' | AdaptiveDurationInput
  description?: string
  endDate?: LocalDate
  count?: number
  patterns?: PatternShape[]
  pattern?: PatternShape
  time?: LocalDateTime
  tags?: string[]
  wiggle?: {
    daysBefore: number
    daysAfter: number
    earliest?: LocalTime
    latest?: LocalTime
  }
  fixed?: boolean
  reminders?: { minutes: number }[]
  cycling?: {
    items: string[]
    mode?: 'sequential' | 'random'
    gapLeap: boolean
    currentIndex?: number
  }
}

export type SeriesUpdate = {
  title?: string
  description?: string
  startDate?: LocalDate
  endDate?: LocalDate
  timeOfDay?: LocalTime | 'allDay'
  duration?: number | 'allDay' | AdaptiveDurationInput
  count?: number
  locked?: boolean
  fixed?: boolean
  wiggle?: SeriesInput['wiggle']
}

export type Series = {
  id: string
  title: string
  description?: string
  startDate: LocalDate
  endDate?: LocalDate
  timeOfDay: LocalTime | 'allDay'
  duration: number | 'allDay' | AdaptiveDurationInput
  count?: number
  createdAt: LocalDateTime
  updatedAt: LocalDateTime
  locked: boolean
  fixed?: boolean
  wiggle?: SeriesInput['wiggle']
}

// ============================================================================
// Validation Helpers
// ============================================================================

function validateDate(date: string, fieldName: string): void {
  const result = parseDate(date)
  if (!result.ok) {
    throw new ValidationError(`Invalid ${fieldName}: ${date}`)
  }
}

function validateTime(time: string): void {
  const result = parseTime(time)
  if (!result.ok) {
    throw new ValidationError(`Invalid timeOfDay: ${time}`)
  }
}

function nowISO(): LocalDateTime {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const pad3 = (n: number) => n.toString().padStart(3, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad3(d.getMilliseconds())}` as LocalDateTime
}

/** Normalize input: resolve aliases (pattern→patterns, time→timeOfDay), apply defaults */
function normalizeInput(input: SeriesInput): SeriesInput {
  const normalized = { ...input }

  // pattern (singular) → patterns array
  if (normalized.pattern && !normalized.patterns) {
    normalized.patterns = [normalized.pattern]
  }

  // time (LocalDateTime) → extract timeOfDay
  if (normalized.time && !normalized.timeOfDay) {
    const timePart = (normalized.time as string).substring(11)
    normalized.timeOfDay = timePart as LocalTime
  }

  // Defaults for timeOfDay and duration
  if (normalized.timeOfDay === undefined) {
    normalized.timeOfDay = 'allDay'
  }
  if (normalized.duration === undefined) {
    normalized.duration = normalized.timeOfDay === 'allDay' ? 'allDay' : 30
  }

  return normalized
}

function validateSeriesInput(input: SeriesInput): void {
  // Title
  if (!input.title || input.title.trim().length === 0) {
    throw new ValidationError('Title must not be empty')
  }

  // Start date format
  validateDate(input.startDate as string, 'startDate')

  // End date
  if (input.endDate !== undefined) {
    validateDate(input.endDate as string, 'endDate')
    if ((input.endDate as string) <= (input.startDate as string)) {
      throw new ValidationError('endDate must be > startDate (exclusive)')
    }
  }

  // Count
  if (input.count !== undefined) {
    if (input.count < 1) {
      throw new ValidationError('count must be >= 1')
    }
    if (input.endDate !== undefined) {
      throw new ValidationError('count and endDate are mutually exclusive')
    }
  }

  // Time of day
  if (input.timeOfDay === 'allDay') {
    if (input.duration !== undefined && input.duration !== 'allDay') {
      throw new ValidationError('allDay timeOfDay requires allDay duration')
    }
  } else if (input.timeOfDay !== undefined) {
    validateTime(input.timeOfDay as string)
    if (input.duration === 'allDay') {
      throw new ValidationError('non-allDay timeOfDay cannot have allDay duration')
    }
  }

  // Duration
  if (typeof input.duration === 'number') {
    if (input.duration <= 0) {
      throw new ValidationError('duration must be > 0')
    }
  } else if (typeof input.duration === 'object' && input.duration !== null && 'type' in input.duration && (input.duration as { type: string }).type === 'adaptive') {
    const adaptive = input.duration as AdaptiveDurationInput
    if (adaptive.fallback < 1) {
      throw new ValidationError('adaptive fallback must be >= 1')
    }
    if (adaptive.min !== undefined && adaptive.max !== undefined) {
      if (adaptive.min >= adaptive.max) {
        throw new ValidationError('adaptive min must be < max')
      }
    }
  }

  // Patterns
  if (input.patterns) {
    for (const p of input.patterns) {
      if (!p.type || typeof p.type !== 'string') {
        throw new ValidationError('Each pattern must have a type')
      }
    }
  }

  // Wiggle
  if (input.wiggle) {
    if (input.wiggle.daysBefore < 0) {
      throw new ValidationError('wiggle daysBefore must be >= 0')
    }
    if (input.wiggle.daysAfter < 0) {
      throw new ValidationError('wiggle daysAfter must be >= 0')
    }
    if (input.wiggle.earliest && input.wiggle.latest) {
      if ((input.wiggle.earliest as string) >= (input.wiggle.latest as string)) {
        throw new ValidationError('wiggle earliest must be < latest')
      }
    }
  }

  // Fixed + wiggle conflict
  if (input.fixed && input.wiggle) {
    if (input.wiggle.daysBefore !== 0 || input.wiggle.daysAfter !== 0) {
      throw new ValidationError('fixed series cannot have non-zero wiggle')
    }
  }

  // Reminders
  if (input.reminders) {
    for (const r of input.reminders) {
      if (r.minutes < 0) {
        throw new ValidationError('reminder minutes must be >= 0')
      }
    }
  }

  // Cycling
  if (input.cycling) {
    if (!input.cycling.items || input.cycling.items.length === 0) {
      throw new ValidationError('Cycling items must not be empty')
    }
  }
}

// ============================================================================
// CRUD Operations
// ============================================================================

export async function createSeries(
  adapter: Adapter,
  rawInput: SeriesInput
): Promise<string> {
  const input = normalizeInput(rawInput)

  validateSeriesInput(input)

  const id = crypto.randomUUID()
  const now = nowISO()

  // One-time inference: no patterns, no count, no endDate → count = 1
  let count = input.count
  if (!input.patterns?.length && count === undefined && input.endDate === undefined) {
    count = 1
  }

  // Build series object
  const series: Record<string, unknown> = {
    id,
    title: input.title,
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate,
    timeOfDay: input.timeOfDay,
    duration: input.duration,
    count,
    createdAt: now,
    updatedAt: now,
    locked: false,
    fixed: input.fixed,
    wiggle: input.wiggle,
    cycling: input.cycling ? {
      items: input.cycling.items,
      mode: input.cycling.mode ?? 'sequential',
      gapLeap: input.cycling.gapLeap,
      currentIndex: input.cycling.currentIndex ?? 0,
    } : undefined,
  }

  await adapter.createSeries(series as AdapterSeries)

  // Create patterns
  if (input.patterns) {
    for (const p of input.patterns) {
      await adapter.createPattern({
        ...p,
        id: crypto.randomUUID(),
        seriesId: id,
        conditionId: null,
      })
    }
  }

  // Create reminders
  if (input.reminders) {
    for (const r of input.reminders) {
      await adapter.createReminder({
        id: crypto.randomUUID(),
        seriesId: id,
        minutesBefore: r.minutes,
        label: '',
      })
    }
  }

  // Create cycling
  if (input.cycling) {
    await adapter.setCyclingConfig(id, {
      seriesId: id,
      currentIndex: input.cycling.currentIndex ?? 0,
      gapLeap: input.cycling.gapLeap,
      mode: input.cycling.mode ?? 'sequential',
    })
    await adapter.setCyclingItems(
      id,
      input.cycling.items.map((title, i) => ({
        seriesId: id,
        position: i,
        title,
        duration: 0,
      }))
    )
  }

  // Create adaptive duration config
  if (typeof input.duration === 'object' && input.duration !== null && 'type' in input.duration && (input.duration as { type: string }).type === 'adaptive') {
    const adaptive = input.duration as AdaptiveDurationInput
    await adapter.setAdaptiveDuration(id, {
      seriesId: id,
      fallbackDuration: adaptive.fallback,
      bufferPercent: adaptive.bufferPercent,
      lastN: 5,
      windowDays: 30,
    })
  }

  // Create tags
  if (input.tags) {
    for (const tagName of input.tags) {
      await adapter.addTagToSeries(id, tagName)
    }
  }

  return id
}

export async function getSeries(adapter: Adapter, id: string): Promise<Series | null> {
  return (await adapter.getSeries(id)) as Series | null
}

export async function getSeriesByTag(adapter: Adapter, tagName: string): Promise<Series[]> {
  return (await adapter.getSeriesByTag(tagName)) as Series[]
}

export async function getAllSeries(adapter: Adapter): Promise<Series[]> {
  return (await adapter.getAllSeries()) as Series[]
}

export async function updateSeries(
  adapter: Adapter,
  id: string,
  changes: SeriesUpdate
): Promise<void> {
  const existing = await adapter.getSeries(id)
  if (!existing) {
    throw new NotFoundError(`Series '${id}' not found`)
  }

  // Immutable fields
  if ('id' in changes) {
    throw new ValidationError('Cannot change series id')
  }
  if ('createdAt' in changes) {
    throw new ValidationError('Cannot change createdAt')
  }

  // Lock check: allow only if unlocking
  if (existing.locked && changes.locked !== false) {
    throw new LockedSeriesError(`Series '${id}' is locked`)
  }

  // Validate changes
  if ('title' in changes && changes.title !== undefined) {
    if (!changes.title || changes.title.trim().length === 0) {
      throw new ValidationError('Title must not be empty')
    }
  }

  const now = nowISO()
  // Strip undefined values so adapter only sees fields the caller actually set.
  // Under exactOptionalPropertyTypes, Partial<Series> rejects undefined —
  // and rightly so: a real adapter must distinguish "absent" from "set to null."
  const defined = Object.fromEntries(
    Object.entries({ ...changes, updatedAt: now }).filter(([, v]) => v !== undefined)
  ) as Partial<import('./adapter').Series>
  await adapter.updateSeries(id, defined)
}

export async function deleteSeries(
  adapter: Adapter,
  id: string
): Promise<void> {
  const existing = await adapter.getSeries(id)
  if (!existing) {
    throw new NotFoundError(`Series '${id}' not found`)
  }

  // Check for completions
  const completions = await adapter.getCompletionsBySeries(id)
  if (completions.length > 0) {
    throw new CompletionsExistError(`Cannot delete series '${id}': has completions`)
  }

  // Check for child links
  const childLinks = await adapter.getLinksByParent(id)
  if (childLinks.length > 0) {
    throw new LinkedChildrenExistError(`Cannot delete series '${id}': has linked children`)
  }

  await adapter.deleteSeries(id)
}

export async function lockSeries(adapter: Adapter, id: string): Promise<void> {
  const existing = await adapter.getSeries(id)
  if (!existing) {
    throw new NotFoundError(`Series '${id}' not found`)
  }
  await adapter.updateSeries(id, { locked: true })
}

export async function unlockSeries(adapter: Adapter, id: string): Promise<void> {
  const existing = await adapter.getSeries(id)
  if (!existing) {
    throw new NotFoundError(`Series '${id}' not found`)
  }
  await adapter.updateSeries(id, { locked: false })
}

export async function splitSeries(
  adapter: Adapter,
  id: string,
  splitDate: LocalDate,
  overrides: Partial<SeriesInput>
): Promise<string> {
  const existing = (await adapter.getSeries(id)) as Series | null
  if (!existing) {
    throw new NotFoundError(`Series '${id}' not found`)
  }

  if (existing.locked) {
    throw new LockedSeriesError(`Series '${id}' is locked`)
  }

  // Validate split date
  if ((splitDate as string) <= (existing.startDate as string)) {
    throw new ValidationError('splitDate must be after startDate')
  }
  if (existing.endDate && (splitDate as string) >= (existing.endDate as string)) {
    throw new ValidationError('splitDate must be < endDate (exclusive)')
  }

  const newId = crypto.randomUUID()
  const now = nowISO()

  // Set original endDate to splitDate (exclusive: last valid day is splitDate - 1)
  const newOriginalEndDate = splitDate
  await adapter.updateSeries(id, { endDate: newOriginalEndDate, updatedAt: now })

  // Create new series inheriting from original
  const newSeries: Record<string, unknown> = {
    id: newId,
    title: overrides.title ?? existing.title,
    description: overrides.description ?? existing.description,
    startDate: splitDate,
    endDate: existing.endDate,
    timeOfDay: overrides.timeOfDay ?? existing.timeOfDay,
    duration: overrides.duration ?? existing.duration,
    count: existing.count,
    createdAt: now,
    updatedAt: now,
    locked: false,
    fixed: existing.fixed,
    wiggle: existing.wiggle,
  }

  await adapter.createSeries(newSeries as AdapterSeries)

  // Copy patterns
  const patterns = await adapter.getPatternsBySeries(id)
  for (const p of patterns) {
    await adapter.createPattern({
      ...p,
      id: crypto.randomUUID(),
      seriesId: newId,
    })
  }

  // Copy reminders
  const reminders = await adapter.getRemindersBySeries(id)
  for (const r of reminders) {
    await adapter.createReminder({
      id: crypto.randomUUID(),
      seriesId: newId,
      minutesBefore: r.minutesBefore,
      label: r.label,
    })
  }

  // Transfer cycling state
  const cyclingConfig = await adapter.getCyclingConfig(id)
  if (cyclingConfig) {
    await adapter.setCyclingConfig(newId, {
      seriesId: newId,
      currentIndex: cyclingConfig.currentIndex,
      gapLeap: cyclingConfig.gapLeap,
    })
    const items = await adapter.getCyclingItems(id)
    if (items.length > 0) {
      await adapter.setCyclingItems(
        newId,
        items.map((item) => ({
          ...item,
          seriesId: newId,
        }))
      )
    }
  }

  // Copy adaptive duration
  const adaptiveConfig = await adapter.getAdaptiveDuration(id)
  if (adaptiveConfig) {
    await adapter.setAdaptiveDuration(newId, {
      ...adaptiveConfig,
      seriesId: newId,
    })
  }

  // Copy tags
  const tags = await adapter.getTagsForSeries(id)
  for (const tag of tags) {
    await adapter.addTagToSeries(newId, tag.name)
  }

  return newId
}

// ============================================================================
// Tag Operations
// ============================================================================

export async function addTagToSeries(
  adapter: Adapter,
  seriesId: string,
  tagName: string
): Promise<void> {
  const existing = await adapter.getSeries(seriesId)
  if (!existing) {
    throw new NotFoundError(`Series '${seriesId}' not found`)
  }
  await adapter.addTagToSeries(seriesId, tagName)
}

export async function removeTagFromSeries(
  adapter: Adapter,
  seriesId: string,
  tagName: string
): Promise<void> {
  await adapter.removeTagFromSeries(seriesId, tagName)
}

export async function getTagsForSeries(
  adapter: Adapter,
  seriesId: string
): Promise<string[]> {
  const tags = await adapter.getTagsForSeries(seriesId)
  return tags.map((t) => t.name)
}
