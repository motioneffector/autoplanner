/**
 * Schedule Module
 *
 * Per-series schedule generation. Expands patterns, applies instance exceptions
 * (remove cancelled, use rescheduled times). Pre-reflow, single-series.
 */

import type { Adapter, InstanceException } from './adapter'
import type { LocalDate, LocalDateTime, LocalTime } from './time-date'
import { makeDateTime, makeTime, dateOf } from './time-date'
import { expandPattern, type Pattern, type DateRange } from './pattern-expansion'

// ============================================================================
// Types
// ============================================================================

export type ScheduleInstance = {
  date: LocalDate
  time: LocalDateTime
  seriesId: string
}

type ScheduleInput = {
  seriesId: string
  range: DateRange
}

// ============================================================================
// Public API
// ============================================================================

export async function getSchedule(
  adapter: Adapter,
  input: ScheduleInput
): Promise<ScheduleInstance[]> {
  const series = await adapter.getSeries(input.seriesId)
  if (!series) return []

  // Determine effective range (intersect with series date bounds)
  const effectiveStart =
    series.startDate && series.startDate > input.range.start ? series.startDate : input.range.start
  const effectiveEnd =
    series.endDate && series.endDate < input.range.end
      ? series.endDate
      : input.range.end

  if (effectiveStart > effectiveEnd) return []

  // Expand patterns
  const patterns = await adapter.getPatternsBySeries(input.seriesId)
  const allDates = new Set<LocalDate>()

  for (const p of patterns) {
    const expanded = expandPattern(
      p as unknown as Pattern,
      { start: effectiveStart, end: effectiveEnd },
      (series.startDate ?? input.range.start) as LocalDate
    )
    for (const d of expanded) {
      allDates.add(d)
    }
  }

  // Get exceptions for this series
  const exceptions = await adapter.getExceptionsBySeries(input.seriesId)
  const exceptionMap = new Map<string, InstanceException>()
  for (const e of exceptions) {
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
        if (newDate >= input.range.start && newDate <= input.range.end) {
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
      series['timeOfDay'] === 'allDay'
        ? makeDateTime(date, makeTime(0, 0, 0))
        : makeDateTime(date, series['timeOfDay'] as LocalTime)

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
