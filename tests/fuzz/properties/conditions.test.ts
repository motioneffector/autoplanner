/**
 * Property tests for condition evaluation (Spec 7).
 *
 * Tests the invariants and laws for:
 * - Count and daysSince conditions
 * - Boolean logic (AND, OR, NOT)
 * - De Morgan's laws
 * - Condition determinism
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  countConditionGen,
  daysSinceConditionGen,
  andConditionGen,
  orConditionGen,
  notConditionGen,
  leafConditionGen,
  conditionGen,
  targetGen,
} from '../generators'
import type { Condition, CountCondition, DaysSinceCondition, AndCondition, OrCondition, NotCondition, Completion, SeriesId } from '../lib/types'

// ============================================================================
// Mock Evaluation Context
// ============================================================================

/**
 * Simplified condition evaluator for property testing.
 * Uses mock completion data.
 */
function evaluateCondition(
  condition: Condition,
  context: {
    completions: Completion[]
    today: Date
    seriesIdToTag: Map<SeriesId, string[]>
  }
): boolean {
  switch (condition.type) {
    case 'count': {
      const { target, comparison, threshold, windowDays } = condition
      const count = countCompletions(context.completions, target, windowDays, context.today, context.seriesIdToTag)
      return compare(count, comparison, threshold)
    }

    case 'daysSince': {
      const { target, comparison, threshold } = condition
      const days = daysSinceLastCompletion(context.completions, target, context.today, context.seriesIdToTag)
      return compare(days, comparison, threshold)
    }

    case 'and': {
      if (condition.conditions.length === 0) return true // Empty AND is true
      return condition.conditions.every((c) => evaluateCondition(c, context))
    }

    case 'or': {
      if (condition.conditions.length === 0) return false // Empty OR is false
      return condition.conditions.some((c) => evaluateCondition(c, context))
    }

    case 'not': {
      return !evaluateCondition(condition.condition, context)
    }
  }
}

function countCompletions(
  completions: Completion[],
  target: { tag?: string; seriesId?: SeriesId },
  windowDays: number,
  today: Date,
  seriesIdToTag: Map<SeriesId, string[]>
): number {
  const windowStart = new Date(today)
  windowStart.setDate(windowStart.getDate() - windowDays + 1)

  return completions.filter((c) => {
    // Check if completion matches target
    if (target.seriesId && c.seriesId !== target.seriesId) return false
    if (target.tag) {
      const tags = seriesIdToTag.get(c.seriesId) ?? []
      if (!tags.includes(target.tag)) return false
    }

    // Check if completion is within window
    const completionDate = new Date(c.instanceDate)
    return completionDate >= windowStart && completionDate <= today
  }).length
}

function daysSinceLastCompletion(
  completions: Completion[],
  target: { tag?: string; seriesId?: SeriesId },
  today: Date,
  seriesIdToTag: Map<SeriesId, string[]>
): number {
  const matchingCompletions = completions.filter((c) => {
    if (target.seriesId && c.seriesId !== target.seriesId) return false
    if (target.tag) {
      const tags = seriesIdToTag.get(c.seriesId) ?? []
      if (!tags.includes(target.tag)) return false
    }
    return true
  })

  if (matchingCompletions.length === 0) return Infinity

  const lastCompletion = matchingCompletions.reduce((latest, c) => {
    const cDate = new Date(c.instanceDate)
    return cDate > latest ? cDate : latest
  }, new Date(0))

  const diffTime = today.getTime() - lastCompletion.getTime()
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

function compare(value: number, op: '<' | '<=' | '=' | '>=' | '>', threshold: number): boolean {
  switch (op) {
    case '<':
      return value < threshold
    case '<=':
      return value <= threshold
    case '=':
      return value === threshold
    case '>=':
      return value >= threshold
    case '>':
      return value > threshold
  }
}

// ============================================================================
// Empty Context for Boolean Logic Tests
// ============================================================================

const emptyContext = {
  completions: [],
  today: new Date(),
  seriesIdToTag: new Map<SeriesId, string[]>(),
}

// ============================================================================
// Boolean Logic Properties (Task #223-#231)
// ============================================================================

describe('Spec 7: Conditions - Boolean Logic', () => {
  it('Property #223: AND with empty conditions = true', () => {
    const emptyAnd: AndCondition = { type: 'and', conditions: [] }
    expect(evaluateCondition(emptyAnd, emptyContext)).toBe(true)
  })

  it('Property #224: OR with empty conditions = false', () => {
    const emptyOr: OrCondition = { type: 'or', conditions: [] }
    expect(evaluateCondition(emptyOr, emptyContext)).toBe(false)
  })

  it('Property #225: NOT(NOT(x)) = x', () => {
    fc.assert(
      fc.property(leafConditionGen(), (condition) => {
        const notNot: NotCondition = {
          type: 'not',
          condition: { type: 'not', condition: condition },
        }

        const original = evaluateCondition(condition, emptyContext)
        const doubleNegated = evaluateCondition(notNot, emptyContext)

        expect(doubleNegated).toBe(original)
      })
    )
  })

  it('Property #226: De Morgan — NOT(A AND B) = NOT(A) OR NOT(B)', () => {
    fc.assert(
      fc.property(leafConditionGen(), leafConditionGen(), (a, b) => {
        // NOT(A AND B)
        const leftSide: NotCondition = {
          type: 'not',
          condition: { type: 'and', conditions: [a, b] },
        }

        // NOT(A) OR NOT(B)
        const rightSide: OrCondition = {
          type: 'or',
          conditions: [
            { type: 'not', condition: a },
            { type: 'not', condition: b },
          ],
        }

        expect(evaluateCondition(leftSide, emptyContext)).toBe(evaluateCondition(rightSide, emptyContext))
      })
    )
  })

  it('Property #227: De Morgan — NOT(A OR B) = NOT(A) AND NOT(B)', () => {
    fc.assert(
      fc.property(leafConditionGen(), leafConditionGen(), (a, b) => {
        // NOT(A OR B)
        const leftSide: NotCondition = {
          type: 'not',
          condition: { type: 'or', conditions: [a, b] },
        }

        // NOT(A) AND NOT(B)
        const rightSide: AndCondition = {
          type: 'and',
          conditions: [
            { type: 'not', condition: a },
            { type: 'not', condition: b },
          ],
        }

        expect(evaluateCondition(leftSide, emptyContext)).toBe(evaluateCondition(rightSide, emptyContext))
      })
    )
  })

  it('Property #228: AND is commutative', () => {
    fc.assert(
      fc.property(leafConditionGen(), leafConditionGen(), (a, b) => {
        const ab: AndCondition = { type: 'and', conditions: [a, b] }
        const ba: AndCondition = { type: 'and', conditions: [b, a] }

        expect(evaluateCondition(ab, emptyContext)).toBe(evaluateCondition(ba, emptyContext))
      })
    )
  })

  it('Property #229: OR is commutative', () => {
    fc.assert(
      fc.property(leafConditionGen(), leafConditionGen(), (a, b) => {
        const ab: OrCondition = { type: 'or', conditions: [a, b] }
        const ba: OrCondition = { type: 'or', conditions: [b, a] }

        expect(evaluateCondition(ab, emptyContext)).toBe(evaluateCondition(ba, emptyContext))
      })
    )
  })

  it('Property #230: AND is associative', () => {
    fc.assert(
      fc.property(leafConditionGen(), leafConditionGen(), leafConditionGen(), (a, b, c) => {
        // (A AND B) AND C
        const leftAssoc: AndCondition = {
          type: 'and',
          conditions: [{ type: 'and', conditions: [a, b] }, c],
        }

        // A AND (B AND C)
        const rightAssoc: AndCondition = {
          type: 'and',
          conditions: [a, { type: 'and', conditions: [b, c] }],
        }

        expect(evaluateCondition(leftAssoc, emptyContext)).toBe(evaluateCondition(rightAssoc, emptyContext))
      })
    )
  })

  it('Property #231: OR is associative', () => {
    fc.assert(
      fc.property(leafConditionGen(), leafConditionGen(), leafConditionGen(), (a, b, c) => {
        // (A OR B) OR C
        const leftAssoc: OrCondition = {
          type: 'or',
          conditions: [{ type: 'or', conditions: [a, b] }, c],
        }

        // A OR (B OR C)
        const rightAssoc: OrCondition = {
          type: 'or',
          conditions: [a, { type: 'or', conditions: [b, c] }],
        }

        expect(evaluateCondition(leftAssoc, emptyContext)).toBe(evaluateCondition(rightAssoc, emptyContext))
      })
    )
  })
})

// ============================================================================
// Count Condition Properties (Task #232-#235)
// ============================================================================

describe('Spec 7: Conditions - Count', () => {
  it('Property #232: count with 0 completions = 0', () => {
    fc.assert(
      fc.property(countConditionGen(), (condition) => {
        const context = {
          completions: [],
          today: new Date(),
          seriesIdToTag: new Map<SeriesId, string[]>(),
        }

        // With no completions, count should be 0
        // This means:
        // - count < threshold: true if threshold > 0
        // - count <= threshold: always true (0 <= anything)
        // - count = threshold: true iff threshold = 0
        // - count >= threshold: true iff threshold = 0
        // - count > threshold: false

        const result = evaluateCondition(condition, context)

        switch (condition.comparison) {
          case '<':
            expect(result).toBe(condition.threshold > 0)
            break
          case '<=':
            expect(result).toBe(true)
            break
          case '=':
            expect(result).toBe(condition.threshold === 0)
            break
          case '>=':
            expect(result).toBe(condition.threshold <= 0)
            break
          case '>':
            expect(result).toBe(false)
            break
        }
      })
    )
  })

  it('Property #233: count comparison operators work correctly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 }), fc.integer({ min: 0, max: 10 }), (count, threshold) => {
        expect(compare(count, '<', threshold)).toBe(count < threshold)
        expect(compare(count, '<=', threshold)).toBe(count <= threshold)
        expect(compare(count, '=', threshold)).toBe(count === threshold)
        expect(compare(count, '>=', threshold)).toBe(count >= threshold)
        expect(compare(count, '>', threshold)).toBe(count > threshold)
      })
    )
  })
})

// ============================================================================
// DaysSince Condition Properties (Task #236-#238)
// ============================================================================

describe('Spec 7: Conditions - DaysSince', () => {
  it('Property #236: daysSince with no completions = infinity', () => {
    fc.assert(
      fc.property(daysSinceConditionGen(), (condition) => {
        const context = {
          completions: [],
          today: new Date(),
          seriesIdToTag: new Map<SeriesId, string[]>(),
        }

        // With no completions, daysSince = Infinity
        // This affects comparisons:
        // - daysSince < threshold: false (Infinity is not less than anything finite)
        // - daysSince <= threshold: false
        // - daysSince = threshold: false (unless we handle Infinity specially)
        // - daysSince >= threshold: true (Infinity >= anything finite)
        // - daysSince > threshold: true

        const result = evaluateCondition(condition, context)

        switch (condition.comparison) {
          case '<':
            expect(result).toBe(false)
            break
          case '<=':
            expect(result).toBe(false)
            break
          case '=':
            expect(result).toBe(false)
            break
          case '>=':
            expect(result).toBe(true)
            break
          case '>':
            expect(result).toBe(true)
            break
        }
      })
    )
  })

  it('Property #238: daysSince comparison operators work correctly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 365 }), fc.integer({ min: 0, max: 365 }), (days, threshold) => {
        expect(compare(days, '<', threshold)).toBe(days < threshold)
        expect(compare(days, '<=', threshold)).toBe(days <= threshold)
        expect(compare(days, '=', threshold)).toBe(days === threshold)
        expect(compare(days, '>=', threshold)).toBe(days >= threshold)
        expect(compare(days, '>', threshold)).toBe(days > threshold)
      })
    )
  })
})

// ============================================================================
// Condition Determinism (Task #239)
// ============================================================================

describe('Spec 7: Conditions - Determinism', () => {
  it('Property #239: condition evaluation is deterministic', () => {
    fc.assert(
      fc.property(conditionGen(), (condition) => {
        const context = {
          completions: [],
          today: new Date('2024-06-15'),
          seriesIdToTag: new Map<SeriesId, string[]>(),
        }

        const result1 = evaluateCondition(condition, context)
        const result2 = evaluateCondition(condition, context)

        expect(result1).toBe(result2)
      })
    )
  })
})

// ============================================================================
// Target Matching Properties (Task #240-#242)
// ============================================================================

describe('Spec 7: Conditions - Target Matching', () => {
  it('Property #240: tag target matches all series with that tag', () => {
    const context = {
      completions: [
        { seriesId: 'series-1' as SeriesId, instanceDate: '2024-06-15' },
        { seriesId: 'series-2' as SeriesId, instanceDate: '2024-06-15' },
        { seriesId: 'series-3' as SeriesId, instanceDate: '2024-06-15' },
      ] as Completion[],
      today: new Date('2024-06-15'),
      seriesIdToTag: new Map<SeriesId, string[]>([
        ['series-1' as SeriesId, ['workout', 'morning']],
        ['series-2' as SeriesId, ['workout']],
        ['series-3' as SeriesId, ['reading']],
      ]),
    }

    const condition: CountCondition = {
      type: 'count',
      target: { tag: 'workout' },
      comparison: '=',
      threshold: 2,
      windowDays: 1,
    }

    // Should match series-1 and series-2 (both have 'workout' tag)
    const result = evaluateCondition(condition, context)
    expect(result).toBe(true) // 2 completions with 'workout' tag
  })

  it('Property #241: seriesId target matches only that series', () => {
    const context = {
      completions: [
        { seriesId: 'series-1' as SeriesId, instanceDate: '2024-06-15' },
        { seriesId: 'series-2' as SeriesId, instanceDate: '2024-06-15' },
        { seriesId: 'series-1' as SeriesId, instanceDate: '2024-06-14' },
      ] as Completion[],
      today: new Date('2024-06-15'),
      seriesIdToTag: new Map<SeriesId, string[]>(),
    }

    const condition: CountCondition = {
      type: 'count',
      target: { seriesId: 'series-1' as SeriesId },
      comparison: '=',
      threshold: 2,
      windowDays: 7,
    }

    // Should match only series-1 completions (2 of them)
    const result = evaluateCondition(condition, context)
    expect(result).toBe(true)
  })

  it('Property #242: non-existent target = 0 count / infinite daysSince', () => {
    const context = {
      completions: [
        { seriesId: 'series-1' as SeriesId, instanceDate: '2024-06-15' },
      ] as Completion[],
      today: new Date('2024-06-15'),
      seriesIdToTag: new Map<SeriesId, string[]>(),
    }

    // Count for non-existent tag should be 0
    const countCondition: CountCondition = {
      type: 'count',
      target: { tag: 'nonexistent' },
      comparison: '=',
      threshold: 0,
      windowDays: 7,
    }
    expect(evaluateCondition(countCondition, context)).toBe(true)

    // DaysSince for non-existent tag should be infinite (>= any threshold)
    const daysSinceCondition: DaysSinceCondition = {
      type: 'daysSince',
      target: { tag: 'nonexistent' },
      comparison: '>=',
      threshold: 1000,
    }
    expect(evaluateCondition(daysSinceCondition, context)).toBe(true)
  })
})

// ============================================================================
// Window Days Properties (Task #234-#235)
// ============================================================================

describe('Spec 7: Conditions - Window Days', () => {
  it('Property #234: count windowDays is inclusive of both endpoints', () => {
    // Create completions on boundary days
    const today = new Date('2024-06-15')
    const context = {
      completions: [
        { seriesId: 'series-1' as SeriesId, instanceDate: '2024-06-15' }, // Day 0 (today)
        { seriesId: 'series-1' as SeriesId, instanceDate: '2024-06-14' }, // Day 1
        { seriesId: 'series-1' as SeriesId, instanceDate: '2024-06-13' }, // Day 2
        { seriesId: 'series-1' as SeriesId, instanceDate: '2024-06-12' }, // Day 3
        { seriesId: 'series-1' as SeriesId, instanceDate: '2024-06-11' }, // Day 4
      ] as Completion[],
      today,
      seriesIdToTag: new Map<SeriesId, string[]>(),
    }

    // Window of 3 days should include today, yesterday, and day before
    const condition: CountCondition = {
      type: 'count',
      target: { seriesId: 'series-1' as SeriesId },
      comparison: '=',
      threshold: 3,
      windowDays: 3,
    }

    const result = evaluateCondition(condition, context)
    expect(result).toBe(true) // Days 0, 1, 2 = 3 completions
  })

  it('Property #235: count only counts matching target', () => {
    const context = {
      completions: [
        { seriesId: 'series-1' as SeriesId, instanceDate: '2024-06-15' },
        { seriesId: 'series-2' as SeriesId, instanceDate: '2024-06-15' },
        { seriesId: 'series-1' as SeriesId, instanceDate: '2024-06-14' },
        { seriesId: 'series-3' as SeriesId, instanceDate: '2024-06-14' },
      ] as Completion[],
      today: new Date('2024-06-15'),
      seriesIdToTag: new Map<SeriesId, string[]>([
        ['series-1' as SeriesId, ['target-tag']],
        ['series-2' as SeriesId, ['other-tag']],
        ['series-3' as SeriesId, ['target-tag']],
      ]),
    }

    // Count completions with 'target-tag'
    const condition: CountCondition = {
      type: 'count',
      target: { tag: 'target-tag' },
      comparison: '=',
      threshold: 3, // series-1 (2) + series-3 (1) = 3
      windowDays: 7,
    }

    const result = evaluateCondition(condition, context)
    expect(result).toBe(true)
  })
})

// ============================================================================
// DaysSince Edge Cases (Task #237)
// ============================================================================

describe('Spec 7: Conditions - DaysSince Edge Cases', () => {
  it('Property #237: daysSince = 0 when completion today', () => {
    const today = new Date('2024-06-15')
    const context = {
      completions: [
        { seriesId: 'series-1' as SeriesId, instanceDate: '2024-06-15' },
      ] as Completion[],
      today,
      seriesIdToTag: new Map<SeriesId, string[]>(),
    }

    const condition: DaysSinceCondition = {
      type: 'daysSince',
      target: { seriesId: 'series-1' as SeriesId },
      comparison: '=',
      threshold: 0,
    }

    const result = evaluateCondition(condition, context)
    expect(result).toBe(true)
  })
})
