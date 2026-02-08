/**
 * Tests for custom shrinkers (Task #492, #493).
 *
 * Verifies that shrinkers:
 * 1. Produce valid shrunk values
 * 2. Actually reduce complexity
 * 3. Integrate correctly with fast-check
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  shrinkDateRange,
  shrinkDuration,
  shrinkSeriesArray,
  shrinkPattern,
  shrinkCondition,
  shrinkConstraintSet,
  shrinkLinkChain,
  shrinkOperationSequence,
  dateRangeArb,
  shrinkers,
} from './index'
import { makeLocalDate, parseLocalDate } from '../lib/utils'
import type { LocalDate, Duration, Series, SeriesId, Pattern, Condition, RelationalConstraint, ConstraintId, Link } from '../lib/types'

// ============================================================================
// Shrinker Registration Tests (Task #492)
// ============================================================================

describe('Shrinker Registration', () => {
  it('all shrinkers are exported', () => {
    // local binding for test visibility
    const registry = shrinkers
    // Verify shrinkers are the actual shrink functions
    expect(registry.dateRange).toBe(shrinkDateRange)
    expect(registry.duration).toBe(shrinkDuration)
    expect(registry.seriesArray).toBe(shrinkSeriesArray)
    expect(registry.pattern).toBe(shrinkPattern)
    expect(registry.condition).toBe(shrinkCondition)
    expect(registry.constraintSet).toBe(shrinkConstraintSet)
    expect(registry.linkChain).toBe(shrinkLinkChain)
    expect(registry.operationSequence).toBe(shrinkOperationSequence)
  })

  it('dateRangeArb integrates with fast-check', () => {
    fc.assert(
      fc.property(dateRangeArb(), (range) => {
        // Range should have valid dates in YYYY-MM-DD format
        expect(range.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(range.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        // End should be >= start
        expect(range.end >= range.start).toBe(true)
      })
    )
  })
})

// ============================================================================
// Date Range Shrinker Tests
// ============================================================================

describe('Shrinkers - DateRange', () => {
  it('shrinks by halving the range', () => {
    const range = {
      start: makeLocalDate(2024, 1, 1),
      end: makeLocalDate(2024, 1, 31),
    }

    const shrinks = Array.from(shrinkDateRange(range))

    // Original range is 30 days (Jan 1 to Jan 31)
    // Shrinker should produce halved (15 days) and decremented (29 days) variants
    expect(shrinks.length).toBeGreaterThanOrEqual(2)

    // Find halved shrink (approximately 15 days from start)
    const halvedShrink = shrinks.find(s => daysBetween(s.start, s.end) === 15)
    expect(halvedShrink).toEqual({
      start: makeLocalDate(2024, 1, 1),
      end: makeLocalDate(2024, 1, 16),
    })

    // Find decremented shrink (29 days - end moved back by 1)
    const decrementedShrink = shrinks.find(s => daysBetween(s.start, s.end) === 29)
    expect(decrementedShrink).toEqual({
      start: makeLocalDate(2024, 1, 1),
      end: makeLocalDate(2024, 1, 30),
    })

    // All shrinks should be smaller than the original 30 days
    for (const shrunk of shrinks) {
      const shrunkDays = daysBetween(shrunk.start, shrunk.end)
      expect(shrunkDays).toBeLessThan(30)
      expect(shrunkDays).toBeGreaterThanOrEqual(0)
    }
  })

  it('empty range produces no shrinks', () => {
    const range = {
      start: makeLocalDate(2024, 1, 15),
      end: makeLocalDate(2024, 1, 15),
    }

    const shrinks = Array.from(shrinkDateRange(range))
    expect(shrinks.length).toBe(0)
  })
})

// ============================================================================
// Duration Shrinker Tests
// ============================================================================

describe('Shrinkers - Duration', () => {
  it('shrinks by halving and decrementing', () => {
    const duration = 120 as Duration

    const shrinks = Array.from(shrinkDuration(duration))

    // Should have at least 2 shrinks: halved (60) and decremented (119)
    expect(shrinks.length).toBeGreaterThanOrEqual(2)
    expect(shrinks).toEqual(expect.arrayContaining([60 as Duration, 119 as Duration]))

    // Should include halved value
    expect(shrinks).toContain(60 as Duration)

    // Should include decremented value
    expect(shrinks).toContain(119 as Duration)

    // All shrinks should be smaller
    for (const shrunk of shrinks) {
      expect(shrunk).toBeLessThan(duration)
      expect(shrunk).toBeGreaterThan(0)
    }
  })

  it('minimum duration produces no shrinks', () => {
    const shrinks = Array.from(shrinkDuration(1 as Duration))
    expect(shrinks).toEqual([])
  })
})

// ============================================================================
// Series Array Shrinker Tests
// ============================================================================

describe('Shrinkers - SeriesArray', () => {
  it('shrinks by removing elements', () => {
    const s1 = { id: 's1' as SeriesId, title: 'Series 1' } as Series
    const s2 = { id: 's2' as SeriesId, title: 'Series 2' } as Series
    const s3 = { id: 's3' as SeriesId, title: 'Series 3' } as Series
    const s4 = { id: 's4' as SeriesId, title: 'Series 4' } as Series
    const series: Series[] = [s1, s2, s3, s4]

    const shrinks = Array.from(shrinkSeriesArray(series))

    // Verify the exact shrinks of length 3 - all 4 possible single-element removals
    expect(shrinks).toContainEqual([s2, s3, s4]) // Without s1
    expect(shrinks).toContainEqual([s1, s3, s4]) // Without s2
    expect(shrinks).toContainEqual([s1, s2, s4]) // Without s3
    expect(shrinks).toContainEqual([s1, s2, s3]) // Without s4

    // Halved shrink (length 2) should contain first two elements
    expect(shrinks).toContainEqual([s1, s2])
  })

  it('single element produces no shrinks', () => {
    const series: Series[] = [{ id: 's1' as SeriesId, title: 'Series 1' } as Series]
    const shrinks = Array.from(shrinkSeriesArray(series))
    // Single element cannot be shrunk - it's already minimal
    expect(Array.isArray(shrinks)).toBe(true)
    expect(shrinks).toHaveLength(0)
  })
})

// ============================================================================
// Pattern Shrinker Tests
// ============================================================================

describe('Shrinkers - Pattern', () => {
  it('simplifies everyNDays to daily', () => {
    const pattern: Pattern = {
      type: 'everyNDays',
      n: 7,
      anchor: makeLocalDate(2024, 1, 1),
    }

    const shrinks = Array.from(shrinkPattern(pattern))

    // Should include daily (simplest)
    const hasDaily = shrinks.some(p => p.type === 'daily')
    expect(hasDaily).toBe(true)

    // Should include reduced n values (halved: 3 and decremented: 6)
    const reducedN = shrinks.filter(p => p.type === 'everyNDays' && p.n < 7)
    expect(reducedN).toEqual([
      expect.objectContaining({ type: 'everyNDays', n: 3 }),
      expect.objectContaining({ type: 'everyNDays', n: 6 })
    ])
  })

  it('daily pattern produces no shrinks', () => {
    const pattern: Pattern = { type: 'daily' }
    const shrinks = Array.from(shrinkPattern(pattern))
    expect(shrinks).toEqual([])
  })

  it('weekly pattern shrinks to single day', () => {
    const pattern: Pattern = {
      type: 'weekly',
      days: ['mon', 'wed', 'fri'],
    }

    const shrinks = Array.from(shrinkPattern(pattern))

    // Should try to simplify to daily
    expect(shrinks).toContainEqual({ type: 'daily' })

    // Should try reducing days to single day variants
    const reducedDays = shrinks.filter(p => p.type === 'weekly' && p.days.length === 1)

    // Should have at least one single-day shrink with valid day
    expect(reducedDays.some(p => ['mon', 'wed', 'fri'].includes(p.days[0]))).toBe(true)

    // All single-day shrinks should be one of the original days
    for (const shrunk of reducedDays) {
      expect(['mon', 'wed', 'fri']).toContain(shrunk.days[0])
    }
  })
})

// ============================================================================
// Condition Shrinker Tests
// ============================================================================

describe('Shrinkers - Condition', () => {
  it('flattens AND condition', () => {
    const condition: Condition = {
      type: 'and',
      conditions: [
        { type: 'count', target: {}, comparison: '>=', threshold: 5, windowDays: 7 },
        { type: 'daysSince', target: {}, comparison: '<=', threshold: 14 },
      ],
    }

    const shrinks = Array.from(shrinkCondition(condition))

    // Should include flattened children
    const hasCount = shrinks.some(c => c.type === 'count')
    const hasDaysSince = shrinks.some(c => c.type === 'daysSince')
    expect(hasCount).toBe(true)
    expect(hasDaysSince).toBe(true)
  })

  it('reduces count threshold', () => {
    const condition: Condition = {
      type: 'count',
      target: {},
      comparison: '>=',
      threshold: 10,
      windowDays: 7,
    }

    const shrinks = Array.from(shrinkCondition(condition))

    // Should include reduced thresholds (halved: 5 and decremented: 9)
    const reduced = shrinks.filter(c => c.type === 'count' && c.threshold < 10)
    expect(reduced).toEqual([
      expect.objectContaining({ type: 'count', threshold: 5 }),
      expect.objectContaining({ type: 'count', threshold: 9 })
    ])

    // Verify halved threshold has correct structure
    const halved = shrinks.find(c => c.type === 'count' && c.threshold === 5)
    expect(halved).toEqual(expect.objectContaining({
      type: 'count',
      threshold: 5,
      windowDays: 7
    }))
  })

  it('unwraps NOT condition', () => {
    const condition: Condition = {
      type: 'not',
      condition: { type: 'count', target: {}, comparison: '>=', threshold: 5, windowDays: 7 },
    }

    const shrinks = Array.from(shrinkCondition(condition))

    // Should include the inner condition
    const hasInner = shrinks.some(c => c.type === 'count')
    expect(hasInner).toBe(true)
  })
})

// ============================================================================
// Constraint Set Shrinker Tests
// ============================================================================

describe('Shrinkers - ConstraintSet', () => {
  it('removes constraints one at a time', () => {
    const c1 = { id: 'c1' as ConstraintId, type: 'mustBeBefore', sourceTarget: {}, destTarget: {} } as RelationalConstraint
    const c2 = { id: 'c2' as ConstraintId, type: 'mustBeAfter', sourceTarget: {}, destTarget: {} } as RelationalConstraint
    const c3 = { id: 'c3' as ConstraintId, type: 'mustBeOnSameDay', sourceTarget: {}, destTarget: {} } as RelationalConstraint
    const constraints: RelationalConstraint[] = [c1, c2, c3]

    const shrinks = Array.from(shrinkConstraintSet(constraints))

    // Should have exactly 3 shrinks, each with one constraint removed
    // Verify all three expected shrinks exist
    expect(shrinks).toContainEqual([c2, c3]) // Without c1
    expect(shrinks).toContainEqual([c1, c3]) // Without c2
    expect(shrinks).toContainEqual([c1, c2]) // Without c3

    // Verify exact shrink set - exactly these 3 shrinks and nothing else
    expect(shrinks).toEqual([
      [c2, c3],
      [c1, c3],
      [c1, c2],
    ])
  })

  it('single constraint produces no shrinks', () => {
    const constraints: RelationalConstraint[] = [
      { id: 'c1' as ConstraintId, type: 'mustBeBefore', sourceTarget: {}, destTarget: {} },
    ]
    const shrinks = Array.from(shrinkConstraintSet(constraints))
    expect(shrinks).toEqual([])
  })
})

// ============================================================================
// Link Chain Shrinker Tests
// ============================================================================

describe('Shrinkers - LinkChain', () => {
  it('shortens chain from the end', () => {
    const link0 = { parentSeriesId: 's0' as SeriesId, childSeriesId: 's1' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 }
    const link1 = { parentSeriesId: 's1' as SeriesId, childSeriesId: 's2' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 }
    const link2 = { parentSeriesId: 's2' as SeriesId, childSeriesId: 's3' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 }
    const link3 = { parentSeriesId: 's3' as SeriesId, childSeriesId: 's4' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 }
    const links: Link[] = [link0, link1, link2, link3]

    const shrinks = Array.from(shrinkLinkChain(links))

    // Should have at least 2 shrinks (halved and decremented)
    expect(shrinks.length).toBeGreaterThanOrEqual(2)

    // Verify halved chain (2 links) - first half of the chain
    const halved = shrinks.find(s => s.length === 2)
    expect(halved).toEqual([link0, link1])

    // Verify shorter chain (3 links - last removed)
    const shorterChain = shrinks.find(s => s.length === 3)
    expect(shorterChain).toEqual([link0, link1, link2])

    // Verify exact shrink structure - should have halved (2) and decremented (3)
    expect(shrinks).toContainEqual([link0, link1])
    expect(shrinks).toContainEqual([link0, link1, link2])

    // Collect shrink lengths to verify coverage
    const shrinkLengths = shrinks.map(s => s.length)
    expect(shrinkLengths).toContain(2) // Halved
    expect(shrinkLengths).toContain(3) // Decremented
  })

  it('single link produces no shrinks', () => {
    const links: Link[] = [
      { parentSeriesId: 's0' as SeriesId, childSeriesId: 's1' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 },
    ]

    // Single link cannot be shrunk - it's the minimal non-empty chain
    const shrinks = Array.from(shrinkLinkChain(links))

    // Verify type and emptiness explicitly
    expect(Array.isArray(shrinks)).toBe(true)
    expect(shrinks).toHaveLength(0)
  })
})

// ============================================================================
// Operation Sequence Shrinker Tests
// ============================================================================

describe('Shrinkers - OperationSequence', () => {
  it('preserves create operations', () => {
    const ops = [
      { type: 'createSeries', series: { id: 's1' } },
      { type: 'updateSeries', seriesId: 's1', updates: {} },
      { type: 'lockSeries', seriesId: 's1' },
      { type: 'deleteSeries', seriesId: 's1' },
    ]

    const shrinks = Array.from(shrinkOperationSequence(ops))

    // All shrinks should still have the create
    for (const shrunk of shrinks) {
      const hasCreate = shrunk.some(op => op.type === 'createSeries')
      expect(hasCreate).toBe(true)
    }
  })

  it('preserves last operation', () => {
    const createOp = { type: 'createSeries', series: { id: 's1' } }
    const updateOp = { type: 'updateSeries', seriesId: 's1', updates: {} }
    const lockOp = { type: 'lockSeries', seriesId: 's1' }
    const deleteOp = { type: 'deleteSeries', seriesId: 's1' }
    const ops = [createOp, updateOp, lockOp, deleteOp]

    const shrinks = Array.from(shrinkOperationSequence(ops))

    // Filter shrinks that preserve the last operation (deleteSeries)
    const withLast = shrinks.filter(s => s[s.length - 1]?.type === 'deleteSeries')

    // Should include minimal [create, delete] sequence
    expect(withLast).toContainEqual([createOp, deleteOp])

    // Verify shrinks preserve first (create) and last (delete) operations
    for (const shrunk of withLast) {
      expect(shrunk[0]).toEqual(createOp)
      expect(shrunk[shrunk.length - 1]).toEqual(deleteOp)
    }
  })

  it('produces minimal sequence', () => {
    const ops = [
      { type: 'createSeries', series: { id: 's1' } },
      { type: 'updateSeries', seriesId: 's1', updates: { name: 'a' } },
      { type: 'updateSeries', seriesId: 's1', updates: { name: 'b' } },
      { type: 'updateSeries', seriesId: 's1', updates: { name: 'c' } },
      { type: 'deleteSeries', seriesId: 's1' },
    ]

    const shrinks = Array.from(shrinkOperationSequence(ops))

    // Should include [create, delete] (minimal that triggers failure)
    const minimal = shrinks.find(s => s.length === 2)
    expect(minimal).toEqual([
      expect.objectContaining({ type: 'createSeries' }),
      expect.objectContaining({ type: 'deleteSeries' })
    ])
  })

  it('single operation produces no shrinks', () => {
    const ops = [{ type: 'createSeries', series: { id: 's1' } }]
    const shrinks = Array.from(shrinkOperationSequence(ops))
    expect(shrinks).toEqual([])
  })
})

// ============================================================================
// Shrinking Produces Minimal Failing Cases (Task #493)
// ============================================================================

describe('Shrinking - Minimal Failing Cases', () => {
  it('finds minimal date range that causes failure', () => {
    // Simulate a property that fails for ranges > 10 days
    const failsForLargeRanges = (range: { start: LocalDate; end: LocalDate }) => {
      const days = daysBetween(range.start, range.end)
      return days <= 10 // Passes only for small ranges
    }

    // Generate a large range that will fail
    const largeRange = {
      start: makeLocalDate(2024, 1, 1),
      end: makeLocalDate(2024, 2, 15), // 45 days
    }

    expect(failsForLargeRanges(largeRange)).toBe(false) // Should fail

    // Shrink and find minimal failing case
    let current = largeRange
    let iterations = 0
    const maxIterations = 50

    while (iterations < maxIterations) {
      const shrinks = Array.from(shrinkDateRange(current))
      const failingShrink = shrinks.find(s => !failsForLargeRanges(s))

      if (!failingShrink) break // Found minimal
      current = failingShrink
      iterations++
    }

    // Should have shrunk to near the boundary (10-11 days)
    const finalDays = daysBetween(current.start, current.end)
    expect(finalDays).toBeLessThanOrEqual(20) // Significantly smaller than 45
    expect(finalDays).toBeGreaterThan(10) // Still fails
  })

  it('finds minimal duration that causes failure', () => {
    // Simulate a property that fails for durations > 60
    const failsForLargeDurations = (d: Duration) => (d as number) <= 60

    const largeDuration = 200 as Duration
    expect(failsForLargeDurations(largeDuration)).toBe(false)

    let current = largeDuration
    let iterations = 0

    while (iterations < 20) {
      const shrinks = Array.from(shrinkDuration(current))
      const failingShrink = shrinks.find(s => !failsForLargeDurations(s))

      if (!failingShrink) break
      current = failingShrink
      iterations++
    }

    // Should have shrunk to near the boundary
    expect((current as number)).toBeLessThanOrEqual(100)
    expect((current as number)).toBeGreaterThan(60)
  })

  it('finds minimal array that causes failure', () => {
    // Simulate a property that fails when array has > 2 elements
    const failsForLargeArrays = (arr: Series[]) => arr.length <= 2

    const largeArray: Series[] = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}` as SeriesId,
      title: `Series ${i}`,
    } as Series))

    expect(failsForLargeArrays(largeArray)).toBe(false)

    let current = largeArray
    let iterations = 0

    while (iterations < 20) {
      const shrinks = Array.from(shrinkSeriesArray(current))
      const failingShrink = shrinks.find(s => !failsForLargeArrays(s))

      if (!failingShrink) break
      current = failingShrink
      iterations++
    }

    // Should have shrunk to 3 (minimal failing)
    // Verify all items are from original set (s0-s9) and maintain structure
    expect(current.length).toBe(3)
    expect(current.every(s => /^s\d$/.test(s.id as string))).toBe(true)
    expect(current.every(s => {
      const idx = parseInt((s.id as string).slice(1))
      return s.title === `Series ${idx}`
    })).toBe(true)
  })

  it('finds minimal operation sequence that causes failure', () => {
    // Simulate a property that fails when sequence has > 3 non-create ops
    const countNonCreate = (ops: Array<{ type: string }>) =>
      ops.filter(op => !op.type.startsWith('create')).length

    const failsForLongSequences = (ops: Array<{ type: string }>) =>
      countNonCreate(ops) <= 3

    const longSequence = [
      { type: 'createSeries', series: { id: 's1' } },
      { type: 'updateSeries', seriesId: 's1' },
      { type: 'lockSeries', seriesId: 's1' },
      { type: 'unlockSeries', seriesId: 's1' },
      { type: 'updateSeries', seriesId: 's1' },
      { type: 'deleteSeries', seriesId: 's1' },
    ]

    expect(failsForLongSequences(longSequence)).toBe(false) // 5 non-create ops

    let current = longSequence
    let iterations = 0

    while (iterations < 20) {
      const shrinks = Array.from(shrinkOperationSequence(current))
      const failingShrink = shrinks.find(s => !failsForLongSequences(s))

      if (!failingShrink) break
      current = failingShrink
      iterations++
    }

    // Should have shrunk but still fail (4 non-create ops)
    expect(countNonCreate(current)).toBe(4)
  })

  it('condition shrinker finds minimal failing tree', () => {
    // Simulate a property that fails for nested conditions
    const countNesting = (c: Condition): number => {
      if (c.type === 'and' || c.type === 'or') {
        return 1 + Math.max(...c.conditions.map(countNesting), 0)
      }
      if (c.type === 'not') {
        return 1 + countNesting(c.condition)
      }
      return 0
    }

    const failsForDeepNesting = (c: Condition) => countNesting(c) <= 1

    const deepCondition: Condition = {
      type: 'and',
      conditions: [
        {
          type: 'or',
          conditions: [
            { type: 'count', target: {}, comparison: '>=', threshold: 5, windowDays: 7 },
            { type: 'daysSince', target: {}, comparison: '<=', threshold: 14 },
          ],
        },
        { type: 'count', target: {}, comparison: '>=', threshold: 3, windowDays: 7 },
      ],
    }

    expect(failsForDeepNesting(deepCondition)).toBe(false) // Nesting = 2

    let current = deepCondition
    let iterations = 0

    while (iterations < 20) {
      const shrinks = Array.from(shrinkCondition(current))
      const failingShrink = shrinks.find(s => !failsForDeepNesting(s))

      if (!failingShrink) break
      current = failingShrink
      iterations++
    }

    // Should have shrunk to simpler structure
    expect(countNesting(current)).toBeLessThanOrEqual(2)
  })
})

// ============================================================================
// Shrinking Tests for Complex Generators (Task #494)
// ============================================================================

describe('Shrinking - Complex Generators', () => {
  it('dateRange generator integrates with custom shrinker', () => {
    // The dateRangeArb should produce values that can be shrunk
    const ranges = fc.sample(dateRangeArb({ minDays: 5, maxDays: 30 }), 10)

    for (const range of ranges) {
      const days = daysBetween(range.start, range.end)
      expect(days).toBeGreaterThanOrEqual(5)
      expect(days).toBeLessThanOrEqual(30)

      // Should be shrinkable if > 0 days
      if (days > 0) {
        const shrinks = Array.from(shrinkDateRange(range))
        // Expect at least 2 shrinks (halved and decremented)
        expect(shrinks.length).toBeGreaterThanOrEqual(2)

        // Verify all shrinks are smaller than original and valid
        for (const shrunk of shrinks) {
          const shrunkDays = daysBetween(shrunk.start, shrunk.end)
          expect(shrunkDays).toBeLessThan(days)
          expect(shrunkDays).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('pattern shrinker handles all pattern types', () => {
    const patterns: Pattern[] = [
      { type: 'daily' },
      { type: 'everyNDays', n: 5, anchor: makeLocalDate(2024, 1, 1) },
      { type: 'weekly', days: ['mon', 'wed', 'fri'] },
      { type: 'everyNWeeks', n: 2, days: ['tue'], anchor: makeLocalDate(2024, 1, 1) },
      { type: 'monthly', day: 15 },
      { type: 'yearly', month: 6, day: 15 },
      { type: 'weekdays' },
      { type: 'oneOff', date: makeLocalDate(2024, 6, 15) },
      { type: 'custom', dates: [makeLocalDate(2024, 1, 1), makeLocalDate(2024, 2, 1)] },
    ]

    for (const pattern of patterns) {
      const shrinks = Array.from(shrinkPattern(pattern))

      // Daily is minimal, others should shrink
      if (pattern.type !== 'daily') {
        // All shrinks should include daily as the simplest option
        expect(shrinks).toContainEqual({ type: 'daily' })

        // All shrinks should be valid pattern types
        const validTypes = ['daily', 'everyNDays', 'weekly', 'everyNWeeks', 'monthly', 'yearly', 'weekdays', 'oneOff', 'custom']
        for (const shrunk of shrinks) {
          expect(validTypes).toContain(shrunk.type)
        }
      }
    }
  })

  it('condition shrinker handles nested conditions', () => {
    const countCondition = { type: 'count', target: {}, comparison: '>=', threshold: 5, windowDays: 7 } as Condition
    const daysSinceCondition = { type: 'daysSince', target: {}, comparison: '<=', threshold: 14 } as Condition
    const andChild1 = { type: 'count', target: {}, comparison: '>=', threshold: 3, windowDays: 7 } as Condition
    const andChild2 = { type: 'daysSince', target: {}, comparison: '<=', threshold: 7 } as Condition
    const orChild1 = { type: 'count', target: {}, comparison: '=', threshold: 0, windowDays: 1 } as Condition
    const orChild2 = { type: 'daysSince', target: {}, comparison: '>', threshold: 30 } as Condition
    const notInner = { type: 'count', target: {}, comparison: '>=', threshold: 10, windowDays: 30 } as Condition

    const conditions: Condition[] = [
      countCondition,
      daysSinceCondition,
      { type: 'and', conditions: [andChild1, andChild2] },
      { type: 'or', conditions: [orChild1, orChild2] },
      { type: 'not', condition: notInner },
    ]

    // Test count condition (threshold 5 -> halved=2, decremented=4)
    const countShrinks = Array.from(shrinkCondition(countCondition))
    // Should contain halved (threshold 2) and decremented (threshold 4) shrinks
    expect(countShrinks).toContainEqual({
      type: 'count', target: {}, comparison: '>=', threshold: 2, windowDays: 7
    })
    expect(countShrinks).toContainEqual({
      type: 'count', target: {}, comparison: '>=', threshold: 4, windowDays: 7
    })

    // Test daysSince condition (threshold 14 -> halved=7, decremented=13)
    const daysSinceShrinks = Array.from(shrinkCondition(daysSinceCondition))
    // Should contain halved (threshold 7) and decremented (threshold 13) shrinks
    expect(daysSinceShrinks).toContainEqual({
      type: 'daysSince', target: {}, comparison: '<=', threshold: 7
    })
    expect(daysSinceShrinks).toContainEqual({
      type: 'daysSince', target: {}, comparison: '<=', threshold: 13
    })

    // Test AND condition - should flatten to children
    const andShrinks = Array.from(shrinkCondition(conditions[2]))
    expect(andShrinks).toContainEqual(andChild1)
    expect(andShrinks).toContainEqual(andChild2)

    // Test OR condition - should flatten to children
    const orShrinks = Array.from(shrinkCondition(conditions[3]))
    expect(orShrinks).toContainEqual(orChild1)
    expect(orShrinks).toContainEqual(orChild2)

    // Test NOT condition - should unwrap to inner
    const notShrinks = Array.from(shrinkCondition(conditions[4]))
    expect(notShrinks).toContainEqual(notInner)
  })

  it('constraint set shrinker preserves constraint validity', () => {
    const c1 = { id: 'c1' as ConstraintId, type: 'mustBeBefore', sourceTarget: { tag: 'work' }, destTarget: { tag: 'leisure' } } as RelationalConstraint
    const c2 = { id: 'c2' as ConstraintId, type: 'mustBeAfter', sourceTarget: { tag: 'breakfast' }, destTarget: { tag: 'sleep' } } as RelationalConstraint
    const c3 = { id: 'c3' as ConstraintId, type: 'mustBeOnSameDay', sourceTarget: { tag: 'meeting' }, destTarget: { tag: 'prep' } } as RelationalConstraint
    const c4 = { id: 'c4' as ConstraintId, type: 'cantBeOnSameDay', sourceTarget: { tag: 'gym' }, destTarget: { tag: 'rest' } } as RelationalConstraint
    const constraints: RelationalConstraint[] = [c1, c2, c3, c4]

    const shrinks = Array.from(shrinkConstraintSet(constraints))

    // Verify shrinks with 3 elements (single removal) - all 4 possible removals
    expect(shrinks).toContainEqual([c2, c3, c4]) // Without c1
    expect(shrinks).toContainEqual([c1, c3, c4]) // Without c2
    expect(shrinks).toContainEqual([c1, c2, c4]) // Without c3
    expect(shrinks).toContainEqual([c1, c2, c3]) // Without c4

    // Verify halved shrink (2 elements) exists
    expect(shrinks).toContainEqual([c1, c2])

    // Verify all constraints in shrinks are from original set
    for (const shrunk of shrinks) {
      for (const c of shrunk) {
        expect([c1, c2, c3, c4]).toContainEqual(c)
      }
    }
  })

  it('link chain shrinker preserves chain structure', () => {
    const link0 = { parentSeriesId: 's0' as SeriesId, childSeriesId: 's1' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 }
    const link1 = { parentSeriesId: 's1' as SeriesId, childSeriesId: 's2' as SeriesId, targetDistance: 45, earlyWobble: 10, lateWobble: 10 }
    const link2 = { parentSeriesId: 's2' as SeriesId, childSeriesId: 's3' as SeriesId, targetDistance: 60, earlyWobble: 15, lateWobble: 15 }
    const link3 = { parentSeriesId: 's3' as SeriesId, childSeriesId: 's4' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 }
    const link4 = { parentSeriesId: 's4' as SeriesId, childSeriesId: 's5' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 }
    const links: Link[] = [link0, link1, link2, link3, link4]

    const shrinks = Array.from(shrinkLinkChain(links))

    // Verify halved chain (2 links) - first half of the chain
    expect(shrinks).toContainEqual([link0, link1])

    // Verify shorter chain (4 links - last removed)
    expect(shrinks).toContainEqual([link0, link1, link2, link3])

    // All shrinks should contain links from the original chain
    for (const shrunk of shrinks) {
      for (const link of shrunk) {
        expect(links).toContainEqual(link)
      }
    }
  })

  it('operation sequence shrinker handles mixed operations', () => {
    const create1 = { type: 'createSeries', series: { id: 's1', title: 'First' } }
    const create2 = { type: 'createSeries', series: { id: 's2', title: 'Second' } }
    const update = { type: 'updateSeries', seriesId: 's1', updates: { title: 'Updated' } }
    const link = { type: 'linkSeries', parentSeriesId: 's1', childSeriesId: 's2' }
    const lock = { type: 'lockSeries', seriesId: 's1' }
    const addTag = { type: 'addTag', seriesId: 's1', tag: 'important' }
    const unlock = { type: 'unlockSeries', seriesId: 's1' }
    const deleteOp = { type: 'deleteSeries', seriesId: 's2' }
    const ops = [create1, create2, update, link, lock, addTag, unlock, deleteOp]

    const shrinks = Array.from(shrinkOperationSequence(ops))

    // All shrinks should preserve at least one create operation from original set
    for (const shrunk of shrinks) {
      const creates = shrunk.filter(op => op.type === 'createSeries')
      expect(creates.some(c => c.type === 'createSeries' && [create1, create2].some(orig => orig.series.id === c.series.id))).toBe(true)
    }

    // Verify smallest shrink still has at least one create from original set
    const smallest = shrinks.reduce((min, s) => s.length < min.length ? s : min, shrinks[0])
    expect(smallest.some(op => op.type === 'createSeries')).toBe(true)
  })
})

// ============================================================================
// Helper Functions
// ============================================================================

function daysBetween(start: LocalDate, end: LocalDate): number {
  const s = parseLocalDate(start)
  const e = parseLocalDate(end)
  const startMs = Date.UTC(s.year, s.month - 1, s.day)
  const endMs = Date.UTC(e.year, e.month - 1, e.day)
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))
}
