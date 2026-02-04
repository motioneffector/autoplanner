/**
 * Tests for the test harness utilities.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  testProp,
  checkProp,
  sample,
  generate,
  assertDeepEquals,
  assertThrows,
  assertInRange,
  getNumRuns,
} from './harness'

describe('test harness', () => {
  describe('testProp', () => {
    it('runs property tests with expect assertions', () => {
      testProp(
        'addition is commutative',
        [fc.integer(), fc.integer()],
        (a, b) => {
          expect(a + b).toBe(b + a)
        },
        { numRuns: 50 }
      )
    })

    it('handles single arbitrary', () => {
      testProp(
        'strings have non-negative length',
        [fc.string()],
        (s) => {
          expect(s.length).toBeGreaterThanOrEqual(0)
        },
        { numRuns: 50 }
      )
    })

    it('handles multiple arbitraries', () => {
      testProp(
        'array length matches',
        [fc.array(fc.integer()), fc.nat({ max: 10 })],
        (arr, _n) => {
          expect(arr).toEqual(expect.any(Array))
        },
        { numRuns: 50 }
      )
    })
  })

  describe('checkProp', () => {
    it('runs property tests with boolean predicates', () => {
      expect(() =>
        checkProp(
          [fc.integer(), fc.integer()],
          (a, b) => a + b === b + a,
          { numRuns: 50 }
        )
      ).not.toThrow()
    })
  })

  describe('sample', () => {
    it('generates the requested number of values', () => {
      const values = sample(fc.integer(), 5)
      expect(values).toHaveLength(5)
      values.forEach((v) => expect(v).toEqual(expect.any(Number)))
    })

    it('defaults to 10 values', () => {
      const values = sample(fc.string())
      expect(values).toHaveLength(10)
    })
  })

  describe('generate', () => {
    it('generates a single value', () => {
      const value = generate(fc.integer())
      expect(value).toEqual(expect.any(Number))
    })
  })

  describe('assertDeepEquals', () => {
    it('passes for equal primitives', () => {
      expect(() => assertDeepEquals(5, 5)).not.toThrow()
      expect(() => assertDeepEquals('hello', 'hello')).not.toThrow()
      expect(() => assertDeepEquals(true, true)).not.toThrow()
    })

    it('passes for equal objects', () => {
      expect(() => assertDeepEquals({ a: 1, b: 2 }, { a: 1, b: 2 })).not.toThrow()
    })

    it('passes for equal arrays', () => {
      expect(() => assertDeepEquals([1, 2, 3], [1, 2, 3])).not.toThrow()
    })

    it('throws for unequal values', () => {
      expect(() => assertDeepEquals(5, 6)).toThrow(Error)
      expect(() => assertDeepEquals({ a: 1 }, { a: 2 })).toThrow(Error)
    })
  })

  describe('assertThrows', () => {
    it('passes when function throws', () => {
      assertThrows(() => {
        throw new Error('test')
      })
    })

    it('fails when function does not throw', () => {
      expect(() => assertThrows(() => {})).toThrow(Error)
    })

    it('checks error type when specified', () => {
      assertThrows(
        () => {
          throw new TypeError('test')
        },
        TypeError
      )

      expect(() =>
        assertThrows(
          () => {
            throw new Error('test')
          },
          TypeError
        )
      ).toThrow(Error)
    })
  })

  describe('assertInRange', () => {
    it('passes for values in range', () => {
      expect(() => assertInRange(5, 0, 10)).not.toThrow()
      expect(() => assertInRange(0, 0, 10)).not.toThrow()
      expect(() => assertInRange(10, 0, 10)).not.toThrow()
    })

    it('fails for values outside range', () => {
      expect(() => assertInRange(-1, 0, 10)).toThrow(Error)
      expect(() => assertInRange(11, 0, 10)).toThrow(Error)
    })
  })

  describe('getNumRuns', () => {
    it('returns a positive number', () => {
      const runs = getNumRuns()
      expect(runs).toEqual(expect.any(Number))
      expect(runs).toBeGreaterThan(0)
    })
  })
})
