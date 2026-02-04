/**
 * Segment 03: Condition Evaluation Tests
 *
 * Tests condition evaluation - takes a condition definition and completion history,
 * returning a boolean indicating whether the condition is satisfied.
 * Conditions gate pattern activation for state-based scheduling.
 */

import { describe, it, expect } from 'vitest'
import {
  // Condition constructors
  countCondition,
  daysSinceCondition,
  andCondition,
  orCondition,
  notCondition,
  // Core evaluation function
  evaluateCondition,
  // Target constructors
  byTag,
  bySeriesId,
  // Errors
  InvalidConditionError,
  // Types
  type Condition,
  type CompletionStore,
  type Completion,
  type LocalDate,
} from '../src/condition-evaluation'

import { addDays } from '../src/time-date'

// Helper to create a mock completion store
function createStore(completions: Completion[] = []): CompletionStore {
  return {
    completions,
    getCompletionsInWindow: (target, windowStart, windowEnd) => {
      return completions.filter((c) => {
        const matchesTarget =
          target.type === 'tag'
            ? c.tags?.includes(target.tag) ?? false
            : c.seriesId === target.seriesId
        const inWindow = c.date >= windowStart && c.date <= windowEnd
        return matchesTarget && inWindow
      })
    },
    getLastCompletion: (target) => {
      const matching = completions.filter((c) =>
        target.type === 'tag'
          ? c.tags?.includes(target.tag) ?? false
          : c.seriesId === target.seriesId
      )
      if (matching.length === 0) return null
      return matching.reduce((latest, c) => (c.date > latest.date ? c : latest))
    },
  }
}

// ============================================================================
// 1. COUNT CONDITION
// ============================================================================

describe('Count Condition', () => {
  describe('Greater Than or Equal (>=)', () => {
    it('count >= 0 with 0 completions', () => {
      const condition = countCondition(byTag('walk'), '>=', 0, 14)
      const store = createStore([])
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })

    it('count >= 1 with 0 completions', () => {
      const condition = countCondition(byTag('walk'), '>=', 1, 14)
      const store = createStore([])
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(false)
    })

    it('count >= 1 with 1 completion', () => {
      const condition = countCondition(byTag('walk'), '>=', 1, 14)
      const store = createStore([
        { seriesId: 'a', date: '2024-01-10' as LocalDate, tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })

    it('count >= 5 with 7 completions', () => {
      const condition = countCondition(byTag('walk'), '>=', 5, 14)
      const completions = Array.from({ length: 7 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })

    it('count >= 7 with 7 completions', () => {
      const condition = countCondition(byTag('walk'), '>=', 7, 14)
      const completions = Array.from({ length: 7 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })
  })

  describe('Greater Than (>)', () => {
    it('count > 0 with 0 completions', () => {
      const condition = countCondition(byTag('walk'), '>', 0, 14)
      const store = createStore([])
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(false)
    })

    it('count > 0 with 1 completion', () => {
      const condition = countCondition(byTag('walk'), '>', 0, 14)
      const store = createStore([
        { seriesId: 'a', date: '2024-01-10' as LocalDate, tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })

    it('count > 5 with 5 completions', () => {
      const condition = countCondition(byTag('walk'), '>', 5, 14)
      const completions = Array.from({ length: 5 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(false)
    })

    it('count > 5 with 6 completions', () => {
      const condition = countCondition(byTag('walk'), '>', 5, 14)
      const completions = Array.from({ length: 6 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })
  })

  describe('Less Than or Equal (<=)', () => {
    it('count <= 5 with 3 completions', () => {
      const condition = countCondition(byTag('walk'), '<=', 5, 14)
      const completions = Array.from({ length: 3 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })

    it('count <= 5 with 5 completions', () => {
      const condition = countCondition(byTag('walk'), '<=', 5, 14)
      const completions = Array.from({ length: 5 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })

    it('count <= 5 with 6 completions', () => {
      const condition = countCondition(byTag('walk'), '<=', 5, 14)
      const completions = Array.from({ length: 6 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(false)
    })
  })

  describe('Less Than (<)', () => {
    it('count < 7 with 5 completions', () => {
      const condition = countCondition(byTag('walk'), '<', 7, 14)
      const completions = Array.from({ length: 5 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })

    it('count < 7 with 7 completions', () => {
      const condition = countCondition(byTag('walk'), '<', 7, 14)
      const completions = Array.from({ length: 7 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(false)
    })

    it('count < 7 with 8 completions', () => {
      const condition = countCondition(byTag('walk'), '<', 7, 14)
      const completions = Array.from({ length: 8 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(false)
    })
  })

  describe('Equal (==)', () => {
    it('count == 5 with 5 completions', () => {
      const condition = countCondition(byTag('walk'), '==', 5, 14)
      const completions = Array.from({ length: 5 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })

    it('count == 5 with 4 completions', () => {
      const condition = countCondition(byTag('walk'), '==', 5, 14)
      const completions = Array.from({ length: 4 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(false)
    })

    it('count == 5 with 6 completions', () => {
      const condition = countCondition(byTag('walk'), '==', 5, 14)
      const completions = Array.from({ length: 6 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(false)
    })
  })

  describe('Not Equal (!=)', () => {
    it('count != 5 with 4 completions', () => {
      const condition = countCondition(byTag('walk'), '!=', 5, 14)
      const completions = Array.from({ length: 4 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })

    it('count != 5 with 5 completions', () => {
      const condition = countCondition(byTag('walk'), '!=', 5, 14)
      const completions = Array.from({ length: 5 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(false)
    })

    it('count != 5 with 6 completions', () => {
      const condition = countCondition(byTag('walk'), '!=', 5, 14)
      const completions = Array.from({ length: 6 }, (_, i) => ({
        seriesId: 'a',
        date: addDays('2024-01-15' as LocalDate, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })
  })

  describe('Operator Complement Tests', () => {
    it('>= complement of <', () => {
      const asOf = '2024-01-15' as LocalDate
      const completions = Array.from({ length: 5 }, (_, i) => ({
        seriesId: 'a',
        date: addDays(asOf, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)

      const geCondition = countCondition(byTag('walk'), '>=', 5, 14)
      const ltCondition = countCondition(byTag('walk'), '<', 5, 14)

      const geResult = evaluateCondition(geCondition, store, asOf)
      const ltResult = evaluateCondition(ltCondition, store, asOf)

      expect(geResult).toBe(!ltResult)
    })

    it('> complement of <=', () => {
      const asOf = '2024-01-15' as LocalDate
      const completions = Array.from({ length: 5 }, (_, i) => ({
        seriesId: 'a',
        date: addDays(asOf, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)

      const gtCondition = countCondition(byTag('walk'), '>', 5, 14)
      const leCondition = countCondition(byTag('walk'), '<=', 5, 14)

      const gtResult = evaluateCondition(gtCondition, store, asOf)
      const leResult = evaluateCondition(leCondition, store, asOf)

      expect(gtResult).toBe(!leResult)
    })

    it('== complement of !=', () => {
      const asOf = '2024-01-15' as LocalDate
      const completions = Array.from({ length: 5 }, (_, i) => ({
        seriesId: 'a',
        date: addDays(asOf, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)

      const eqCondition = countCondition(byTag('walk'), '==', 5, 14)
      const neCondition = countCondition(byTag('walk'), '!=', 5, 14)

      const eqResult = evaluateCondition(eqCondition, store, asOf)
      const neResult = evaluateCondition(neCondition, store, asOf)

      expect(eqResult).toBe(!neResult)
    })

    it('>= splits to > or ==', () => {
      const asOf = '2024-01-15' as LocalDate
      const completions = Array.from({ length: 5 }, (_, i) => ({
        seriesId: 'a',
        date: addDays(asOf, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)

      const geCondition = countCondition(byTag('walk'), '>=', 5, 14)
      const gtCondition = countCondition(byTag('walk'), '>', 5, 14)
      const eqCondition = countCondition(byTag('walk'), '==', 5, 14)

      const geResult = evaluateCondition(geCondition, store, asOf)
      const gtResult = evaluateCondition(gtCondition, store, asOf)
      const eqResult = evaluateCondition(eqCondition, store, asOf)

      expect(geResult).toBe(gtResult || eqResult)
    })
  })

  describe('Window Tests', () => {
    it('completion on first day of window is counted', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = countCondition(byTag('walk'), '>=', 1, 14)
      const store = createStore([
        { seriesId: 'a', date: addDays(asOf, -13), tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('completion on last day of window is counted', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = countCondition(byTag('walk'), '>=', 1, 14)
      const store = createStore([
        { seriesId: 'a', date: asOf, tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('completion one day before window is not counted', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = countCondition(byTag('walk'), '>=', 1, 14)
      const store = createStore([
        { seriesId: 'a', date: addDays(asOf, -14), tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(false)
    })

    it('completion after asOf (future) is not counted', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = countCondition(byTag('walk'), '>=', 1, 14)
      const store = createStore([
        { seriesId: 'a', date: addDays(asOf, 1), tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(false)
    })

    it('window includes today', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = countCondition(byTag('walk'), '>=', 1, 1)
      const store = createStore([
        { seriesId: 'a', date: asOf, tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('14-day window covers correct range', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = countCondition(byTag('walk'), '>=', 2, 14)
      const store = createStore([
        { seriesId: 'a', date: '2024-01-02' as LocalDate, tags: ['walk'] },
        { seriesId: 'a', date: '2024-01-15' as LocalDate, tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })
  })

  describe('Zero Completions Tests', () => {
    it('zero completions >= 0', () => {
      const condition = countCondition(byTag('walk'), '>=', 0, 14)
      const store = createStore([])
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })

    it('zero completions > 0', () => {
      const condition = countCondition(byTag('walk'), '>', 0, 14)
      const store = createStore([])
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(false)
    })

    it('zero completions == 0', () => {
      const condition = countCondition(byTag('walk'), '==', 0, 14)
      const store = createStore([])
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })
  })
})

// ============================================================================
// 2. DAYS SINCE CONDITION
// ============================================================================

describe('Days Since Condition', () => {
  describe('Basic Days Since Tests', () => {
    it('completion today (daysSince=0) >= 0', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = daysSinceCondition(byTag('walk'), '>=', 0)
      const store = createStore([
        { seriesId: 'a', date: asOf, tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('completion yesterday (daysSince=1) >= 1', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = daysSinceCondition(byTag('walk'), '>=', 1)
      const store = createStore([
        { seriesId: 'a', date: addDays(asOf, -1), tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('completion yesterday >= 0', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = daysSinceCondition(byTag('walk'), '>=', 0)
      const store = createStore([
        { seriesId: 'a', date: addDays(asOf, -1), tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('daysSince == 0 with completion today', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = daysSinceCondition(byTag('walk'), '==', 0)
      const store = createStore([
        { seriesId: 'a', date: asOf, tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('daysSince > 7 with 10 days', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = daysSinceCondition(byTag('walk'), '>', 7)
      const store = createStore([
        { seriesId: 'a', date: addDays(asOf, -10), tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('daysSince < 7 with 3 days', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = daysSinceCondition(byTag('walk'), '<', 7)
      const store = createStore([
        { seriesId: 'a', date: addDays(asOf, -3), tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })
  })

  describe('Null Handling (Never Completed)', () => {
    it('never completed, > any value returns true', () => {
      const condition = daysSinceCondition(byTag('walk'), '>', 7)
      const store = createStore([])
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })

    it('never completed, >= any value returns true', () => {
      const condition = daysSinceCondition(byTag('walk'), '>=', 7)
      const store = createStore([])
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })

    it('never completed, != any value returns true', () => {
      const condition = daysSinceCondition(byTag('walk'), '!=', 7)
      const store = createStore([])
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(true)
    })

    it('never completed, < any value returns false', () => {
      const condition = daysSinceCondition(byTag('walk'), '<', 7)
      const store = createStore([])
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(false)
    })

    it('never completed, <= any value returns false', () => {
      const condition = daysSinceCondition(byTag('walk'), '<=', 7)
      const store = createStore([])
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(false)
    })

    it('never completed, == any value returns false', () => {
      const condition = daysSinceCondition(byTag('walk'), '==', 7)
      const store = createStore([])
      expect(evaluateCondition(condition, store, '2024-01-15' as LocalDate)).toBe(false)
    })
  })

  describe('Multiple Completions', () => {
    it('uses most recent completion', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = daysSinceCondition(byTag('walk'), '==', 3)
      const store = createStore([
        { seriesId: 'a', date: addDays(asOf, -5), tags: ['walk'] },
        { seriesId: 'a', date: addDays(asOf, -3), tags: ['walk'] },
        { seriesId: 'a', date: addDays(asOf, -10), tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })
  })
})

// ============================================================================
// 3. AND CONDITION
// ============================================================================

describe('And Condition', () => {
  describe('Unit Tests', () => {
    it('singleton and true', () => {
      const asOf = '2024-01-15' as LocalDate
      const trueCondition = countCondition(byTag('walk'), '>=', 0, 14)
      const condition = andCondition([trueCondition])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('singleton and false', () => {
      const asOf = '2024-01-15' as LocalDate
      const falseCondition = countCondition(byTag('walk'), '>=', 1, 14)
      const condition = andCondition([falseCondition])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(false)
    })

    it('all true', () => {
      const asOf = '2024-01-15' as LocalDate
      const t1 = countCondition(byTag('walk'), '>=', 0, 14)
      const t2 = countCondition(byTag('run'), '>=', 0, 14)
      const t3 = countCondition(byTag('swim'), '>=', 0, 14)
      const condition = andCondition([t1, t2, t3])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('one false', () => {
      const asOf = '2024-01-15' as LocalDate
      const t1 = countCondition(byTag('walk'), '>=', 0, 14)
      const f = countCondition(byTag('run'), '>=', 1, 14)
      const t2 = countCondition(byTag('swim'), '>=', 0, 14)
      const condition = andCondition([t1, f, t2])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(false)
    })

    it('all false', () => {
      const asOf = '2024-01-15' as LocalDate
      const f1 = countCondition(byTag('walk'), '>=', 1, 14)
      const f2 = countCondition(byTag('run'), '>=', 1, 14)
      const condition = andCondition([f1, f2])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(false)
    })

    it('and with identity true', () => {
      const asOf = '2024-01-15' as LocalDate
      const c = countCondition(byTag('walk'), '>=', 1, 14)
      const identity = countCondition(byTag('any'), '>=', 0, 14)
      const store = createStore([
        { seriesId: 'a', date: asOf, tags: ['walk'] },
      ])

      const cResult = evaluateCondition(c, store, asOf)
      const andResult = evaluateCondition(andCondition([c, identity]), store, asOf)
      expect(andResult).toBe(cResult)
    })

    it('and with annihilator false', () => {
      const asOf = '2024-01-15' as LocalDate
      const c = countCondition(byTag('walk'), '>=', 0, 14)
      const annihilator = countCondition(byTag('any'), '>=', 999, 14)
      const condition = andCondition([c, annihilator])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(false)
    })
  })

  describe('Property-Based Tests', () => {
    it('and commutativity', () => {
      const asOf = '2024-01-15' as LocalDate
      const a = countCondition(byTag('walk'), '>=', 1, 14)
      const b = countCondition(byTag('run'), '>=', 0, 14)
      const store = createStore([
        { seriesId: 'a', date: asOf, tags: ['walk'] },
      ])

      const ab = evaluateCondition(andCondition([a, b]), store, asOf)
      const ba = evaluateCondition(andCondition([b, a]), store, asOf)
      expect(ab).toBe(ba)
    })

    it('and associativity', () => {
      const asOf = '2024-01-15' as LocalDate
      const a = countCondition(byTag('walk'), '>=', 0, 14)
      const b = countCondition(byTag('run'), '>=', 0, 14)
      const c = countCondition(byTag('swim'), '>=', 0, 14)
      const store = createStore([])

      const nested = evaluateCondition(andCondition([a, andCondition([b, c])]), store, asOf)
      const flat = evaluateCondition(andCondition([a, b, c]), store, asOf)
      expect(nested).toBe(flat)
    })
  })
})

// ============================================================================
// 4. OR CONDITION
// ============================================================================

describe('Or Condition', () => {
  describe('Unit Tests', () => {
    it('singleton or true', () => {
      const asOf = '2024-01-15' as LocalDate
      const trueCondition = countCondition(byTag('walk'), '>=', 0, 14)
      const condition = orCondition([trueCondition])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('singleton or false', () => {
      const asOf = '2024-01-15' as LocalDate
      const falseCondition = countCondition(byTag('walk'), '>=', 1, 14)
      const condition = orCondition([falseCondition])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(false)
    })

    it('all false', () => {
      const asOf = '2024-01-15' as LocalDate
      const f1 = countCondition(byTag('walk'), '>=', 1, 14)
      const f2 = countCondition(byTag('run'), '>=', 1, 14)
      const f3 = countCondition(byTag('swim'), '>=', 1, 14)
      const condition = orCondition([f1, f2, f3])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(false)
    })

    it('one true', () => {
      const asOf = '2024-01-15' as LocalDate
      const f1 = countCondition(byTag('walk'), '>=', 1, 14)
      const t = countCondition(byTag('run'), '>=', 0, 14)
      const f2 = countCondition(byTag('swim'), '>=', 1, 14)
      const condition = orCondition([f1, t, f2])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('all true', () => {
      const asOf = '2024-01-15' as LocalDate
      const t1 = countCondition(byTag('walk'), '>=', 0, 14)
      const t2 = countCondition(byTag('run'), '>=', 0, 14)
      const condition = orCondition([t1, t2])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('or with identity false', () => {
      const asOf = '2024-01-15' as LocalDate
      const c = countCondition(byTag('walk'), '>=', 1, 14)
      const identity = countCondition(byTag('any'), '>=', 999, 14)
      const store = createStore([
        { seriesId: 'a', date: asOf, tags: ['walk'] },
      ])

      const cResult = evaluateCondition(c, store, asOf)
      const orResult = evaluateCondition(orCondition([c, identity]), store, asOf)
      expect(orResult).toBe(cResult)
    })

    it('or with annihilator true', () => {
      const asOf = '2024-01-15' as LocalDate
      const c = countCondition(byTag('walk'), '>=', 999, 14)
      const annihilator = countCondition(byTag('any'), '>=', 0, 14)
      const condition = orCondition([c, annihilator])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })
  })

  describe('Property-Based Tests', () => {
    it('or commutativity', () => {
      const asOf = '2024-01-15' as LocalDate
      const a = countCondition(byTag('walk'), '>=', 1, 14)
      const b = countCondition(byTag('run'), '>=', 0, 14)
      const store = createStore([])

      const ab = evaluateCondition(orCondition([a, b]), store, asOf)
      const ba = evaluateCondition(orCondition([b, a]), store, asOf)
      expect(ab).toBe(ba)
    })

    it('or associativity', () => {
      const asOf = '2024-01-15' as LocalDate
      const a = countCondition(byTag('walk'), '>=', 1, 14)
      const b = countCondition(byTag('run'), '>=', 1, 14)
      const c = countCondition(byTag('swim'), '>=', 0, 14)
      const store = createStore([])

      const nested = evaluateCondition(orCondition([a, orCondition([b, c])]), store, asOf)
      const flat = evaluateCondition(orCondition([a, b, c]), store, asOf)
      expect(nested).toBe(flat)
    })
  })
})

// ============================================================================
// 5. NOT CONDITION
// ============================================================================

describe('Not Condition', () => {
  describe('Unit Tests', () => {
    it('not true', () => {
      const asOf = '2024-01-15' as LocalDate
      const trueCondition = countCondition(byTag('walk'), '>=', 0, 14)
      const condition = notCondition(trueCondition)
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(false)
    })

    it('not false', () => {
      const asOf = '2024-01-15' as LocalDate
      const falseCondition = countCondition(byTag('walk'), '>=', 1, 14)
      const condition = notCondition(falseCondition)
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('double negation', () => {
      const asOf = '2024-01-15' as LocalDate
      const c = countCondition(byTag('walk'), '>=', 1, 14)
      const doubleNeg = notCondition(notCondition(c))
      const store = createStore([
        { seriesId: 'a', date: asOf, tags: ['walk'] },
      ])

      const cResult = evaluateCondition(c, store, asOf)
      const doubleNegResult = evaluateCondition(doubleNeg, store, asOf)
      expect(doubleNegResult).toBe(cResult)
    })
  })

  describe("De Morgan's Laws", () => {
    it('not(and) = or(not)', () => {
      const asOf = '2024-01-15' as LocalDate
      const a = countCondition(byTag('walk'), '>=', 1, 14)
      const b = countCondition(byTag('run'), '>=', 0, 14)
      const store = createStore([
        { seriesId: 'a', date: asOf, tags: ['walk'] },
      ])

      const notAnd = evaluateCondition(notCondition(andCondition([a, b])), store, asOf)
      const orNot = evaluateCondition(
        orCondition([notCondition(a), notCondition(b)]),
        store,
        asOf
      )
      expect(notAnd).toBe(orNot)
    })

    it('not(or) = and(not)', () => {
      const asOf = '2024-01-15' as LocalDate
      const a = countCondition(byTag('walk'), '>=', 1, 14)
      const b = countCondition(byTag('run'), '>=', 1, 14)
      const store = createStore([])

      const notOr = evaluateCondition(notCondition(orCondition([a, b])), store, asOf)
      const andNot = evaluateCondition(
        andCondition([notCondition(a), notCondition(b)]),
        store,
        asOf
      )
      expect(notOr).toBe(andNot)
    })
  })
})

// ============================================================================
// 6. NESTED CONDITIONS
// ============================================================================

describe('Nested Conditions', () => {
  describe('Unit Tests', () => {
    it('and inside or', () => {
      const asOf = '2024-01-15' as LocalDate
      const t1 = countCondition(byTag('walk'), '>=', 0, 14)
      const t2 = countCondition(byTag('run'), '>=', 0, 14)
      const f1 = countCondition(byTag('swim'), '>=', 1, 14)
      const f2 = countCondition(byTag('bike'), '>=', 1, 14)
      const condition = orCondition([andCondition([t1, t2]), andCondition([f1, f2])])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('or inside and', () => {
      const asOf = '2024-01-15' as LocalDate
      const t = countCondition(byTag('walk'), '>=', 0, 14)
      const f = countCondition(byTag('run'), '>=', 1, 14)
      const condition = andCondition([orCondition([t, f]), orCondition([f, t])])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('not inside and', () => {
      const asOf = '2024-01-15' as LocalDate
      const f = countCondition(byTag('walk'), '>=', 1, 14)
      const t = countCondition(byTag('run'), '>=', 0, 14)
      const condition = andCondition([notCondition(f), t])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('deeply nested and', () => {
      const asOf = '2024-01-15' as LocalDate
      const t = countCondition(byTag('walk'), '>=', 0, 14)
      const condition = andCondition([andCondition([andCondition([t])])])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('deeply nested or', () => {
      const asOf = '2024-01-15' as LocalDate
      const t = countCondition(byTag('walk'), '>=', 0, 14)
      const condition = orCondition([orCondition([orCondition([t])])])
      const store = createStore([])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })
  })

  describe('Property-Based Tests', () => {
    it('deep nesting does not overflow', () => {
      const asOf = '2024-01-15' as LocalDate
      const base = countCondition(byTag('walk'), '>=', 0, 14)

      // Build 100 levels of nesting
      let condition: Condition = base
      for (let i = 0; i < 100; i++) {
        condition = andCondition([condition])
      }

      const store = createStore([])
      // Should complete without stack overflow
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })
  })
})

// ============================================================================
// 7. TARGET RESOLUTION
// ============================================================================

describe('Target Resolution', () => {
  describe('By Tag', () => {
    it('tag matches single series', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = countCondition(byTag('walk'), '>=', 1, 14)
      const store = createStore([
        { seriesId: 'a', date: asOf, tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('tag matches multiple series', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = countCondition(byTag('walk'), '>=', 2, 14)
      const store = createStore([
        { seriesId: 'a', date: asOf, tags: ['walk'] },
        { seriesId: 'b', date: asOf, tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('completion counted once even with multiple tags', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = countCondition(byTag('walk'), '>=', 1, 14)
      const store = createStore([
        { seriesId: 'a', date: asOf, tags: ['walk', 'exercise'] },
      ])
      // Should count as 1, not 2
      const condition2 = countCondition(byTag('walk'), '==', 1, 14)
      expect(evaluateCondition(condition2, store, asOf)).toBe(true)
    })

    it('tag matching is case-sensitive', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = countCondition(byTag('walk'), '>=', 1, 14)
      const store = createStore([
        { seriesId: 'a', date: asOf, tags: ['Walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(false)
    })

    it('unknown tag returns count 0', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = countCondition(byTag('nonexistent'), '==', 0, 14)
      const store = createStore([
        { seriesId: 'a', date: asOf, tags: ['walk'] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })
  })

  describe('By Series ID', () => {
    it('exact series match', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = countCondition(bySeriesId('series-a'), '>=', 1, 14)
      const store = createStore([
        { seriesId: 'series-a', date: asOf, tags: [] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('different series not matched', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = countCondition(bySeriesId('series-a'), '>=', 1, 14)
      const store = createStore([
        { seriesId: 'series-b', date: asOf, tags: [] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(false)
    })

    it('unknown series ID returns count 0', () => {
      const asOf = '2024-01-15' as LocalDate
      const condition = countCondition(bySeriesId('nonexistent-uuid'), '==', 0, 14)
      const store = createStore([
        { seriesId: 'series-a', date: asOf, tags: [] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })

    it('series ID is opaque string', () => {
      const asOf = '2024-01-15' as LocalDate
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      const condition = countCondition(bySeriesId(uuid), '>=', 1, 14)
      const store = createStore([
        { seriesId: uuid, date: asOf, tags: [] },
      ])
      expect(evaluateCondition(condition, store, asOf)).toBe(true)
    })
  })
})

// ============================================================================
// 8. BOOLEAN ALGEBRA PROPERTIES
// ============================================================================

describe('Boolean Algebra Properties', () => {
  it('evaluation is total - always returns boolean', () => {
    const asOf = '2024-01-15' as LocalDate
    const conditions = [
      countCondition(byTag('walk'), '>=', 1, 14),
      daysSinceCondition(byTag('walk'), '>', 7),
      andCondition([countCondition(byTag('walk'), '>=', 0, 14)]),
      orCondition([countCondition(byTag('walk'), '>=', 1, 14)]),
      notCondition(countCondition(byTag('walk'), '>=', 1, 14)),
    ]
    const store = createStore([])

    for (const c of conditions) {
      const result = evaluateCondition(c, store, asOf)
      expect(typeof result).toBe('boolean')
    }
  })

  it('determinism - same inputs produce same result', () => {
    const asOf = '2024-01-15' as LocalDate
    const condition = andCondition([
      countCondition(byTag('walk'), '>=', 1, 14),
      daysSinceCondition(byTag('run'), '<', 7),
    ])
    const store = createStore([
      { seriesId: 'a', date: asOf, tags: ['walk'] },
      { seriesId: 'b', date: addDays(asOf, -3), tags: ['run'] },
    ])

    const result1 = evaluateCondition(condition, store, asOf)
    const result2 = evaluateCondition(condition, store, asOf)
    const result3 = evaluateCondition(condition, store, asOf)

    expect(result1).toBe(result2)
    expect(result2).toBe(result3)
  })

  it('pure evaluation - no side effects', () => {
    const asOf = '2024-01-15' as LocalDate
    const condition = countCondition(byTag('walk'), '>=', 1, 14)
    const completions = [{ seriesId: 'a', date: asOf, tags: ['walk'] }]
    const store = createStore(completions)

    const storeBefore = JSON.stringify(store.completions)
    evaluateCondition(condition, store, asOf)
    const storeAfter = JSON.stringify(store.completions)

    expect(storeAfter).toBe(storeBefore)
  })

  it('condition is immutable after evaluation', () => {
    const asOf = '2024-01-15' as LocalDate
    const condition = countCondition(byTag('walk'), '>=', 1, 14)
    const conditionBefore = JSON.stringify(condition)
    const store = createStore([])

    evaluateCondition(condition, store, asOf)
    const conditionAfter = JSON.stringify(condition)

    expect(conditionAfter).toBe(conditionBefore)
  })
})

// ============================================================================
// 9. STORE SENSITIVITY
// ============================================================================

describe('Store Sensitivity', () => {
  it('adding completion changes result', () => {
    const asOf = '2024-01-15' as LocalDate
    const condition = countCondition(byTag('walk'), '>=', 1, 14)

    const emptyStore = createStore([])
    expect(evaluateCondition(condition, emptyStore, asOf)).toBe(false)

    const storeWithCompletion = createStore([
      { seriesId: 'a', date: asOf, tags: ['walk'] },
    ])
    expect(evaluateCondition(condition, storeWithCompletion, asOf)).toBe(true)
  })

  it('removing completion changes result', () => {
    const asOf = '2024-01-15' as LocalDate
    const condition = countCondition(byTag('walk'), '>=', 1, 14)

    const storeWithCompletion = createStore([
      { seriesId: 'a', date: asOf, tags: ['walk'] },
    ])
    expect(evaluateCondition(condition, storeWithCompletion, asOf)).toBe(true)

    const emptyStore = createStore([])
    expect(evaluateCondition(condition, emptyStore, asOf)).toBe(false)
  })

  it('completion outside window does not change result', () => {
    const asOf = '2024-01-15' as LocalDate
    const condition = countCondition(byTag('walk'), '>=', 1, 7)

    const emptyStore = createStore([])
    expect(evaluateCondition(condition, emptyStore, asOf)).toBe(false)

    const storeWithOldCompletion = createStore([
      { seriesId: 'a', date: addDays(asOf, -10), tags: ['walk'] },
    ])
    expect(evaluateCondition(condition, storeWithOldCompletion, asOf)).toBe(false)
  })
})

// ============================================================================
// 10. INVARIANTS
// ============================================================================

describe('Invariants', () => {
  it('INV 1: Evaluation always terminates', () => {
    const asOf = '2024-01-15' as LocalDate
    const base = countCondition(byTag('walk'), '>=', 0, 14)
    let condition: Condition = base
    for (let i = 0; i < 50; i++) {
      condition = andCondition([condition, notCondition(notCondition(base))])
    }
    const store = createStore([])
    // Should complete without hanging
    const result = evaluateCondition(condition, store, asOf)
    expect(typeof result).toBe('boolean')
  })

  it('INV 2: Evaluation is deterministic', () => {
    const asOf = '2024-01-15' as LocalDate
    const condition = orCondition([
      andCondition([
        countCondition(byTag('walk'), '>=', 1, 14),
        daysSinceCondition(byTag('run'), '<', 7),
      ]),
      notCondition(countCondition(byTag('swim'), '>=', 5, 14)),
    ])
    const store = createStore([
      { seriesId: 'a', date: asOf, tags: ['walk'] },
    ])

    const results = Array.from({ length: 10 }, () =>
      evaluateCondition(condition, store, asOf)
    )
    expect(results.every((r) => r === results[0])).toBe(true)
  })

  it('INV 5: Result is boolean', () => {
    const asOf = '2024-01-15' as LocalDate
    const condition = countCondition(byTag('walk'), '>=', 1, 14)
    const store = createStore([])
    const result = evaluateCondition(condition, store, asOf)
    expect(result === true || result === false).toBe(true)
  })
})

// ============================================================================
// 11. ERROR HANDLING
// ============================================================================

describe('Error Handling', () => {
  it('empty and conditions throws InvalidConditionError', () => {
    expect(() => andCondition([])).toThrow(InvalidConditionError)
  })

  it('empty or conditions throws InvalidConditionError', () => {
    expect(() => orCondition([])).toThrow(InvalidConditionError)
  })

  it('negative windowDays throws InvalidConditionError', () => {
    expect(() => countCondition(byTag('walk'), '>=', 1, -1)).toThrow(InvalidConditionError)
  })

  it('negative value throws InvalidConditionError', () => {
    expect(() => countCondition(byTag('walk'), '>=', -1, 14)).toThrow(InvalidConditionError)
  })
})

// ============================================================================
// 12. REAL-WORLD SCENARIO TESTS
// ============================================================================

describe('Real-World Scenarios', () => {
  describe('Deconditioned State', () => {
    // < 7 walks in 14 days
    const deconditionedCondition = countCondition(byTag('walk'), '<', 7, 14)

    it('0 walks is deconditioned', () => {
      const asOf = '2024-01-15' as LocalDate
      const store = createStore([])
      expect(evaluateCondition(deconditionedCondition, store, asOf)).toBe(true)
    })

    it('6 walks is deconditioned', () => {
      const asOf = '2024-01-15' as LocalDate
      const completions = Array.from({ length: 6 }, (_, i) => ({
        seriesId: 'a',
        date: addDays(asOf, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(deconditionedCondition, store, asOf)).toBe(true)
    })

    it('7 walks is not deconditioned', () => {
      const asOf = '2024-01-15' as LocalDate
      const completions = Array.from({ length: 7 }, (_, i) => ({
        seriesId: 'a',
        date: addDays(asOf, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(deconditionedCondition, store, asOf)).toBe(false)
    })
  })

  describe('Conditioning State', () => {
    // 7+ walks AND < 4 weight sessions
    const conditioningCondition = andCondition([
      countCondition(byTag('walk'), '>=', 7, 14),
      countCondition(byTag('weights'), '<', 4, 14),
    ])

    it('6 walks, 0 weights - false (not enough walks)', () => {
      const asOf = '2024-01-15' as LocalDate
      const completions = Array.from({ length: 6 }, (_, i) => ({
        seriesId: 'a',
        date: addDays(asOf, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(conditioningCondition, store, asOf)).toBe(false)
    })

    it('7 walks, 0 weights - true', () => {
      const asOf = '2024-01-15' as LocalDate
      const completions = Array.from({ length: 7 }, (_, i) => ({
        seriesId: 'a',
        date: addDays(asOf, -i),
        tags: ['walk'],
      }))
      const store = createStore(completions)
      expect(evaluateCondition(conditioningCondition, store, asOf)).toBe(true)
    })

    it('7 walks, 3 weights - true', () => {
      const asOf = '2024-01-15' as LocalDate
      const walks = Array.from({ length: 7 }, (_, i) => ({
        seriesId: 'a',
        date: addDays(asOf, -i),
        tags: ['walk'],
      }))
      const weights = Array.from({ length: 3 }, (_, i) => ({
        seriesId: 'b',
        date: addDays(asOf, -i * 2),
        tags: ['weights'],
      }))
      const store = createStore([...walks, ...weights])
      expect(evaluateCondition(conditioningCondition, store, asOf)).toBe(true)
    })

    it('7 walks, 4 weights - false (too many weights)', () => {
      const asOf = '2024-01-15' as LocalDate
      const walks = Array.from({ length: 7 }, (_, i) => ({
        seriesId: 'a',
        date: addDays(asOf, -i),
        tags: ['walk'],
      }))
      const weights = Array.from({ length: 4 }, (_, i) => ({
        seriesId: 'b',
        date: addDays(asOf, -i * 2),
        tags: ['weights'],
      }))
      const store = createStore([...walks, ...weights])
      expect(evaluateCondition(conditioningCondition, store, asOf)).toBe(false)
    })
  })

  describe('Regression Check', () => {
    // No workout in 7+ days
    const regressionCondition = daysSinceCondition(byTag('workout'), '>=', 7)

    it('worked out 3 days ago - not regressed', () => {
      const asOf = '2024-01-15' as LocalDate
      const store = createStore([
        { seriesId: 'a', date: addDays(asOf, -3), tags: ['workout'] },
      ])
      expect(evaluateCondition(regressionCondition, store, asOf)).toBe(false)
    })

    it('worked out 7 days ago - regressed', () => {
      const asOf = '2024-01-15' as LocalDate
      const store = createStore([
        { seriesId: 'a', date: addDays(asOf, -7), tags: ['workout'] },
      ])
      expect(evaluateCondition(regressionCondition, store, asOf)).toBe(true)
    })

    it('never worked out - regressed', () => {
      const asOf = '2024-01-15' as LocalDate
      const store = createStore([])
      expect(evaluateCondition(regressionCondition, store, asOf)).toBe(true)
    })
  })
})
