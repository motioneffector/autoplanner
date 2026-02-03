/**
 * Completion generators for fuzz testing.
 *
 * Implements generators for completion records as defined in Spec 6.
 */
import * as fc from 'fast-check'
import type { Arbitrary } from 'fast-check'
import type { Completion, LocalDate, LocalDateTime, Duration, SeriesId, CompletionId } from '../lib/types'
import { localDateGen, localDateTimeGen, durationGen, seriesIdGen, completionIdGen, boundaryDateGen, boundaryDateTimeGen } from './base'
import { makeLocalDateTime, makeLocalDate, makeLocalTime, parseLocalDate, parseLocalDateTime } from '../lib/utils'

// ============================================================================
// Completion Generators
// ============================================================================

/**
 * Generate a completion record.
 *
 * @param options.idGen - Generator for completion ID
 * @param options.seriesIdGen - Generator for the associated series ID
 * @param options.instanceDateGen - Generator for the instance date
 * @param options.startTimeGen - Generator for start time
 * @param options.durationGen - Generator for actual duration
 */
export function completionGen(options?: {
  idGen?: Arbitrary<CompletionId>
  seriesIdGen?: Arbitrary<SeriesId>
  instanceDateGen?: Arbitrary<LocalDate>
  startTimeGen?: Arbitrary<LocalDateTime>
  durationGen?: Arbitrary<Duration>
}): Arbitrary<Completion> {
  const idArb = options?.idGen ?? completionIdGen()
  const seriesIdArb = options?.seriesIdGen ?? seriesIdGen()
  const instanceDateArb = options?.instanceDateGen ?? localDateGen()
  const startTimeArb = options?.startTimeGen ?? localDateTimeGen()
  const durationArb = options?.durationGen ?? durationGen()

  return fc
    .tuple(idArb, seriesIdArb, instanceDateArb, startTimeArb, durationArb, fc.option(fc.string({ maxLength: 200 }), { nil: undefined }))
    .map(([id, seriesId, instanceDate, startTime, actualDuration, notes]) => {
      // Calculate endTime from startTime + actualDuration
      const { year, month, day, hours, minutes } = parseLocalDateTime(startTime)
      const totalMinutes = hours * 60 + minutes + (actualDuration as number)
      const endHours = Math.floor(totalMinutes / 60) % 24
      const endMinutes = totalMinutes % 60

      // Handle day overflow for simplicity (keep same date)
      const endTime = makeLocalDateTime(makeLocalDate(year, month, day), makeLocalTime(endHours, endMinutes))

      return {
        id,
        seriesId,
        instanceDate,
        startTime,
        endTime,
        actualDuration,
        notes,
      }
    })
}

/**
 * Generate a valid completion record that respects constraints.
 * - endTime >= startTime
 * - actualDuration matches endTime - startTime
 * - instanceDate matches the date portion of startTime
 */
export function completionValidGen(options?: {
  seriesIdGen?: Arbitrary<SeriesId>
  dateGen?: Arbitrary<LocalDate>
}): Arbitrary<Completion> {
  const seriesIdArb = options?.seriesIdGen ?? seriesIdGen()
  const dateArb = options?.dateGen ?? localDateGen()

  return fc
    .tuple(
      completionIdGen(),
      seriesIdArb,
      dateArb,
      fc.integer({ min: 0, max: 23 }), // start hour
      fc.integer({ min: 0, max: 59 }), // start minute
      durationGen({ min: 1, max: 480 }), // duration (1 min to 8 hours)
      fc.option(fc.string({ maxLength: 200 }), { nil: undefined })
    )
    .map(([id, seriesId, date, startHour, startMinute, actualDuration, notes]) => {
      const { year, month, day } = parseLocalDate(date)

      // Create start time on the instance date
      const startTime = makeLocalDateTime(makeLocalDate(year, month, day), makeLocalTime(startHour, startMinute))

      // Use JavaScript Date for proper arithmetic handling (including day overflow)
      const startDate = new Date(Date.UTC(year, month - 1, day, startHour, startMinute))
      const endDate = new Date(startDate.getTime() + (actualDuration as number) * 60 * 1000)

      const endTime = makeLocalDateTime(
        makeLocalDate(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, endDate.getUTCDate()),
        makeLocalTime(endDate.getUTCHours(), endDate.getUTCMinutes())
      )

      return {
        id,
        seriesId,
        instanceDate: date,
        startTime,
        endTime,
        actualDuration,
        notes,
      }
    })
}

/**
 * Generate a completion for a specific series and date.
 * Useful for generating completions that match scheduled instances.
 */
export function completionForInstanceGen(seriesId: SeriesId, instanceDate: LocalDate): Arbitrary<Completion> {
  return completionValidGen({
    seriesIdGen: fc.constant(seriesId),
    dateGen: fc.constant(instanceDate),
  })
}

// ============================================================================
// Boundary Completion Generators
// ============================================================================

/**
 * Generate boundary completion values for edge case testing.
 */
export function boundaryCompletionGen(): Arbitrary<Completion> {
  return fc.oneof(
    // Minimum duration (1 minute)
    completionValidGen().map((c) => ({
      ...c,
      actualDuration: 1 as Duration,
    })),

    // Very long duration (full day)
    fc
      .tuple(completionIdGen(), seriesIdGen(), localDateGen(), fc.option(fc.string({ maxLength: 50 }), { nil: undefined }))
      .map(([id, seriesId, date, notes]) => {
        const { year, month, day } = parseLocalDate(date)
        const startTime = makeLocalDateTime(makeLocalDate(year, month, day), makeLocalTime(0, 0))
        const endTime = makeLocalDateTime(makeLocalDate(year, month, day), makeLocalTime(23, 59))
        return {
          id,
          seriesId,
          instanceDate: date,
          startTime,
          endTime,
          actualDuration: 1439 as Duration, // 23:59 minutes
          notes,
        }
      }),

    // Midnight start
    fc.tuple(completionIdGen(), seriesIdGen(), localDateGen(), durationGen({ min: 30, max: 60 })).map(([id, seriesId, date, duration]) => {
      const { year, month, day } = parseLocalDate(date)
      const startTime = makeLocalDateTime(makeLocalDate(year, month, day), makeLocalTime(0, 0))
      const endMinutes = duration as number
      const endTime = makeLocalDateTime(makeLocalDate(year, month, day), makeLocalTime(Math.floor(endMinutes / 60), endMinutes % 60))
      return {
        id,
        seriesId,
        instanceDate: date,
        startTime,
        endTime,
        actualDuration: duration,
        notes: undefined,
      }
    }),

    // End of day completion
    fc.tuple(completionIdGen(), seriesIdGen(), localDateGen()).map(([id, seriesId, date]) => {
      const { year, month, day } = parseLocalDate(date)
      const startTime = makeLocalDateTime(makeLocalDate(year, month, day), makeLocalTime(23, 30))
      const endTime = makeLocalDateTime(makeLocalDate(year, month, day), makeLocalTime(23, 59))
      return {
        id,
        seriesId,
        instanceDate: date,
        startTime,
        endTime,
        actualDuration: 29 as Duration,
        notes: undefined,
      }
    }),

    // Boundary dates
    completionValidGen({ dateGen: boundaryDateGen() }),

    // With notes
    completionValidGen().chain((c) =>
      fc.string({ minLength: 1, maxLength: 200 }).map((notes) => ({
        ...c,
        notes,
      }))
    ),

    // Empty notes (explicitly undefined)
    completionValidGen().map((c) => ({
      ...c,
      notes: undefined,
    })),

    // Random valid completion
    completionValidGen()
  )
}

// ============================================================================
// Completion Set Generators
// ============================================================================

/**
 * Generate multiple completions for the same series.
 * Useful for testing aggregation functions like count conditions.
 */
export function completionsForSeriesGen(options?: {
  seriesId?: SeriesId
  minCompletions?: number
  maxCompletions?: number
}): Arbitrary<{ seriesId: SeriesId; completions: Completion[] }> {
  const minCompletions = options?.minCompletions ?? 0
  const maxCompletions = options?.maxCompletions ?? 10

  const seriesIdArb = options?.seriesId ? fc.constant(options.seriesId) : seriesIdGen()

  return seriesIdArb.chain((seriesId) =>
    fc.array(completionValidGen({ seriesIdGen: fc.constant(seriesId) }), { minLength: minCompletions, maxLength: maxCompletions }).map((completions) => ({
      seriesId,
      completions,
    }))
  )
}

/**
 * Generate completions within a specific date range.
 * Useful for testing window-based queries.
 */
export function completionsInRangeGen(options: {
  seriesId: SeriesId
  startDate: LocalDate
  endDate: LocalDate
  minCompletions?: number
  maxCompletions?: number
}): Arbitrary<Completion[]> {
  const { seriesId, startDate, endDate } = options
  const minCompletions = options.minCompletions ?? 0
  const maxCompletions = options.maxCompletions ?? 5

  const startParsed = parseLocalDate(startDate)
  const endParsed = parseLocalDate(endDate)

  // Generate dates within range
  const dateInRangeGen = localDateGen({
    min: { year: startParsed.year, month: startParsed.month, day: startParsed.day },
    max: { year: endParsed.year, month: endParsed.month, day: endParsed.day },
  })

  return fc.array(completionValidGen({ seriesIdGen: fc.constant(seriesId), dateGen: dateInRangeGen }), {
    minLength: minCompletions,
    maxLength: maxCompletions,
  })
}

/**
 * Generate a realistic completion history for a series.
 * Simulates how completions would accumulate over time.
 */
export function realisticCompletionHistoryGen(options?: {
  seriesId?: SeriesId
  historyDays?: number
  completionRate?: number // 0-1, probability of completion per day
}): Arbitrary<{ seriesId: SeriesId; completions: Completion[] }> {
  const historyDays = options?.historyDays ?? 30
  const completionRate = options?.completionRate ?? 0.7

  const seriesIdArb = options?.seriesId ? fc.constant(options.seriesId) : seriesIdGen()

  return seriesIdArb.chain((seriesId) =>
    fc.array(fc.boolean(), { minLength: historyDays, maxLength: historyDays }).chain((shouldComplete) => {
      // Generate completions only for days where shouldComplete is true (with probability)
      const completionDays = shouldComplete
        .map((_, i) => i)
        .filter((_, i) => shouldComplete[i] && Math.random() < completionRate)

      return fc.tuple(...completionDays.map((dayOffset) => completionValidGen({ seriesIdGen: fc.constant(seriesId) }))).map((completions) => ({
        seriesId,
        completions: completions.length > 0 ? (completions as Completion[]) : [],
      }))
    })
  )
}
