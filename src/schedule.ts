/**
 * Schedule Engine
 *
 * Pure per-series schedule generation. Expands patterns, applies instance exceptions
 * (remove cancelled, use rescheduled times). Pre-reflow, single-series.
 *
 * The core function `expandSchedule()` is pure — it operates on in-memory data
 * with no adapter calls. `getSchedule()` is a convenience wrapper that loads
 * data from the adapter and delegates.
 */

import type { Adapter, InstanceException, Pattern as AdapterPattern, Series as AdapterSeries } from './adapter'
import type { LocalDate, LocalDateTime, LocalTime } from './time-date'
import { makeDateTime, makeTime, dateOf } from './time-date'
import { expandPattern, toExpandablePattern, type DateRange } from './pattern-expansion'

// ============================================================================
// Types
// ============================================================================

export type ScheduleInstance = {
  date: LocalDate
  time: LocalDateTime
  seriesId: string
}

/** Input for the pure schedule engine — pre-loaded in-memory data */
export type ExpandScheduleInput = {
  seriesId: string
  timeOfDay?: string
  startDate?: LocalDate
  endDate?: LocalDate
  patterns: AdapterPattern[]
  exceptions: InstanceException[]
}

// ============================================================================
// Pure Schedule Engine
// ============================================================================

/**
 * Pure function: expand patterns and apply exceptions to produce schedule instances.
 * No adapter calls — all data must be pre-loaded.
 */
export function expandSchedule(input: ExpandScheduleInput, range: DateRange): ScheduleInstance[] {
  // Determine effective range (intersect with series date bounds)
  const effectiveStart =
    input.startDate && input.startDate > range.start ? input.startDate : range.start
  const effectiveEnd =
    input.endDate && input.endDate < range.end ? input.endDate : range.end

  if (effectiveStart > effectiveEnd) return []

  // Expand patterns
  const allDates = new Set<LocalDate>()
  const seriesStart = (input.startDate ?? range.start) as LocalDate

  for (const p of input.patterns) {
    const expanded = expandPattern(
      toExpandablePattern(p, seriesStart),
      { start: effectiveStart, end: effectiveEnd },
      seriesStart
    )
    for (const d of expanded) {
      allDates.add(d)
    }
  }

  // Index exceptions by date
  const exceptionMap = new Map<string, InstanceException>()
  for (const e of input.exceptions) {
    exceptionMap.set(e.originalDate as string, e)
  }

  // Build instances
  const instances: ScheduleInstance[] = []

  for (const date of [...allDates].sort()) {
    const exception = exceptionMap.get(date as string)

    if (exception) {
      if (exception.type === 'cancelled') {
        continue
      }
      if (exception.type === 'rescheduled') {
        const newTime = exception.newTime as LocalDateTime
        const newDate = dateOf(newTime)
        // Only include if new date is in the query range
        if (newDate >= range.start && newDate <= range.end) {
          instances.push({
            date: newDate,
            time: newTime,
            seriesId: input.seriesId,
          })
        }
        continue
      }
    }

    // Normal instance
    const time =
      input.timeOfDay === 'allDay'
        ? makeDateTime(date, makeTime(0, 0, 0))
        : makeDateTime(date, (input.timeOfDay ?? '09:00:00') as LocalTime)

    instances.push({
      date,
      time,
      seriesId: input.seriesId,
    })
  }

  // Sort by date
  instances.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  return instances
}

// ============================================================================
// Adapter Convenience Wrapper
// ============================================================================

/**
 * Load series data from adapter and delegate to the pure schedule engine.
 * Convenience for callers that haven't pre-loaded data.
 */
export async function getSchedule(
  adapter: Adapter,
  input: { seriesId: string; range: DateRange }
): Promise<ScheduleInstance[]> {
  const series = await adapter.getSeries(input.seriesId)
  if (!series) return []

  const patterns = await adapter.getPatternsBySeries(input.seriesId)
  const exceptions = await adapter.getExceptionsBySeries(input.seriesId)

  const timeOfDay = series['timeOfDay'] as string | undefined
  return expandSchedule(
    {
      seriesId: input.seriesId,
      ...(timeOfDay != null ? { timeOfDay } : {}),
      ...(series.startDate != null ? { startDate: series.startDate } : {}),
      ...(series.endDate != null ? { endDate: series.endDate } : {}),
      patterns,
      exceptions,
    },
    input.range
  )
}
