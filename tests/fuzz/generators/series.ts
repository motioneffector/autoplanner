/**
 * Series generators for fuzz testing.
 *
 * Implements generators for Series entities as defined in Spec 5.
 */
import * as fc from 'fast-check'
import type { Arbitrary } from 'fast-check'
import type {
  Series,
  SeriesBounds,
  Pattern,
  PatternId,
  ConditionId,
  Condition,
  LocalDate,
  LocalTime,
  Duration,
  AdaptiveDuration,
  WiggleConfig,
  Reminder,
  CyclingConfig,
  Link,
  SeriesId,
} from '../lib/types'
import { localDateGen, localTimeGen, durationGen, seriesIdGen, patternIdGen, conditionIdGen } from './base'
import { patternGen, simplePatternGen } from './patterns'
import { conditionGen, simpleConditionGen } from './conditions'

// ============================================================================
// Series Component Generators
// ============================================================================

/**
 * Generate series bounds (start and optional end date).
 */
export function seriesBoundsGen(options?: {
  startDateGen?: Arbitrary<LocalDate>
  endDateGen?: Arbitrary<LocalDate>
  hasEndDate?: boolean
}): Arbitrary<SeriesBounds> {
  const startDateGen = options?.startDateGen ?? localDateGen()
  const endDateGen = options?.endDateGen ?? localDateGen()
  const hasEndDate = options?.hasEndDate

  if (hasEndDate === true) {
    // Always have end date, ensure end >= start
    return fc.tuple(startDateGen, endDateGen).map(([start, end]) => {
      // Ensure end is after or equal to start
      if (start > end) {
        return { startDate: end, endDate: start }
      }
      return { startDate: start, endDate: end }
    })
  }

  if (hasEndDate === false) {
    // Never have end date
    return startDateGen.map((startDate) => ({ startDate }))
  }

  // Random: sometimes have end date
  return fc.tuple(startDateGen, fc.option(endDateGen, { nil: undefined })).map(([startDate, endDate]) => {
    if (endDate && startDate > endDate) {
      return { startDate: endDate, endDate: startDate }
    }
    return { startDate, endDate }
  })
}

/**
 * Generate a wiggle config for flexible scheduling.
 */
export function wiggleConfigGen(options?: {
  maxDaysBefore?: number
  maxDaysAfter?: number
}): Arbitrary<WiggleConfig> {
  const maxDaysBefore = options?.maxDaysBefore ?? 3
  const maxDaysAfter = options?.maxDaysAfter ?? 3

  return fc
    .tuple(
      fc.integer({ min: 0, max: maxDaysBefore }),
      fc.integer({ min: 0, max: maxDaysAfter }),
      fc.option(
        fc.tuple(localTimeGen(), localTimeGen()).map(([earliest, latest]) => {
          // Ensure earliest <= latest
          if (earliest > latest) {
            return { earliest: latest, latest: earliest }
          }
          return { earliest, latest }
        }),
        { nil: undefined }
      )
    )
    .map(([daysBefore, daysAfter, timeWindow]) => ({
      daysBefore,
      daysAfter,
      timeWindow,
    }))
}

/**
 * Generate a reminder configuration.
 */
export function reminderGen(options?: { maxMinutesBefore?: number }): Arbitrary<Reminder> {
  const maxMinutesBefore = options?.maxMinutesBefore ?? 1440 // 24 hours

  return fc.tuple(fc.integer({ min: 0, max: maxMinutesBefore }), fc.string({ minLength: 1, maxLength: 20 })).map(([minutesBefore, tag]) => ({
    minutesBefore,
    tag,
  }))
}

/**
 * Generate a cycling configuration.
 */
export function cyclingConfigGen(options?: {
  maxItems?: number
  minItems?: number
}): Arbitrary<CyclingConfig> {
  const minItems = options?.minItems ?? 1
  const maxItems = options?.maxItems ?? 10

  return fc
    .tuple(
      fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: minItems, maxLength: maxItems }),
      fc.constantFrom<'sequential' | 'random'>('sequential', 'random'),
      fc.boolean()
    )
    .chain(([items, mode, gapLeap]) => {
      // currentIndex must be valid for the items array
      return fc.integer({ min: 0, max: Math.max(0, items.length - 1) }).map((currentIndex) => ({
        items,
        mode,
        gapLeap,
        currentIndex,
      }))
    })
}

/**
 * Generate an adaptive duration configuration.
 */
export function adaptiveDurationGen(options?: {
  maxLookback?: number
  maxMultiplier?: number
  fallbackGen?: Arbitrary<Duration>
}): Arbitrary<AdaptiveDuration> {
  const maxLookback = options?.maxLookback ?? 30
  const maxMultiplier = options?.maxMultiplier ?? 3
  const fallbackGen = options?.fallbackGen ?? durationGen()

  return fc.oneof(
    // LastN mode
    fc
      .tuple(fc.integer({ min: 1, max: maxLookback }), fc.float({ min: 0.5, max: maxMultiplier, noNaN: true }), fallbackGen)
      .map(([value, multiplier, fallback]) => ({
        mode: 'lastN' as const,
        value,
        multiplier: Math.round(multiplier * 100) / 100, // Round to 2 decimal places
        fallback,
      })),
    // WindowDays mode
    fc
      .tuple(fc.integer({ min: 1, max: maxLookback * 10 }), fc.float({ min: 0.5, max: maxMultiplier, noNaN: true }), fallbackGen)
      .map(([value, multiplier, fallback]) => ({
        mode: 'windowDays' as const,
        value,
        multiplier: Math.round(multiplier * 100) / 100,
        fallback,
      }))
  )
}

/**
 * Generate boundary adaptive duration for edge case testing.
 */
export function adaptiveDurationBoundaryGen(): Arbitrary<AdaptiveDuration> {
  return fc.oneof(
    // Minimum values
    fc.constant<AdaptiveDuration>({
      mode: 'lastN',
      value: 1,
      multiplier: 0.5,
      fallback: 1 as Duration,
    }),
    // Maximum multiplier
    fc.constant<AdaptiveDuration>({
      mode: 'lastN',
      value: 10,
      multiplier: 3,
      fallback: 60 as Duration,
    }),
    // Large window
    fc.constant<AdaptiveDuration>({
      mode: 'windowDays',
      value: 365,
      multiplier: 1,
      fallback: 30 as Duration,
    }),
    // Multiplier of exactly 1 (no change)
    fc.constant<AdaptiveDuration>({
      mode: 'lastN',
      value: 5,
      multiplier: 1,
      fallback: 60 as Duration,
    }),
    // Random adaptive duration
    adaptiveDurationGen(),
  )
}

/**
 * Generate a pattern with optional condition ID for a series.
 */
export function seriesPatternEntryGen(options?: {
  patternGen?: Arbitrary<Pattern>
  conditionIdGen?: Arbitrary<ConditionId>
  hasCondition?: boolean
}): Arbitrary<{ id: PatternId; pattern: Pattern; conditionId?: ConditionId }> {
  const pattern = options?.patternGen ?? simplePatternGen()
  const condId = options?.conditionIdGen ?? conditionIdGen()

  if (options?.hasCondition === true) {
    return fc.tuple(patternIdGen(), pattern, condId).map(([id, pattern, conditionId]) => ({
      id,
      pattern,
      conditionId,
    }))
  }

  if (options?.hasCondition === false) {
    return fc.tuple(patternIdGen(), pattern).map(([id, pattern]) => ({
      id,
      pattern,
    }))
  }

  // Random: sometimes have condition
  return fc.tuple(patternIdGen(), pattern, fc.option(condId, { nil: undefined })).map(([id, pattern, conditionId]) => ({
    id,
    pattern,
    conditionId,
  }))
}

// ============================================================================
// Series Generators
// ============================================================================

/**
 * Generate a minimal series with required fields only.
 * Useful for simple testing scenarios.
 */
export function minimalSeriesGen(options?: {
  idGen?: Arbitrary<SeriesId>
  titleGen?: Arbitrary<string>
}): Arbitrary<Series> {
  const idGen = options?.idGen ?? seriesIdGen()
  const titleGen = options?.titleGen ?? fc.string({ minLength: 1, maxLength: 50 })

  return fc
    .tuple(idGen, titleGen, seriesPatternEntryGen({ hasCondition: false }), durationGen(), seriesBoundsGen({ hasEndDate: false }))
    .map(([id, title, patternEntry, duration, bounds]) => ({
      id,
      title,
      tags: [],
      patterns: [patternEntry],
      timeOfDay: undefined, // All-day
      duration,
      fixed: false,
      wiggle: undefined,
      reminders: [],
      cycling: undefined,
      locked: false,
      bounds,
    }))
}

/**
 * Generate a full series with all optional fields populated.
 */
export function fullSeriesGen(options?: {
  idGen?: Arbitrary<SeriesId>
  titleGen?: Arbitrary<string>
  maxPatterns?: number
  maxTags?: number
  maxReminders?: number
}): Arbitrary<Series> {
  const idGen = options?.idGen ?? seriesIdGen()
  const titleGen = options?.titleGen ?? fc.string({ minLength: 1, maxLength: 50 })
  const maxPatterns = options?.maxPatterns ?? 3
  const maxTags = options?.maxTags ?? 5
  const maxReminders = options?.maxReminders ?? 3

  return fc
    .tuple(
      idGen,
      titleGen,
      fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: maxTags }),
      fc.array(seriesPatternEntryGen(), { minLength: 1, maxLength: maxPatterns }),
      fc.option(localTimeGen(), { nil: undefined }),
      fc.oneof(durationGen(), adaptiveDurationGen()),
      fc.boolean(),
      fc.option(wiggleConfigGen(), { nil: undefined }),
      fc.array(reminderGen(), { minLength: 0, maxLength: maxReminders }),
      fc.option(cyclingConfigGen(), { nil: undefined }),
      fc.boolean(),
      seriesBoundsGen()
    )
    .map(([id, title, tags, patterns, timeOfDay, duration, fixed, wiggle, reminders, cycling, locked, bounds]) => ({
      id,
      title,
      tags: [...new Set(tags)], // Unique tags
      patterns,
      timeOfDay,
      duration,
      fixed,
      wiggle: fixed ? undefined : wiggle, // Fixed items don't have wiggle
      reminders,
      cycling,
      locked,
      bounds,
    }))
}

/**
 * Generate a series with conditions on some patterns.
 */
export function seriesWithConditionsGen(options?: {
  idGen?: Arbitrary<SeriesId>
  conditionGen?: Arbitrary<Condition>
}): Arbitrary<{ series: Series; conditions: Map<ConditionId, Condition> }> {
  const idGen = options?.idGen ?? seriesIdGen()
  const condGen = options?.conditionGen ?? simpleConditionGen()

  return fc
    .tuple(
      idGen,
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.array(fc.tuple(seriesPatternEntryGen({ hasCondition: true }), condGen), { minLength: 1, maxLength: 3 }),
      durationGen(),
      seriesBoundsGen()
    )
    .map(([id, title, patternsWithConditions, duration, bounds]) => {
      const conditions = new Map<ConditionId, Condition>()
      const patterns = patternsWithConditions.map(([entry, condition]) => {
        if (entry.conditionId) {
          conditions.set(entry.conditionId, condition)
        }
        return entry
      })

      return {
        series: {
          id,
          title,
          tags: [],
          patterns,
          timeOfDay: undefined,
          duration,
          fixed: false,
          wiggle: undefined,
          reminders: [],
          cycling: undefined,
          locked: false,
          bounds,
        },
        conditions,
      }
    })
}

/**
 * Generate a series designed to be part of a chain (parent-child relationship).
 */
export function chainableSeriesGen(options?: {
  idGen?: Arbitrary<SeriesId>
  asChild?: boolean
}): Arbitrary<Series> {
  const idGen = options?.idGen ?? seriesIdGen()

  return fc
    .tuple(idGen, fc.string({ minLength: 1, maxLength: 50 }), durationGen({ min: 15, max: 120 }), localTimeGen(), seriesBoundsGen())
    .map(([id, title, duration, timeOfDay, bounds]) => ({
      id,
      title,
      tags: ['chainable'],
      patterns: [{ id: `pattern-${id}` as PatternId, pattern: { type: 'daily' as const } }],
      timeOfDay, // Chains require timed events
      duration,
      fixed: false, // Chains typically use flexible items
      wiggle: { daysBefore: 0, daysAfter: 0 }, // Same day only
      reminders: [],
      cycling: undefined,
      locked: false,
      bounds,
    }))
}

// ============================================================================
// Link Generator
// ============================================================================

/**
 * Generate a link between two series (parent-child relationship).
 */
export function linkGen(options?: {
  parentIdGen?: Arbitrary<SeriesId>
  childIdGen?: Arbitrary<SeriesId>
  maxDistance?: number
  maxWobble?: number
}): Arbitrary<Link> {
  const parentIdGen = options?.parentIdGen ?? seriesIdGen()
  const childIdGen = options?.childIdGen ?? seriesIdGen()
  const maxDistance = options?.maxDistance ?? 120 // 2 hours
  const maxWobble = options?.maxWobble ?? 30 // 30 minutes

  return fc
    .tuple(
      parentIdGen,
      childIdGen,
      fc.integer({ min: 0, max: maxDistance }),
      fc.integer({ min: 0, max: maxWobble }),
      fc.integer({ min: 0, max: maxWobble })
    )
    .filter(([parentId, childId]) => parentId !== childId) // Parent can't be its own child
    .map(([parentSeriesId, childSeriesId, targetDistance, earlyWobble, lateWobble]) => ({
      parentSeriesId,
      childSeriesId,
      targetDistance,
      earlyWobble,
      lateWobble,
    }))
}

/**
 * Generate boundary link values for edge case testing.
 */
export function linkBoundaryGen(): Arbitrary<Link> {
  return fc.oneof(
    // Zero distance (immediately after)
    linkGen({ maxDistance: 0, maxWobble: 0 }),
    // Zero wobble (exact timing required)
    fc.tuple(seriesIdGen(), seriesIdGen()).chain(([parent, child]) =>
      fc.constant<Link>({
        parentSeriesId: parent,
        childSeriesId: child,
        targetDistance: 30,
        earlyWobble: 0,
        lateWobble: 0,
      })
    ),
    // Large distance
    fc.tuple(seriesIdGen(), seriesIdGen()).chain(([parent, child]) =>
      fc.constant<Link>({
        parentSeriesId: parent,
        childSeriesId: child,
        targetDistance: 480, // 8 hours
        earlyWobble: 60,
        lateWobble: 60,
      })
    ),
    // Asymmetric wobble
    fc.tuple(seriesIdGen(), seriesIdGen()).chain(([parent, child]) =>
      fc.constant<Link>({
        parentSeriesId: parent,
        childSeriesId: child,
        targetDistance: 60,
        earlyWobble: 0, // Can't be early
        lateWobble: 30, // But can be late
      })
    ),
    // Random link
    linkGen(),
  )
}

// ============================================================================
// Composite Generators
// ============================================================================

/**
 * Generate any series with randomized complexity.
 */
export function seriesGen(): Arbitrary<Series> {
  return fc.oneof({ weight: 3, arbitrary: minimalSeriesGen() }, { weight: 1, arbitrary: fullSeriesGen() })
}

/**
 * Generate a realistic series (common configurations).
 */
export function realisticSeriesGen(): Arbitrary<Series> {
  return fc.oneof(
    // Simple daily task
    { weight: 30, arbitrary: minimalSeriesGen() },
    // Weekly recurring event
    {
      weight: 25,
      arbitrary: fc
        .tuple(seriesIdGen(), fc.string({ minLength: 1, maxLength: 50 }), localTimeGen(), durationGen({ min: 30, max: 90 }), seriesBoundsGen())
        .map(([id, title, timeOfDay, duration, bounds]) => ({
          id,
          title,
          tags: [],
          patterns: [{ id: `pattern-${id}` as PatternId, pattern: { type: 'weekly' as const, days: ['mon', 'wed', 'fri'] as const } }],
          timeOfDay,
          duration,
          fixed: false,
          wiggle: { daysBefore: 1, daysAfter: 1 },
          reminders: [{ minutesBefore: 15, tag: 'default' }],
          cycling: undefined,
          locked: false,
          bounds,
        })),
    },
    // Full featured series
    { weight: 10, arbitrary: fullSeriesGen() }
  )
}
