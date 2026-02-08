/**
 * Completions Module
 *
 * Domain-level completion management. Completions record what actually happened.
 * They provide the historical record that conditions query to affect future scheduling,
 * and support adaptive duration calculations.
 */

import type { Adapter, Completion as AdapterCompletion } from './adapter'
import type { LocalDate, LocalDateTime } from './time-date'
import { minutesBetween, daysBetween, addDays, parseDate, parseDateTime, ParseError } from './time-date'

// ============================================================================
// Types
// ============================================================================

type CompletionResult<T> = { ok: true; value: T } | { ok: false; error: { type: string; message: string } }

export type { Target, DomainCompletion } from './domain-types'
import type { Target, DomainCompletion } from './domain-types'

type LogInput = {
  seriesId: string
  instanceDate: LocalDate
  startTime: LocalDateTime
  endTime: LocalDateTime
}

type TargetWindowInput = {
  target: Target
  windowDays: number
  asOf: LocalDate
}

type DaysSinceInput = {
  target: Target
  asOf: LocalDate
}

type AdaptiveMode = { type: 'lastN'; n: number } | { type: 'windowDays'; days: number }

type AdaptiveInput = {
  seriesId: string
  mode: AdaptiveMode
  asOf: LocalDate
}

// ============================================================================
// Helpers
// ============================================================================

function ok<T>(value: T): CompletionResult<T> {
  return { ok: true, value }
}

function err<T>(type: string, message: string): CompletionResult<T> {
  return { ok: false, error: { type, message } }
}

function enrichCompletion(row: AdapterCompletion): DomainCompletion {
  const result: DomainCompletion = {
    id: row.id,
    seriesId: row.seriesId,
    date: row.date ?? row.instanceDate,
    instanceDate: row.instanceDate,
    createdAt: row.createdAt ?? new Date().toISOString(),
  }
  if (row.startTime) result.startTime = row.startTime
  if (row.endTime) result.endTime = row.endTime
  if (row.durationMinutes != null) {
    result.durationMinutes = row.durationMinutes
  } else if (row.startTime && row.endTime) {
    result.durationMinutes = minutesBetween(row.startTime, row.endTime)
  }
  return result
}

function generateId(): string {
  return crypto.randomUUID()
}

function isValidDate(s: string): boolean {
  return parseDate(s).ok
}

function isValidDateTime(s: string): boolean {
  return parseDateTime(s).ok
}

async function resolveSeriesIds(adapter: Adapter, target: Target): Promise<string[]> {
  if (target.type === 'seriesId') {
    return [target.seriesId]
  }
  // tag target: find all series with this tag
  const series = await adapter.getSeriesByTag(target.tag)
  return series.map(s => s.id)
}

function windowStart(asOf: LocalDate, windowDays: number): LocalDate {
  // 7-day window with asOf: [asOf-6, asOf] inclusive
  return addDays(asOf, -(windowDays - 1))
}

function isInWindow(date: LocalDate, start: LocalDate, end: LocalDate): boolean {
  return date >= start && date <= end
}

// ============================================================================
// Public API
// ============================================================================

export async function logCompletion(
  adapter: Adapter,
  input: LogInput
): Promise<CompletionResult<{ id: string }>> {
  // Validate instanceDate
  if (!isValidDate(input.instanceDate as string)) {
    return err('ValidationError', `Invalid instanceDate: '${input.instanceDate}'`)
  }

  // Validate startTime
  if (!isValidDateTime(input.startTime as string)) {
    return err('ValidationError', `Invalid startTime: '${input.startTime}'`)
  }

  // Validate endTime
  if (!isValidDateTime(input.endTime as string)) {
    return err('ValidationError', `Invalid endTime: '${input.endTime}'`)
  }

  // Check series exists
  const series = await adapter.getSeries(input.seriesId)
  if (!series) {
    return err('NotFoundError', `Series '${input.seriesId}' not found`)
  }

  // Check endTime >= startTime
  if (input.endTime < input.startTime) {
    return err('InvalidTimeRangeError', `endTime must be >= startTime`)
  }

  // Check for duplicate (same seriesId + instanceDate)
  const existing = await adapter.getCompletionByInstance(input.seriesId, input.instanceDate)
  if (existing) {
    return err('DuplicateCompletionError', `Completion already exists for series '${input.seriesId}' on ${input.instanceDate}`)
  }

  const id = generateId()
  const durationMinutes = minutesBetween(input.startTime, input.endTime)
  const createdAt = new Date().toISOString()

  await adapter.createCompletion({
    id,
    seriesId: input.seriesId,
    instanceDate: input.instanceDate,
    date: input.instanceDate,
    startTime: input.startTime,
    endTime: input.endTime,
    durationMinutes,
    createdAt,
  })

  return ok({ id })
}

export async function getCompletion(
  adapter: Adapter,
  id: string
): Promise<DomainCompletion | null> {
  const row = await adapter.getCompletion(id)
  if (!row) return null
  return enrichCompletion(row)
}

export async function getCompletionByInstance(
  adapter: Adapter,
  seriesId: string,
  instanceDate: LocalDate
): Promise<DomainCompletion | null> {
  const row = await adapter.getCompletionByInstance(seriesId, instanceDate)
  if (!row) return null
  return enrichCompletion(row)
}

export async function getCompletionsBySeries(
  adapter: Adapter,
  seriesId: string
): Promise<DomainCompletion[]> {
  const rows = await adapter.getCompletionsBySeries(seriesId)
  const enriched = rows.map(enrichCompletion)
  // Sort by date descending
  enriched.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0))
  return enriched
}

export async function getCompletionsByTarget(
  adapter: Adapter,
  input: TargetWindowInput
): Promise<DomainCompletion[]> {
  const seriesIds = await resolveSeriesIds(adapter, input.target)
  const start = windowStart(input.asOf, input.windowDays)

  const allCompletions: DomainCompletion[] = []
  for (const seriesId of seriesIds) {
    const rows = await adapter.getCompletionsBySeries(seriesId)
    for (const row of rows) {
      const date = row.date ?? row.instanceDate
      if (isInWindow(date, start, input.asOf)) {
        allCompletions.push(enrichCompletion(row))
      }
    }
  }

  // Sort by date descending
  allCompletions.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0))
  return allCompletions
}

export async function deleteCompletion(
  adapter: Adapter,
  id: string
): Promise<CompletionResult<void>> {
  const existing = await adapter.getCompletion(id)
  if (!existing) {
    return err('NotFoundError', `Completion '${id}' not found`)
  }
  await adapter.deleteCompletion(id)
  return ok(undefined as void)
}

export async function countCompletionsInWindow(
  adapter: Adapter,
  input: TargetWindowInput
): Promise<number> {
  const completions = await getCompletionsByTarget(adapter, input)
  return completions.length
}

export async function daysSinceLastCompletion(
  adapter: Adapter,
  input: DaysSinceInput
): Promise<number | null> {
  const seriesIds = await resolveSeriesIds(adapter, input.target)

  let mostRecentDate: LocalDate | null = null

  for (const seriesId of seriesIds) {
    const rows = await adapter.getCompletionsBySeries(seriesId)
    for (const row of rows) {
      const date = row.date ?? row.instanceDate
      // Only consider completions on or before asOf
      if (date <= input.asOf) {
        if (!mostRecentDate || date > mostRecentDate) {
          mostRecentDate = date
        }
      }
    }
  }

  if (!mostRecentDate) return null
  return daysBetween(mostRecentDate, input.asOf)
}

export async function getDurationsForAdaptive(
  adapter: Adapter,
  input: AdaptiveInput
): Promise<number[]> {
  const rows = await adapter.getCompletionsBySeries(input.seriesId)
  const enriched = rows.map(enrichCompletion)

  // Filter to completions on or before asOf
  let filtered = enriched.filter(c => c.date <= input.asOf)

  // Sort by date descending (most recent first)
  filtered.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0))

  if (input.mode.type === 'lastN') {
    filtered = filtered.slice(0, input.mode.n)
  } else {
    // windowDays mode
    const start = windowStart(input.asOf, input.mode.days)
    filtered = filtered.filter(c => isInWindow(c.date, start, input.asOf))
  }

  return filtered.map(c => c.durationMinutes).filter((d): d is number => d != null)
}
