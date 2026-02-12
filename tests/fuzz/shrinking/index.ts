/**
 * Custom shrinkers for fuzz testing.
 *
 * Shrinkers help fast-check find minimal failing cases by progressively
 * simplifying complex test inputs while preserving the failure condition.
 *
 * When a property test fails, fast-check uses shrinkers to find the
 * smallest input that still reproduces the failure.
 */
import * as fc from 'fast-check'
import { makeLocalDate, parseLocalDate, makeLocalTime, parseLocalTime } from '../lib/utils'
import type { LocalDate, LocalTime, Duration, SeriesId, Pattern, Condition, Series, Link, RelationalConstraint } from '../lib/types'

// ============================================================================
// Date Range Shrinker (Task #485)
// ============================================================================

/**
 * Represents a date range to be shrunk.
 */
export interface DateRange {
  start: LocalDate
  end: LocalDate
}

/**
 * Shrinks a date range by:
 * 1. Halving the range (keeping start, moving end closer)
 * 2. Shrinking by one day at a time
 *
 * This helps find the minimal date range that causes a failure.
 */
export function shrinkDateRange(range: DateRange): fc.Stream<DateRange> {
  const shrinks: DateRange[] = []

  const startParsed = parseLocalDate(range.start)
  const endParsed = parseLocalDate(range.end)

  const startDate = new Date(Date.UTC(startParsed.year, startParsed.month - 1, startParsed.day))
  const endDate = new Date(Date.UTC(endParsed.year, endParsed.month - 1, endParsed.day))

  const daysBetween = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  // Can't shrink if range is already 0 days
  if (daysBetween <= 0) {
    return fc.Stream.nil()
  }

  // Strategy 1: Halve the range (keep start, move end closer)
  if (daysBetween >= 2) {
    const halfDays = Math.floor(daysBetween / 2)
    const halfDate = new Date(startDate.getTime() + halfDays * 24 * 60 * 60 * 1000)
    if (isNaN(halfDate.getTime())) throw new Error('Invalid half date in shrinkDateRange')
    shrinks.push({
      start: range.start,
      end: makeLocalDate(halfDate.getUTCFullYear(), halfDate.getUTCMonth() + 1, halfDate.getUTCDate()),
    })
  }

  // Strategy 2: Shrink by one day (from the end)
  const oneDayLess = new Date(endDate.getTime() - 24 * 60 * 60 * 1000)
  if (isNaN(oneDayLess.getTime())) throw new Error('Invalid oneDayLess in shrinkDateRange')
  if (oneDayLess >= startDate) {
    shrinks.push({
      start: range.start,
      end: makeLocalDate(oneDayLess.getUTCFullYear(), oneDayLess.getUTCMonth() + 1, oneDayLess.getUTCDate()),
    })
  }

  // Strategy 3: Shrink by one day (from the start)
  const oneDayMore = new Date(startDate.getTime() + 24 * 60 * 60 * 1000)
  if (isNaN(oneDayMore.getTime())) throw new Error('Invalid oneDayMore in shrinkDateRange')
  if (oneDayMore <= endDate) {
    shrinks.push({
      start: makeLocalDate(oneDayMore.getUTCFullYear(), oneDayMore.getUTCMonth() + 1, oneDayMore.getUTCDate()),
      end: range.end,
    })
  }

  return fc.Stream.of(...shrinks)
}

/**
 * Creates an Arbitrary for date ranges with custom shrinking.
 */
export function dateRangeArb(options?: {
  minDays?: number
  maxDays?: number
  minYear?: number
  maxYear?: number
}): fc.Arbitrary<DateRange> {
  const minDays = options?.minDays ?? 0
  const maxDays = options?.maxDays ?? 365
  const minYear = options?.minYear ?? 2020
  const maxYear = options?.maxYear ?? 2030

  return fc
    .tuple(
      fc.integer({ min: minYear, max: maxYear }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: 28 }), // Avoid month-end issues
      fc.integer({ min: minDays, max: maxDays })
    )
    .map(([year, month, day, rangeDays]) => {
      const start = makeLocalDate(year, month, day)
      const startDate = new Date(Date.UTC(year, month - 1, day))
      if (isNaN(startDate.getTime())) throw new Error(`Invalid start date in dateRangeArb: ${year}-${month}-${day}`)
      const endDate = new Date(startDate.getTime() + rangeDays * 24 * 60 * 60 * 1000)
      if (isNaN(endDate.getTime())) throw new Error(`Invalid end date in dateRangeArb`)
      const end = makeLocalDate(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, endDate.getUTCDate())
      return { start, end }
    })
}

// ============================================================================
// Duration Shrinker
// ============================================================================

/**
 * Shrinks a duration by halving and decrementing.
 */
export function shrinkDuration(duration: Duration): fc.Stream<Duration> {
  const value = duration as number
  if (value <= 1) {
    return fc.Stream.nil()
  }

  const shrinks: Duration[] = []

  // Halve
  if (value >= 2) {
    shrinks.push(Math.floor(value / 2) as Duration)
  }

  // Decrement
  shrinks.push((value - 1) as Duration)

  // Try common values
  const commonDurations = [15, 30, 45, 60, 90, 120] as Duration[]
  for (const common of commonDurations) {
    if (common < value) {
      shrinks.push(common)
    }
  }

  return fc.Stream.of(...shrinks)
}

// ============================================================================
// Series Array Shrinker (Task #486 - stub)
// ============================================================================

/**
 * Shrinks an array of series by:
 * 1. Removing one series at a time
 * 2. Halving the array
 */
export function shrinkSeriesArray(series: Series[]): fc.Stream<Series[]> {
  if (series.length <= 1) {
    return fc.Stream.nil()
  }

  const shrinks: Series[][] = []

  // Remove one at a time
  for (let i = 0; i < series.length; i++) {
    shrinks.push([...series.slice(0, i), ...series.slice(i + 1)])
  }

  // Halve
  if (series.length >= 4) {
    shrinks.push(series.slice(0, Math.floor(series.length / 2)))
    shrinks.push(series.slice(Math.floor(series.length / 2)))
  }

  return fc.Stream.of(...shrinks)
}

// ============================================================================
// Pattern Shrinker (Task #487 - stub)
// ============================================================================

/**
 * Shrinks a pattern by simplifying its type or reducing parameters.
 */
export function shrinkPattern(pattern: Pattern): fc.Stream<Pattern> {
  const shrinks: Pattern[] = []

  // Always try to simplify to 'daily' (simplest pattern)
  if (pattern.type !== 'daily') {
    shrinks.push({ type: 'daily' })
  }

  // Pattern-specific simplifications
  switch (pattern.type) {
    case 'everyNDays':
      if (pattern.n > 2) {
        shrinks.push({ ...pattern, n: Math.floor(pattern.n / 2) })
        shrinks.push({ ...pattern, n: pattern.n - 1 })
      }
      break

    case 'everyNWeeks':
      if (pattern.n > 2) {
        shrinks.push({ ...pattern, n: Math.floor(pattern.n / 2) })
      }
      if (pattern.days.length > 1) {
        shrinks.push({ ...pattern, days: [pattern.days[0]] })
      }
      break

    case 'weekly':
      if (pattern.days.length > 1) {
        shrinks.push({ ...pattern, days: [pattern.days[0]] })
      }
      break

    case 'custom':
      if (pattern.dates.length > 1) {
        shrinks.push({ ...pattern, dates: [pattern.dates[0]] })
        shrinks.push({ ...pattern, dates: pattern.dates.slice(0, Math.floor(pattern.dates.length / 2)) })
      }
      break
  }

  return fc.Stream.of(...shrinks)
}

// ============================================================================
// Condition Shrinker (Task #488 - stub)
// ============================================================================

/**
 * Shrinks a condition by flattening trees and reducing thresholds.
 */
export function shrinkCondition(condition: Condition): fc.Stream<Condition> {
  const shrinks: Condition[] = []

  switch (condition.type) {
    case 'and':
    case 'or':
      // Flatten to single child
      if (condition.conditions.length > 1) {
        for (const child of condition.conditions) {
          shrinks.push(child)
        }
      }
      // Remove one child
      for (let i = 0; i < condition.conditions.length; i++) {
        if (condition.conditions.length > 1) {
          shrinks.push({
            ...condition,
            conditions: [...condition.conditions.slice(0, i), ...condition.conditions.slice(i + 1)],
          })
        }
      }
      break

    case 'not':
      // Simplify to the inner condition
      shrinks.push(condition.condition)
      break

    case 'count':
      // Reduce threshold
      if (condition.threshold > 1) {
        shrinks.push({ ...condition, threshold: Math.floor(condition.threshold / 2) })
        shrinks.push({ ...condition, threshold: condition.threshold - 1 })
      }
      // Reduce window
      if (condition.windowDays > 1) {
        shrinks.push({ ...condition, windowDays: Math.floor(condition.windowDays / 2) })
      }
      break

    case 'daysSince':
      // Reduce threshold
      if (condition.threshold > 1) {
        shrinks.push({ ...condition, threshold: Math.floor(condition.threshold / 2) })
        shrinks.push({ ...condition, threshold: condition.threshold - 1 })
      }
      break
  }

  return fc.Stream.of(...shrinks)
}

// ============================================================================
// Constraint Set Shrinker (Task #490 - stub)
// ============================================================================

/**
 * Shrinks a set of constraints by removing one at a time.
 */
export function shrinkConstraintSet(constraints: RelationalConstraint[]): fc.Stream<RelationalConstraint[]> {
  if (constraints.length <= 1) {
    return fc.Stream.nil()
  }

  const shrinks: RelationalConstraint[][] = []

  // Remove one at a time
  for (let i = 0; i < constraints.length; i++) {
    shrinks.push([...constraints.slice(0, i), ...constraints.slice(i + 1)])
  }

  // Halve
  if (constraints.length >= 4) {
    shrinks.push(constraints.slice(0, Math.floor(constraints.length / 2)))
  }

  return fc.Stream.of(...shrinks)
}

// ============================================================================
// Link Chain Shrinker (Task #491 - stub)
// ============================================================================

/**
 * Shrinks a link chain by shortening it.
 */
export function shrinkLinkChain(links: Link[]): fc.Stream<Link[]> {
  if (links.length <= 1) {
    return fc.Stream.nil()
  }

  const shrinks: Link[][] = []

  // Remove last link (shorten chain)
  shrinks.push(links.slice(0, -1))

  // Remove first link (if chain has > 2)
  if (links.length > 2) {
    shrinks.push(links.slice(1))
  }

  // Halve the chain
  if (links.length >= 4) {
    shrinks.push(links.slice(0, Math.floor(links.length / 2)))
  }

  return fc.Stream.of(...shrinks)
}

// ============================================================================
// Export all shrinkers
// ============================================================================

// ============================================================================
// Operation Sequence Shrinker (Task #489)
// ============================================================================

interface Operation {
  type: string
  [key: string]: unknown
}

/**
 * Shrinks an operation sequence by:
 * 1. Removing operations while keeping creates and the last operation
 * 2. Removing from the middle (preserving causal dependencies)
 * 3. Halving the sequence
 *
 * The key insight is that we must preserve:
 * - Create operations (they establish entities other ops depend on)
 * - The last operation (often the one that triggers the failure)
 */
export function shrinkOperationSequence(ops: Operation[]): fc.Stream<Operation[]> {
  if (ops.length <= 1) {
    return fc.Stream.nil()
  }

  const shrinks: Operation[][] = []

  // Identify create operations and the last operation
  const createOps = ops.filter(op => op.type.startsWith('create') || op.type === 'logCompletion')
  const lastOp = ops[ops.length - 1]

  // Strategy 1: Keep only creates + last
  if (ops.length > createOps.length + 1) {
    const minimal = [...createOps]
    if (!createOps.includes(lastOp)) {
      minimal.push(lastOp)
    }
    if (minimal.length < ops.length) {
      shrinks.push(minimal)
    }
  }

  // Strategy 2: Remove one non-essential operation at a time
  for (let i = 0; i < ops.length - 1; i++) {
    const op = ops[i]
    // Don't remove create operations
    if (!op.type.startsWith('create') && op.type !== 'logCompletion') {
      shrinks.push([...ops.slice(0, i), ...ops.slice(i + 1)])
    }
  }

  // Strategy 3: Remove from the middle (keep first half + last)
  if (ops.length >= 4) {
    const half = Math.floor(ops.length / 2)
    shrinks.push([...ops.slice(0, half), lastOp])
  }

  // Strategy 4: Keep first quarter + last
  if (ops.length >= 8) {
    const quarter = Math.floor(ops.length / 4)
    shrinks.push([...ops.slice(0, quarter), lastOp])
  }

  // Strategy 5: Binary search - keep first and last, remove middle
  if (ops.length >= 3) {
    shrinks.push([ops[0], lastOp])
  }

  return fc.Stream.of(...shrinks)
}

/**
 * Creates an operation sequence that maintains validity.
 * Filters out operations that would fail given the current sequence.
 */
export function filterValidOperations(ops: Operation[]): Operation[] {
  const createdSeriesIds = new Set<string>()
  const result: Operation[] = []

  for (const op of ops) {
    switch (op.type) {
      case 'createSeries':
        result.push(op)
        // Track that this series now exists
        if (op.series && typeof op.series === 'object' && 'id' in op.series) {
          createdSeriesIds.add(op.series.id as string)
        }
        break

      case 'updateSeries':
      case 'deleteSeries':
      case 'lockSeries':
      case 'unlockSeries':
        // Only include if the series exists
        if (op.seriesId && createdSeriesIds.has(op.seriesId as string)) {
          result.push(op)
          if (op.type === 'deleteSeries') {
            createdSeriesIds.delete(op.seriesId as string)
          }
        }
        break

      default:
        result.push(op)
    }
  }

  return result
}

export const shrinkers = {
  dateRange: shrinkDateRange,
  duration: shrinkDuration,
  seriesArray: shrinkSeriesArray,
  pattern: shrinkPattern,
  condition: shrinkCondition,
  constraintSet: shrinkConstraintSet,
  linkChain: shrinkLinkChain,
  operationSequence: shrinkOperationSequence,
}
