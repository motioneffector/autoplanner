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
    expect(shrinkers.dateRange).toBeDefined()
    expect(shrinkers.duration).toBeDefined()
    expect(shrinkers.seriesArray).toBeDefined()
    expect(shrinkers.pattern).toBeDefined()
    expect(shrinkers.condition).toBeDefined()
    expect(shrinkers.constraintSet).toBeDefined()
    expect(shrinkers.linkChain).toBeDefined()
    expect(shrinkers.operationSequence).toBeDefined()
  })

  it('dateRangeArb integrates with fast-check', () => {
    fc.assert(
      fc.property(dateRangeArb(), (range) => {
        // Range should have valid dates
        expect(range.start).toBeDefined()
        expect(range.end).toBeDefined()
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

    // Should have some shrinks
    expect(shrinks.length).toBeGreaterThan(0)

    // All shrinks should have valid dates
    for (const shrunk of shrinks) {
      expect(shrunk.start).toBeDefined()
      expect(shrunk.end).toBeDefined()
      expect(shrunk.end >= shrunk.start).toBe(true)
    }

    // At least one should be smaller (halved or decremented)
    const smallerShrinks = shrinks.filter(s => {
      const origDays = daysBetween(range.start, range.end)
      const shrunkDays = daysBetween(s.start, s.end)
      return shrunkDays < origDays
    })
    expect(smallerShrinks.length).toBeGreaterThan(0)
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

    expect(shrinks.length).toBeGreaterThan(0)

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
    expect(shrinks.length).toBe(0)
  })
})

// ============================================================================
// Series Array Shrinker Tests
// ============================================================================

describe('Shrinkers - SeriesArray', () => {
  it('shrinks by removing elements', () => {
    const series: Series[] = [
      { id: 's1' as SeriesId, title: 'Series 1' } as Series,
      { id: 's2' as SeriesId, title: 'Series 2' } as Series,
      { id: 's3' as SeriesId, title: 'Series 3' } as Series,
      { id: 's4' as SeriesId, title: 'Series 4' } as Series,
    ]

    const shrinks = Array.from(shrinkSeriesArray(series))

    expect(shrinks.length).toBeGreaterThan(0)

    // All shrinks should be smaller
    for (const shrunk of shrinks) {
      expect(shrunk.length).toBeLessThan(series.length)
    }

    // Should include versions with one element removed
    const threeElementShrinks = shrinks.filter(s => s.length === 3)
    expect(threeElementShrinks.length).toBe(4) // One for each removal position
  })

  it('single element produces no shrinks', () => {
    const series: Series[] = [{ id: 's1' as SeriesId, title: 'Series 1' } as Series]
    const shrinks = Array.from(shrinkSeriesArray(series))
    expect(shrinks.length).toBe(0)
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

    // Should include reduced n values
    const reducedN = shrinks.filter(p => p.type === 'everyNDays' && p.n < 7)
    expect(reducedN.length).toBeGreaterThan(0)
  })

  it('daily pattern produces no shrinks', () => {
    const pattern: Pattern = { type: 'daily' }
    const shrinks = Array.from(shrinkPattern(pattern))
    expect(shrinks.length).toBe(0)
  })

  it('weekly pattern shrinks to single day', () => {
    const pattern: Pattern = {
      type: 'weekly',
      days: ['mon', 'wed', 'fri'],
    }

    const shrinks = Array.from(shrinkPattern(pattern))

    // Should try to simplify to daily
    expect(shrinks.some(p => p.type === 'daily')).toBe(true)

    // Should try reducing days
    const reducedDays = shrinks.filter(p => p.type === 'weekly' && p.days.length === 1)
    expect(reducedDays.length).toBeGreaterThan(0)
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

    // Should include reduced thresholds
    const reduced = shrinks.filter(c => c.type === 'count' && c.threshold < 10)
    expect(reduced.length).toBeGreaterThan(0)

    // Should include halved threshold
    const halved = shrinks.find(c => c.type === 'count' && c.threshold === 5)
    expect(halved).toBeDefined()
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
    const constraints: RelationalConstraint[] = [
      { id: 'c1' as ConstraintId, type: 'mustBeBefore', sourceTarget: {}, destTarget: {} },
      { id: 'c2' as ConstraintId, type: 'mustBeAfter', sourceTarget: {}, destTarget: {} },
      { id: 'c3' as ConstraintId, type: 'mustBeOnSameDay', sourceTarget: {}, destTarget: {} },
    ]

    const shrinks = Array.from(shrinkConstraintSet(constraints))

    // Should have shrinks with 2 elements (one removed)
    const twoElement = shrinks.filter(s => s.length === 2)
    expect(twoElement.length).toBe(3) // One for each position

    // All shrinks should be smaller
    for (const shrunk of shrinks) {
      expect(shrunk.length).toBeLessThan(constraints.length)
    }
  })

  it('single constraint produces no shrinks', () => {
    const constraints: RelationalConstraint[] = [
      { id: 'c1' as ConstraintId, type: 'mustBeBefore', sourceTarget: {}, destTarget: {} },
    ]
    const shrinks = Array.from(shrinkConstraintSet(constraints))
    expect(shrinks.length).toBe(0)
  })
})

// ============================================================================
// Link Chain Shrinker Tests
// ============================================================================

describe('Shrinkers - LinkChain', () => {
  it('shortens chain from the end', () => {
    const links: Link[] = [
      { parentSeriesId: 's0' as SeriesId, childSeriesId: 's1' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 },
      { parentSeriesId: 's1' as SeriesId, childSeriesId: 's2' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 },
      { parentSeriesId: 's2' as SeriesId, childSeriesId: 's3' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 },
      { parentSeriesId: 's3' as SeriesId, childSeriesId: 's4' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 },
    ]

    const shrinks = Array.from(shrinkLinkChain(links))

    expect(shrinks.length).toBeGreaterThan(0)

    // Should include chain with last link removed
    const shorterChain = shrinks.find(s => s.length === 3)
    expect(shorterChain).toBeDefined()

    // Should include halved chain
    const halved = shrinks.find(s => s.length === 2)
    expect(halved).toBeDefined()
  })

  it('single link produces no shrinks', () => {
    const links: Link[] = [
      { parentSeriesId: 's0' as SeriesId, childSeriesId: 's1' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 },
    ]
    const shrinks = Array.from(shrinkLinkChain(links))
    expect(shrinks.length).toBe(0)
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
    const ops = [
      { type: 'createSeries', series: { id: 's1' } },
      { type: 'updateSeries', seriesId: 's1', updates: {} },
      { type: 'lockSeries', seriesId: 's1' },
      { type: 'deleteSeries', seriesId: 's1' },
    ]

    const shrinks = Array.from(shrinkOperationSequence(ops))

    // Most shrinks should preserve the last operation
    const withLast = shrinks.filter(s => s[s.length - 1]?.type === 'deleteSeries')
    expect(withLast.length).toBeGreaterThan(0)
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
    expect(minimal).toBeDefined()
  })

  it('single operation produces no shrinks', () => {
    const ops = [{ type: 'createSeries', series: { id: 's1' } }]
    const shrinks = Array.from(shrinkOperationSequence(ops))
    expect(shrinks.length).toBe(0)
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
    expect(current.length).toBe(3)
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
        expect(shrinks.length).toBeGreaterThan(0)
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
        expect(shrinks.length).toBeGreaterThan(0)

        // All shrinks should simplify to daily
        const hasDaily = shrinks.some(p => p.type === 'daily')
        expect(hasDaily).toBe(true)
      }
    }
  })

  it('condition shrinker handles nested conditions', () => {
    const conditions: Condition[] = [
      { type: 'count', target: {}, comparison: '>=', threshold: 5, windowDays: 7 },
      { type: 'daysSince', target: {}, comparison: '<=', threshold: 14 },
      {
        type: 'and',
        conditions: [
          { type: 'count', target: {}, comparison: '>=', threshold: 3, windowDays: 7 },
          { type: 'daysSince', target: {}, comparison: '<=', threshold: 7 },
        ],
      },
      {
        type: 'or',
        conditions: [
          { type: 'count', target: {}, comparison: '=', threshold: 0, windowDays: 1 },
          { type: 'daysSince', target: {}, comparison: '>', threshold: 30 },
        ],
      },
      {
        type: 'not',
        condition: { type: 'count', target: {}, comparison: '>=', threshold: 10, windowDays: 30 },
      },
    ]

    for (const condition of conditions) {
      const shrinks = Array.from(shrinkCondition(condition))

      // Leaf conditions with threshold > 1 should shrink
      if (condition.type === 'count' || condition.type === 'daysSince') {
        if (condition.threshold > 1) {
          expect(shrinks.length).toBeGreaterThan(0)
        }
      }

      // Compound conditions should always shrink
      if (condition.type === 'and' || condition.type === 'or' || condition.type === 'not') {
        expect(shrinks.length).toBeGreaterThan(0)
      }
    }
  })

  it('constraint set shrinker preserves constraint validity', () => {
    const constraints: RelationalConstraint[] = [
      { id: 'c1' as ConstraintId, type: 'mustBeBefore', sourceTarget: { tag: 'work' }, destTarget: { tag: 'leisure' } },
      { id: 'c2' as ConstraintId, type: 'mustBeAfter', sourceTarget: { tag: 'breakfast' }, destTarget: { tag: 'sleep' } },
      { id: 'c3' as ConstraintId, type: 'mustBeOnSameDay', sourceTarget: { tag: 'meeting' }, destTarget: { tag: 'prep' } },
      { id: 'c4' as ConstraintId, type: 'cantBeOnSameDay', sourceTarget: { tag: 'gym' }, destTarget: { tag: 'rest' } },
    ]

    const shrinks = Array.from(shrinkConstraintSet(constraints))

    // Should have shrinks
    expect(shrinks.length).toBeGreaterThan(0)

    // All shrinks should have valid constraints
    for (const shrunk of shrinks) {
      expect(shrunk.length).toBeLessThan(constraints.length)

      for (const c of shrunk) {
        expect(c.type).toBeDefined()
        expect(c.sourceTarget).toBeDefined()
        expect(c.destTarget).toBeDefined()
      }
    }
  })

  it('link chain shrinker preserves chain structure', () => {
    const links: Link[] = [
      { parentSeriesId: 's0' as SeriesId, childSeriesId: 's1' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 },
      { parentSeriesId: 's1' as SeriesId, childSeriesId: 's2' as SeriesId, targetDistance: 45, earlyWobble: 10, lateWobble: 10 },
      { parentSeriesId: 's2' as SeriesId, childSeriesId: 's3' as SeriesId, targetDistance: 60, earlyWobble: 15, lateWobble: 15 },
      { parentSeriesId: 's3' as SeriesId, childSeriesId: 's4' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 },
      { parentSeriesId: 's4' as SeriesId, childSeriesId: 's5' as SeriesId, targetDistance: 30, earlyWobble: 5, lateWobble: 5 },
    ]

    const shrinks = Array.from(shrinkLinkChain(links))

    expect(shrinks.length).toBeGreaterThan(0)

    // All shrinks should be valid chains (each link valid)
    for (const shrunk of shrinks) {
      expect(shrunk.length).toBeLessThan(links.length)

      for (const link of shrunk) {
        expect(link.parentSeriesId).toBeDefined()
        expect(link.childSeriesId).toBeDefined()
        expect(link.targetDistance).toBeGreaterThan(0)
        expect(link.earlyWobble).toBeGreaterThanOrEqual(0)
        expect(link.lateWobble).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('operation sequence shrinker handles mixed operations', () => {
    const ops = [
      { type: 'createSeries', series: { id: 's1', title: 'First' } },
      { type: 'createSeries', series: { id: 's2', title: 'Second' } },
      { type: 'updateSeries', seriesId: 's1', updates: { title: 'Updated' } },
      { type: 'linkSeries', parentSeriesId: 's1', childSeriesId: 's2' },
      { type: 'lockSeries', seriesId: 's1' },
      { type: 'addTag', seriesId: 's1', tag: 'important' },
      { type: 'unlockSeries', seriesId: 's1' },
      { type: 'deleteSeries', seriesId: 's2' },
    ]

    const shrinks = Array.from(shrinkOperationSequence(ops))

    expect(shrinks.length).toBeGreaterThan(0)

    // All shrinks should preserve create operations
    for (const shrunk of shrinks) {
      const creates = shrunk.filter(op => op.type === 'createSeries')
      expect(creates.length).toBeGreaterThanOrEqual(1) // At least one create
    }

    // Should include minimal sequence
    const minimal = shrinks.find(s => s.length === 2)
    expect(minimal).toBeDefined()
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
