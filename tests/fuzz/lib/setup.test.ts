/**
 * Verification test to ensure fast-check integrates correctly with vitest.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

describe('fast-check integration', () => {
  it('should run a simple property test', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        // Addition is commutative
        expect(a + b).toBe(b + a)
      })
    )
  })

  it('should run property test with configurable iterations', () => {
    const iterations = parseInt(process.env.FUZZ_ITERATIONS || '100', 10)

    fc.assert(
      fc.property(fc.string(), (s) => {
        // String length is non-negative
        expect(s.length >= 0).toBe(true)
      }),
      { numRuns: iterations }
    )
  })

  it('should support custom generators', () => {
    const positiveInt = fc.integer({ min: 1 })

    fc.assert(
      fc.property(positiveInt, (n) => {
        expect(n).toBeGreaterThanOrEqual(1)
      })
    )
  })
})
