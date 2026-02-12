/**
 * Vitest setup file for fuzz tests.
 * Configures fast-check global defaults.
 */
import * as fc from 'fast-check'

// Configure fast-check defaults based on environment
const fuzzIterations = process.env.FUZZ_ITERATIONS ?? ''
const parsed = fuzzIterations ? parseInt(fuzzIterations, 10) : NaN
const numRuns = isNaN(parsed) ? 50 : parsed // Fast feedback by default, use FUZZ_ITERATIONS=500+ for deep testing

const fuzzVerbose = (process.env.FUZZ_VERBOSE ?? 'false') === 'true'

fc.configureGlobal({
  numRuns,
  // Log seed on failure for reproducibility
  verbose: fuzzVerbose,
})

// Log configuration at startup
if (fuzzVerbose) {
  console.log(`\n🎲 Fast-check configured: ${numRuns} iterations per property`)
}
