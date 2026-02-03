/**
 * Vitest setup file for fuzz tests.
 * Configures fast-check global defaults.
 */
import * as fc from 'fast-check'

// Configure fast-check defaults based on environment
const numRuns = process.env.FUZZ_ITERATIONS
  ? parseInt(process.env.FUZZ_ITERATIONS, 10)
  : 50 // Fast feedback by default, use FUZZ_ITERATIONS=500+ for deep testing

fc.configureGlobal({
  numRuns,
  // Log seed on failure for reproducibility
  verbose: process.env.FUZZ_VERBOSE === 'true',
})

// Log configuration at startup
if (process.env.FUZZ_VERBOSE === 'true') {
  console.log(`\n🎲 Fast-check configured: ${numRuns} iterations per property`)
}
