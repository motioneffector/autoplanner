/**
 * Instance Exceptions Module
 *
 * Modify individual occurrences without changing the series rule.
 * An instance can be cancelled (removed) or rescheduled (moved).
 */

import type { Adapter, InstanceException as AdapterException } from './adapter'
import type { LocalDate, LocalDateTime } from './time-date'
import { parseDateTime, dateOf } from './time-date'
import { expandPattern, toExpandablePattern } from './pattern-expansion'

// ============================================================================
// Types
// ============================================================================

type ExceptionResult<T> = { ok: true; value: T } | { ok: false; error: { type: string; message: string } }

export type DomainException = {
  id: string
  seriesId: string
  instanceDate: LocalDate
  type: 'cancelled' | 'rescheduled'
  newTime?: LocalDateTime
}

// ============================================================================
// Helpers
// ============================================================================

function ok<T>(value: T): ExceptionResult<T> {
  return { ok: true, value }
}

function err<T>(type: string, message: string): ExceptionResult<T> {
  return { ok: false, error: { type, message } }
}

function toDomain(e: AdapterException): DomainException {
  const result: DomainException = {
    id: e.id,
    seriesId: e.seriesId,
    instanceDate: e.originalDate,
    type: e.type as 'cancelled' | 'rescheduled',
  }
  if (e.type === 'rescheduled' && e.newTime) {
    result.newTime = e.newTime
  }
  return result
}

async function isValidInstance(
  adapter: Adapter,
  seriesId: string,
  date: LocalDate
): Promise<boolean> {
  const series = await adapter.getSeries(seriesId)
  if (!series) return false

  if (series.startDate && date < series.startDate) return false
  if (series.endDate && date > series.endDate) return false

  const patterns = await adapter.getPatternsBySeries(seriesId)
  if (patterns.length === 0) {
    return date === series.startDate
  }

  for (const p of patterns) {
    const seriesStart = (series.startDate ?? date) as LocalDate
    const expanded = expandPattern(
      toExpandablePattern(p, seriesStart),
      { start: date, end: date },
      seriesStart
    )
    if (expanded.has(date)) return true
  }

  return false
}

// ============================================================================
// Public API
// ============================================================================

export async function cancelInstance(
  adapter: Adapter,
  seriesId: string,
  targetDate: LocalDate
): Promise<ExceptionResult<void>> {
  const series = await adapter.getSeries(seriesId)
  if (!series) {
    return err('NotFoundError', `Series '${seriesId}' not found`)
  }

  const existing = await adapter.getInstanceException(seriesId, targetDate)
  if (existing) {
    if (existing.type === 'cancelled') {
      return err('AlreadyCancelledError', `Instance on ${targetDate} is already cancelled`)
    }
    // Rescheduled → overwrite with cancel
    await adapter.deleteInstanceException(existing.id)
  } else {
    const valid = await isValidInstance(adapter, seriesId, targetDate)
    if (!valid) {
      return err('NonExistentInstanceError', `No instance on ${targetDate}`)
    }
  }

  await adapter.createInstanceException({
    id: crypto.randomUUID(),
    seriesId,
    originalDate: targetDate,
    type: 'cancelled',
  })

  return ok(undefined as void)
}

export async function rescheduleInstance(
  adapter: Adapter,
  seriesId: string,
  targetDate: LocalDate,
  newTime: LocalDateTime
): Promise<ExceptionResult<void>> {
  const series = await adapter.getSeries(seriesId)
  if (!series) {
    return err('NotFoundError', `Series '${seriesId}' not found`)
  }

  const parseResult = parseDateTime(newTime as string)
  if (!parseResult.ok) {
    return err('ValidationError', `Invalid newTime: '${newTime}'`)
  }

  const existing = await adapter.getInstanceException(seriesId, targetDate)
  if (existing) {
    if (existing.type === 'cancelled') {
      return err('CancelledInstanceError', `Instance on ${targetDate} is cancelled`)
    }
    // Already rescheduled → update
    await adapter.deleteInstanceException(existing.id)
  } else {
    const valid = await isValidInstance(adapter, seriesId, targetDate)
    if (!valid) {
      return err('NonExistentInstanceError', `No instance on ${targetDate}`)
    }
  }

  await adapter.createInstanceException({
    id: crypto.randomUUID(),
    seriesId,
    originalDate: targetDate,
    type: 'rescheduled',
    newTime,
  })

  return ok(undefined as void)
}

export async function restoreInstance(
  adapter: Adapter,
  seriesId: string,
  targetDate: LocalDate
): Promise<ExceptionResult<void>> {
  const existing = await adapter.getInstanceException(seriesId, targetDate)
  if (!existing) {
    return err('NoExceptionError', `No exception for instance on ${targetDate}`)
  }

  await adapter.deleteInstanceException(existing.id)
  return ok(undefined as void)
}

export async function getException(
  adapter: Adapter,
  seriesId: string,
  targetDate: LocalDate
): Promise<DomainException | null> {
  const e = await adapter.getInstanceException(seriesId, targetDate)
  if (!e) return null
  return toDomain(e)
}

export async function getExceptionsBySeries(
  adapter: Adapter,
  seriesId: string
): Promise<DomainException[]> {
  const exceptions = await adapter.getExceptionsBySeries(seriesId)
  return exceptions.map(toDomain)
}

export async function getExceptionsInRange(
  adapter: Adapter,
  seriesId: string,
  range: { start: LocalDate; end: LocalDate }
): Promise<DomainException[]> {
  const exceptions = await adapter.getExceptionsInRange(seriesId, range.start, range.end)
  return exceptions.map(toDomain)
}
