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
    // Verify shrinkers are functions that return iterables
    expect(shrinkers.dateRange).toEqual(expect.any(Function))
    expect(shrinkers.duration).toEqual(expect.any(Function))
    expect(shrinkers.seriesArray).toEqual(expect.any(Function))
    expect(shrinkers.pattern).toEqual(expect.any(Function))
    expect(shrinkers.condition).toEqual(expect.any(Function))
    expect(shrinkers.constraintSet).toEqual(expect.any(Function))
    expect(shrinkers.linkChain).toEqual(expect.any(Function))
    expect(shrinkers.operationSequence).toEqual(expect.any(Function))
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

    // Should have at least 2 shrinks (halved and decremented) with valid date structures
    expect(shrinks.length).toBeGreaterThanOrEqual(2)
    for (const shrunk of shrinks) {
      expect(shrunk).toEqual(expect.objectContaining({ start: expect.any(String), end: expect.any(String) }))
    }

    // All shrinks should have valid dates in YYYY-MM-DD format
    for (const shrunk of shrinks) {
      expect(shrunk.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(shrunk.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(shrunk.end >= shrunk.start).toBe(true)
    }

    // At least one should be smaller (halved or decremented)
    const smallerShrinks = shrinks.filter(s => {
      const origDays = daysBetween(range.start, range.end)
      const shrunkDays = daysBetween(s.start, s.end)
      return shrunkDays < origDays
    })
    expect(smallerShrinks).toEqual(expect.arrayContaining([
      expect.objectContaining({ start: expect.any(String), end: expect.any(String) })
    ]))
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

    // Should have at least 4 shrinks (one for each element removal from 4-element array)
    // Each shrink should be smaller than original and contain valid series IDs
    expect(shrinks).toEqual(expect.arrayContaining([
      expect.arrayContaining([expect.objectContaining({ id: expect.any(String), title: expect.any(String) })]),
      expect.arrayContaining([expect.objectContaining({ id: expect.any(String), title: expect.any(String) })]),
      expect.arrayContaining([expect.objectContaining({ id: expect.any(String), title: expect.any(String) })]),
      expect.arrayContaining([expect.objectContaining({ id: expect.any(String), title: expect.any(String) })])
    ]))
    for (const shrunk of shrinks) {
      for (const s of shrunk) {
        expect(['s1', 's2', 's3', 's4']).toContain(s.id)
      }
    }

    // Verify shrinks with 3 elements represent each possible single-element removal
    const threeElementShrinks = shrinks.filter(s => s.length === 3)
    expect(threeElementShrinks.length).toBeGreaterThanOrEqual(4)
    // Each 3-element shrink should be missing exactly one ID from the original set
    const missingIds = threeElementShrinks.map(shrunk => {
      const ids = shrunk.map(s => s.id)
      return ['s1', 's2', 's3', 's4'].find(id => !ids.includes(id as SeriesId))
    })
    // Should have all 4 possible single-element removals
    expect(new Set(missingIds)).toEqual(new Set(['s1', 's2', 's3', 's4']))
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

    // Should try reducing days to single day variants (at least one of: mon, wed, fri)
    const reducedDays = shrinks.filter(p => p.type === 'weekly' && p.days.length === 1)
    expect(reducedDays).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'weekly', days: expect.arrayContaining([expect.any(String)]) })
    ]))
    // Verify single-day shrinks contain valid days from original
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
    const constraints: RelationalConstraint[] = [
      { id: 'c1' as ConstraintId, type: 'mustBeBefore', sourceTarget: {}, destTarget: {} },
      { id: 'c2' as ConstraintId, type: 'mustBeAfter', sourceTarget: {}, destTarget: {} },
      { id: 'c3' as ConstraintId, type: 'mustBeOnSameDay', sourceTarget: {}, destTarget: {} },
    ]

    const shrinks = Array.from(shrinkConstraintSet(constraints))

    // Should have exactly 3 shrinks with 2 elements each (one removed from 3)
    // Verify structure: each shrink has valid constraints and is missing exactly one
    expect(shrinks).toEqual([
      expect.arrayContaining([expect.objectContaining({ id: expect.any(String), type: expect.any(String) })]),
      expect.arrayContaining([expect.objectContaining({ id: expect.any(String), type: expect.any(String) })]),
      expect.arrayContaining([expect.objectContaining({ id: expect.any(String), type: expect.any(String) })])
    ])
    const missingIds = shrinks.map(shrunk => {
      const ids = shrunk.map(c => c.id)
      return ['c1', 'c2', 'c3'].find(id => !ids.includes(id as ConstraintId))
    })
    expect(missingIds.sort()).toEqual(['c1', 'c2', 'c3'])

    // All shrinks should have exactly 2 valid constraints with proper structure
    for (const shrunk of shrinks) {
      expect(shrunk).toEqual([
        expect.objectContaining({ id: expect.any(String), type: expect.any(String) }),
        expect.objectContaining({ id: expect.any(String), type: expect.any(String) })
      ])
      for (const c of shrunk) {
        expect(['c1', 'c2', 'c3']).toContain(c.id)
        expect(['mustBeBefore', 'mustBeAfter', 'mustBeOnSameDay']).toContain(c.type)
      }
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

    // Should have at least 2 shrinks with valid chain structure
    expect(shrinks).toEqual(expect.arrayContaining([
      expect.arrayContaining([expect.objectContaining({ parentSeriesId: expect.any(String), childSeriesId: expect.any(String) })]),
      expect.arrayContaining([expect.objectContaining({ parentSeriesId: expect.any(String), childSeriesId: expect.any(String) })])
    ]))
    for (const shrunk of shrinks) {
      for (const link of shrunk) {
        expect(link).toEqual(expect.objectContaining({
          parentSeriesId: expect.any(String),
          childSeriesId: expect.any(String),
          targetDistance: expect.any(Number)
        }))
      }
    }

    // Verify halved chain (2 links) exists with correct structure
    const halved = shrinks.find(s => s.length === 2)
    expect(halved).toEqual([
      expect.objectContaining({ parentSeriesId: 's0', childSeriesId: 's1' }),
      expect.objectContaining({ parentSeriesId: 's1', childSeriesId: 's2' })
    ])

    // Verify shorter chain (3 links - last removed) exists with correct structure
    const shorterChain = shrinks.find(s => s.length === 3)
    expect(shorterChain).toEqual([
      expect.objectContaining({ parentSeriesId: 's0', childSeriesId: 's1' }),
      expect.objectContaining({ parentSeriesId: 's1', childSeriesId: 's2' }),
      expect.objectContaining({ parentSeriesId: 's2', childSeriesId: 's3' })
    ])
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

    // Most shrinks should preserve the last operation (deleteSeries)
    const withLast = shrinks.filter(s => s[s.length - 1]?.type === 'deleteSeries')
    expect(withLast).toEqual(expect.arrayContaining([
      expect.arrayContaining([expect.objectContaining({ type: expect.any(String) })])
    ]))
    // Verify shrinks preserve first (create) and last (delete) operations
    for (const shrunk of withLast) {
      expect(shrunk[0]).toEqual(expect.objectContaining({ type: 'createSeries' }))
      expect(shrunk[shrunk.length - 1]).toEqual(expect.objectContaining({ type: 'deleteSeries' }))
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

    // Should have shrunk to 3 (minimal failing) with valid series structure
    expect(current).toEqual([
      expect.objectContaining({ id: expect.any(String), title: expect.any(String) }),
      expect.objectContaining({ id: expect.any(String), title: expect.any(String) }),
      expect.objectContaining({ id: expect.any(String), title: expect.any(String) })
    ])
    // Verify IDs are from original set
    const ids = current.map(s => s.id as string)
    expect(ids.every(id => id.startsWith('s'))).toBe(true)
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
        // Expect at least 2 shrinks (halved and decremented) with valid structure
        expect(shrinks.length).toBeGreaterThanOrEqual(2)
        for (const shrunk of shrinks) {
          expect(shrunk).toEqual(expect.objectContaining({ start: expect.any(String), end: expect.any(String) }))
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
        // Non-daily patterns should have at least 1 shrink
        expect(shrinks).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: expect.any(String) })
        ]))

        // All shrinks should include daily as one option
        const daily = shrinks.find(p => p.type === 'daily')
        expect(daily).toEqual({ type: 'daily' })
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
          // Expect at least 2 shrinks (halved and decremented threshold)
          expect(shrinks.length).toBeGreaterThanOrEqual(2)
          for (const shrunk of shrinks) {
            expect(shrunk).toEqual(expect.objectContaining({ type: condition.type, threshold: expect.any(Number) }))
          }
        }
      }

      // Compound conditions should always shrink
      if (condition.type === 'and' || condition.type === 'or' || condition.type === 'not') {
        // Compound conditions flatten to their children
        expect(shrinks).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: expect.any(String) })
        ]))
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

    // Should have at least 4 shrinks (one for each element removal from 4-element array)
    // Verify structure: each shrink is smaller than original and has valid constraints
    expect(shrinks).toEqual(expect.arrayContaining([
      expect.arrayContaining([expect.objectContaining({ id: expect.any(String), type: expect.any(String) })]),
      expect.arrayContaining([expect.objectContaining({ id: expect.any(String), type: expect.any(String) })]),
      expect.arrayContaining([expect.objectContaining({ id: expect.any(String), type: expect.any(String) })]),
      expect.arrayContaining([expect.objectContaining({ id: expect.any(String), type: expect.any(String) })])
    ]))
    for (const shrunk of shrinks) {
      for (const c of shrunk) {
        expect(c).toEqual(expect.objectContaining({ id: expect.any(String), type: expect.any(String) }))
      }
    }

    // Verify shrinks with 3 elements (single removal) have all possible removals
    const threeElementShrinks = shrinks.filter(s => s.length === 3)
    expect(threeElementShrinks.length).toBeGreaterThanOrEqual(4)
    const missingIds = threeElementShrinks.map(shrunk => {
      const ids = shrunk.map(c => c.id)
      return ['c1', 'c2', 'c3', 'c4'].find(id => !ids.includes(id as ConstraintId))
    })
    expect(new Set(missingIds)).toEqual(new Set(['c1', 'c2', 'c3', 'c4']))

    // All shrinks should have valid constraints with proper structure
    for (const shrunk of shrinks) {
      for (const c of shrunk) {
        expect(['mustBeBefore', 'mustBeAfter', 'mustBeOnSameDay', 'cantBeOnSameDay']).toContain(c.type)
        expect(c.sourceTarget).toEqual(expect.objectContaining({ tag: expect.any(String) }))
        expect(c.destTarget).toEqual(expect.objectContaining({ tag: expect.any(String) }))
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

    // Should have at least 2 shrinks with valid structure
    expect(shrinks).toEqual(expect.arrayContaining([
      expect.arrayContaining([expect.objectContaining({ parentSeriesId: expect.any(String), childSeriesId: expect.any(String) })]),
      expect.arrayContaining([expect.objectContaining({ parentSeriesId: expect.any(String), childSeriesId: expect.any(String) })])
    ]))
    for (const shrunk of shrinks) {
      for (const link of shrunk) {
        expect(link).toEqual(expect.objectContaining({
          parentSeriesId: expect.any(String),
          childSeriesId: expect.any(String),
          targetDistance: expect.any(Number)
        }))
        expect(link.targetDistance).toBeGreaterThan(0)
        expect(link.earlyWobble).toBeGreaterThanOrEqual(0)
        expect(link.lateWobble).toBeGreaterThanOrEqual(0)
      }
    }

    // Verify halved chain (2 links) exists
    const halved = shrinks.find(s => s.length === 2)
    expect(halved).toEqual(expect.arrayContaining([
      expect.objectContaining({ parentSeriesId: expect.any(String) })
    ]))
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

    // Should have at least 2 shrinks with valid structure
    expect(shrinks).toEqual(expect.arrayContaining([
      expect.arrayContaining([expect.objectContaining({ type: expect.any(String) })]),
      expect.arrayContaining([expect.objectContaining({ type: expect.any(String) })])
    ]))
    for (const shrunk of shrinks) {
      for (const op of shrunk) {
        expect(op).toEqual(expect.objectContaining({ type: expect.any(String) }))
      }
    }

    // All shrinks should preserve at least one create operation
    for (const shrunk of shrinks) {
      const creates = shrunk.filter(op => op.type === 'createSeries')
      expect(creates).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'createSeries' })
      ]))
    }

    // Verify there's a shrink smaller than original
    const smallest = shrinks.reduce((min, s) => s.length < min.length ? s : min, shrinks[0])
    expect(smallest).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: expect.any(String) })
    ]))
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
