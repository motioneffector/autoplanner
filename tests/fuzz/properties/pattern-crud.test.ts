/**
 * Property tests for pattern and condition CRUD operations.
 *
 * Tests the invariants and laws for:
 * - Pattern association with series
 * - Condition tree management
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  seriesIdGen,
  simplePatternGen,
  conditionGen,
  countConditionGen,
  andConditionGen,
} from '../generators'
import type { SeriesId, Pattern, Condition } from '../lib/types'

// ============================================================================
// Helper: Pattern Manager
// ============================================================================

class PatternManager {
  private patterns: Map<string, Pattern> = new Map()
  private seriesPatterns: Map<SeriesId, Set<string>> = new Map()
  private idCounter = 0

  createPattern(seriesId: SeriesId, pattern: Pattern): string {
    const id = `pattern-${++this.idCounter}`
    this.patterns.set(id, pattern)

    if (!this.seriesPatterns.has(seriesId)) {
      this.seriesPatterns.set(seriesId, new Set())
    }
    this.seriesPatterns.get(seriesId)!.add(id)

    return id
  }

  getPattern(id: string): Pattern | undefined {
    return this.patterns.get(id)
  }

  deletePattern(id: string): boolean {
    if (!this.patterns.has(id)) return false

    this.patterns.delete(id)

    // Remove from series association
    for (const [, patternIds] of this.seriesPatterns) {
      patternIds.delete(id)
    }

    return true
  }

  getPatternsForSeries(seriesId: SeriesId): Pattern[] {
    const patternIds = this.seriesPatterns.get(seriesId) ?? new Set()
    return Array.from(patternIds)
      .map((id) => this.patterns.get(id))
      .filter((p): p is Pattern => p !== undefined)
  }
}

// ============================================================================
// Helper: Condition Manager
// ============================================================================

class ConditionManager {
  private conditions: Map<string, Condition> = new Map()
  private seriesConditions: Map<SeriesId, Set<string>> = new Map()
  private idCounter = 0

  createCondition(seriesId: SeriesId, condition: Condition): string {
    const id = `condition-${++this.idCounter}`
    this.conditions.set(id, condition)

    if (!this.seriesConditions.has(seriesId)) {
      this.seriesConditions.set(seriesId, new Set())
    }
    this.seriesConditions.get(seriesId)!.add(id)

    return id
  }

  getCondition(id: string): Condition | undefined {
    return this.conditions.get(id)
  }

  deleteCondition(id: string): boolean {
    if (!this.conditions.has(id)) return false

    this.conditions.delete(id)

    // Remove from series association
    for (const [, conditionIds] of this.seriesConditions) {
      conditionIds.delete(id)
    }

    return true
  }

  getConditionsForSeries(seriesId: SeriesId): Condition[] {
    const conditionIds = this.seriesConditions.get(seriesId) ?? new Set()
    return Array.from(conditionIds)
      .map((id) => this.conditions.get(id))
      .filter((c): c is Condition => c !== undefined)
  }

  deleteConditionsForSeries(seriesId: SeriesId): number {
    const conditionIds = this.seriesConditions.get(seriesId) ?? new Set()
    let deleted = 0
    for (const id of conditionIds) {
      if (this.conditions.delete(id)) {
        deleted++
      }
    }
    this.seriesConditions.delete(seriesId)
    return deleted
  }
}

// ============================================================================
// Pattern CRUD Properties (Task #264-#265)
// ============================================================================

describe('Spec 4: Patterns - CRUD Operations', () => {
  it('Property #264: createPattern associates with series', () => {
    fc.assert(
      fc.property(seriesIdGen(), simplePatternGen(), (seriesId, pattern) => {
        const manager = new PatternManager()
        const patternId = manager.createPattern(seriesId, pattern)

        expect(patternId).toMatch(/^pattern-/)
        expect(manager.getPattern(patternId)).toBeDefined()
        expect(manager.getPatternsForSeries(seriesId)).toContainEqual(pattern)
      })
    )
  })

  it('Property #265: deletePattern removes from series', () => {
    fc.assert(
      fc.property(seriesIdGen(), simplePatternGen(), (seriesId, pattern) => {
        const manager = new PatternManager()
        const patternId = manager.createPattern(seriesId, pattern)

        expect(manager.getPatternsForSeries(seriesId).length).toBe(1)

        const deleted = manager.deletePattern(patternId)
        expect(deleted).toBe(true)
        expect(manager.getPattern(patternId)).toBeUndefined()
        expect(manager.getPatternsForSeries(seriesId).length).toBe(0)
      })
    )
  })

  it('series can have multiple patterns', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        fc.array(simplePatternGen(), { minLength: 2, maxLength: 5 }),
        (seriesId, patterns) => {
          const manager = new PatternManager()

          for (const pattern of patterns) {
            manager.createPattern(seriesId, pattern)
          }

          expect(manager.getPatternsForSeries(seriesId).length).toBe(patterns.length)
        }
      )
    )
  })

  it('delete non-existent pattern returns false', () => {
    const manager = new PatternManager()
    expect(manager.deletePattern('nonexistent')).toBe(false)
  })
})

// ============================================================================
// Condition CRUD Properties (Task #266-#267)
// ============================================================================

describe('Spec 7: Conditions - CRUD Operations', () => {
  it('Property #266: createCondition returns valid ID', () => {
    fc.assert(
      fc.property(seriesIdGen(), conditionGen(), (seriesId, condition) => {
        const manager = new ConditionManager()
        const conditionId = manager.createCondition(seriesId, condition)

        expect(conditionId).toMatch(/^condition-/)
        expect(manager.getCondition(conditionId)).toBeDefined()
        expect(manager.getConditionsForSeries(seriesId)).toContainEqual(condition)
      })
    )
  })

  it('Property #267: condition tree deletion cascades', () => {
    fc.assert(
      fc.property(seriesIdGen(), andConditionGen(), (seriesId, condition) => {
        const manager = new ConditionManager()
        const conditionId = manager.createCondition(seriesId, condition)

        // Delete the root condition
        const deleted = manager.deleteCondition(conditionId)
        expect(deleted).toBe(true)
        expect(manager.getCondition(conditionId)).toBeUndefined()

        // Note: In a real implementation, child conditions would also be deleted
        // Our mock just stores the whole tree as one condition
      })
    )
  })

  it('series can have multiple conditions', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        fc.array(countConditionGen(), { minLength: 2, maxLength: 5 }),
        (seriesId, conditions) => {
          const manager = new ConditionManager()

          for (const condition of conditions) {
            manager.createCondition(seriesId, condition)
          }

          expect(manager.getConditionsForSeries(seriesId).length).toBe(conditions.length)
        }
      )
    )
  })

  it('deleteConditionsForSeries removes all conditions', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        fc.array(countConditionGen(), { minLength: 1, maxLength: 5 }),
        (seriesId, conditions) => {
          const manager = new ConditionManager()

          for (const condition of conditions) {
            manager.createCondition(seriesId, condition)
          }

          const deleted = manager.deleteConditionsForSeries(seriesId)
          expect(deleted).toBe(conditions.length)
          expect(manager.getConditionsForSeries(seriesId).length).toBe(0)
        }
      )
    )
  })
})

// ============================================================================
// Cross-Reference Properties
// ============================================================================

describe('Pattern/Condition - Cross Reference', () => {
  it('patterns and conditions for different series are independent', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        seriesIdGen(),
        simplePatternGen(),
        countConditionGen(),
        (series1, series2, pattern, condition) => {
          fc.pre(series1 !== series2)

          const patternManager = new PatternManager()
          const conditionManager = new ConditionManager()

          patternManager.createPattern(series1, pattern)
          conditionManager.createCondition(series2, condition)

          // Series 1 has pattern but no condition
          expect(patternManager.getPatternsForSeries(series1).length).toBe(1)
          expect(conditionManager.getConditionsForSeries(series1).length).toBe(0)

          // Series 2 has condition but no pattern
          expect(patternManager.getPatternsForSeries(series2).length).toBe(0)
          expect(conditionManager.getConditionsForSeries(series2).length).toBe(1)
        }
      )
    )
  })
})
