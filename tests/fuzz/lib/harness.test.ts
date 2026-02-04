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
          expect(s.length >= 0).toBe(true)
        },
        { numRuns: 50 }
      )
    })

    it('handles multiple arbitraries', () => {
      testProp(
        'array length matches',
        [fc.array(fc.integer()), fc.nat({ max: 10 })],
        (arr, _n) => {
          // Verify arr is an array of integers by checking length and every element
          expect(arr.length).toBeGreaterThanOrEqual(0);
          arr.forEach((x) => expect(Number.isInteger(x)).toBe(true));
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
      expect(values).toSatisfy((v: number[]) => v.length === 5 && v.every(x => typeof x === 'number'))
    })

    it('defaults to 10 values', () => {
      const values = sample(fc.string())
      expect(values).toSatisfy((v: string[]) => v.length === 10 && v.every(x => typeof x === 'string'))
    })
  })

  describe('generate', () => {
    it('generates a single value', () => {
      const value = generate(fc.integer())
      expect(Number.isInteger(value)).toBe(true);
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
      expect(() => assertDeepEquals(5, 6)).toThrow('Expected')
      expect(() => assertDeepEquals({ a: 1 }, { a: 2 })).toThrow('Expected')
    })
  })

  describe('assertThrows', () => {
    it('passes when function throws', () => {
      expect(() =>
        assertThrows(() => {
          throw new Error('test')
        })
      ).not.toThrow()
    })

    it('fails when function does not throw', () => {
      expect(() => assertThrows(() => {})).toThrow('Expected function to throw')
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
      ).toThrow('Expected error of type')
    })
  })

  describe('assertInRange', () => {
    it('passes for values in range', () => {
      expect(() => assertInRange(5, 0, 10)).not.toThrow()
      expect(() => assertInRange(0, 0, 10)).not.toThrow()
      expect(() => assertInRange(10, 0, 10)).not.toThrow()
    })

    it('fails for values outside range', () => {
      expect(() => assertInRange(-1, 0, 10)).toThrow('to be in range')
      expect(() => assertInRange(11, 0, 10)).toThrow('to be in range')
    })
  })

  describe('getNumRuns', () => {
    it('returns a positive number', () => {
      const runs = getNumRuns()
      expect(Number.isInteger(runs)).toBe(true);
      expect(runs).toBeGreaterThan(0)
    })
  })
})
