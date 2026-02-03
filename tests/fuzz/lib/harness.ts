/**
 * Test harness for property-based testing.
 *
 * Provides configurable iteration counts, seed logging, and vitest integration.
 */
import * as fc from 'fast-check'
import type { Arbitrary, Parameters } from 'fast-check'

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get the number of iterations from environment or default.
 *
 * Defaults:
 * - Standard: 50 iterations (fast feedback during development)
 * - Deep: Set FUZZ_ITERATIONS=500 or higher for thorough overnight runs
 */
function getNumRuns(): number {
  const envValue = process.env.FUZZ_ITERATIONS
  if (envValue) {
    const parsed = parseInt(envValue, 10)
    if (!isNaN(parsed) && parsed > 0) {
      return parsed
    }
  }
  // Default: 50 for fast feedback, use FUZZ_ITERATIONS for deep testing
  return 50
}

/**
 * Check if verbose mode is enabled.
 */
function isVerbose(): boolean {
  return process.env.FUZZ_VERBOSE === 'true'
}

/**
 * Get seed from environment for reproducibility.
 */
function getSeed(): number | undefined {
  const envValue = process.env.FUZZ_SEED
  if (envValue) {
    const parsed = parseInt(envValue, 10)
    if (!isNaN(parsed)) {
      return parsed
    }
  }
  return undefined
}

// ============================================================================
// Test Harness Configuration Type
// ============================================================================

export interface HarnessConfig {
  /** Number of test iterations (default: from FUZZ_ITERATIONS or 100) */
  numRuns?: number
  /** Random seed for reproducibility */
  seed?: number
  /** Enable verbose logging */
  verbose?: boolean
  /** Skip shrinking (faster but less helpful failures) */
  skipShrinking?: boolean
  /** Timeout per property check in ms */
  timeout?: number
}

/**
 * Merge user config with environment defaults.
 */
function mergeConfig(userConfig?: HarnessConfig): Parameters<unknown> {
  const config: Parameters<unknown> = {
    numRuns: userConfig?.numRuns ?? getNumRuns(),
    verbose: userConfig?.verbose ?? isVerbose(),
    seed: userConfig?.seed ?? getSeed(),
    skipAllAfterTimeLimit: userConfig?.timeout,
  }

  if (userConfig?.skipShrinking) {
    config.endOnFailure = true
  }

  return config
}

// ============================================================================
// Property Test Helpers
// ============================================================================

/**
 * Run a property test with configured settings.
 *
 * @example
 * ```ts
 * testProp('addition is commutative', [fc.integer(), fc.integer()], (a, b) => {
 *   expect(a + b).toBe(b + a)
 * })
 * ```
 */
export function testProp<T extends [Arbitrary<unknown>, ...Arbitrary<unknown>[]]>(
  name: string,
  arbitraries: T,
  predicate: (...args: { [K in keyof T]: T[K] extends Arbitrary<infer U> ? U : never }) => void | Promise<void>,
  config?: HarnessConfig
): void {
  const mergedConfig = mergeConfig(config)

  // Create a tuple from the arbitraries
  const tupleArb = fc.tuple(...(arbitraries as [Arbitrary<unknown>, ...Arbitrary<unknown>[]]))

  try {
    fc.assert(
      fc.property(tupleArb, (values) => {
        // Spread the tuple values as arguments
        ;(predicate as (...args: unknown[]) => void)(...(values as unknown[]))
      }),
      mergedConfig
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('Property failed')) {
      // Extract and log seed for reproducibility
      const seedMatch = error.message.match(/seed=(\d+)/)
      if (seedMatch) {
        console.log(`\n🌱 Failing seed: ${seedMatch[1]}`)
        console.log(`   Reproduce with: FUZZ_SEED=${seedMatch[1]} npm run test:fuzz\n`)
      }
    }
    throw error
  }
}

/**
 * Run a property test that expects the predicate to return a boolean.
 */
export function checkProp<T extends [Arbitrary<unknown>, ...Arbitrary<unknown>[]]>(
  arbitraries: T,
  predicate: (...args: { [K in keyof T]: T[K] extends Arbitrary<infer U> ? U : never }) => boolean,
  config?: HarnessConfig
): void {
  const mergedConfig = mergeConfig(config)
  const tupleArb = fc.tuple(...(arbitraries as [Arbitrary<unknown>, ...Arbitrary<unknown>[]]))

  fc.assert(
    fc.property(tupleArb, (values) => {
      return (predicate as (...args: unknown[]) => boolean)(...(values as unknown[]))
    }),
    mergedConfig
  )
}

/**
 * Sample values from a generator (useful for debugging).
 */
export function sample<T>(arb: Arbitrary<T>, count: number = 10): T[] {
  return fc.sample(arb, count)
}

/**
 * Generate a single value from an arbitrary (useful for debugging).
 */
export function generate<T>(arb: Arbitrary<T>): T {
  return fc.sample(arb, 1)[0]
}

// ============================================================================
// Assertion Helpers for Properties
// ============================================================================

/**
 * Assert that two values are deeply equal (for use in property predicates).
 */
export function assertDeepEquals<T>(actual: T, expected: T, message?: string): void {
  const actualJson = JSON.stringify(actual, null, 2)
  const expectedJson = JSON.stringify(expected, null, 2)

  if (actualJson !== expectedJson) {
    throw new Error(message ?? `Expected ${expectedJson} but got ${actualJson}`)
  }
}

/**
 * Assert that a function throws an error.
 */
export function assertThrows(fn: () => void, errorType?: new (...args: unknown[]) => Error, message?: string): void {
  let threw = false
  let error: unknown

  try {
    fn()
  } catch (e) {
    threw = true
    error = e
  }

  if (!threw) {
    throw new Error(message ?? 'Expected function to throw')
  }

  if (errorType && !(error instanceof errorType)) {
    throw new Error(message ?? `Expected error of type ${errorType.name} but got ${(error as Error)?.constructor?.name}`)
  }
}

/**
 * Assert that a value is within a range (inclusive).
 */
export function assertInRange(value: number, min: number, max: number, message?: string): void {
  if (value < min || value > max) {
    throw new Error(message ?? `Expected ${value} to be in range [${min}, ${max}]`)
  }
}

// ============================================================================
// Progress Reporter
// ============================================================================

/**
 * Create a progress reporter for long-running property tests.
 * Logs progress every N iterations.
 */
export function withProgress<T>(
  arb: Arbitrary<T>,
  options?: { every?: number; label?: string }
): Arbitrary<T> {
  let count = 0
  const every = options?.every ?? 1000
  const label = options?.label ?? 'iterations'

  return arb.map((value) => {
    count++
    if (count % every === 0 && isVerbose()) {
      console.log(`  📊 ${count} ${label} completed...`)
    }
    return value
  })
}

// ============================================================================
// Export Configuration Getters
// ============================================================================

export { getNumRuns, isVerbose, getSeed }
