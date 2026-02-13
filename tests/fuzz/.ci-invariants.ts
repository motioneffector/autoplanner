/**
 * CI Configuration for Invariant Checking (Task #435)
 *
 * This module provides utilities for integrating invariant checking
 * into CI pipelines and automated testing workflows.
 */

import {
  checkAllInvariants,
  createViolationReport,
  formatViolationReport,
  assertNoViolations,
} from './invariants'
import type { LocalDate, LocalTime, LocalDateTime, Duration } from './lib/types'

/**
 * CI-specific configuration for invariant checking.
 */
export interface CIInvariantConfig {
  /** Fail the CI build if any invariants are violated */
  failOnViolation: boolean

  /** Output format for violation reports */
  outputFormat: 'console' | 'json' | 'junit'

  /** Path to write violation report (if applicable) */
  reportPath?: string

  /** Additional context to include in reports */
  context?: Record<string, unknown>
}

/**
 * Default CI configuration.
 */
export const defaultCIConfig: CIInvariantConfig = {
  failOnViolation: true,
  outputFormat: 'console',
}

/**
 * Runs invariant checks with CI-appropriate output.
 *
 * Usage in vitest.config.ts or test setup:
 * ```typescript
 * import { runCIInvariantCheck } from './tests/fuzz/.ci-invariants'
 *
 * afterEach(async () => {
 *   // Check invariants after each test
 *   await runCIInvariantCheck(testState, { failOnViolation: true })
 * })
 * ```
 */
export function runCIInvariantCheck(
  state: {
    dates?: LocalDate[]
    times?: LocalTime[]
    dateTimes?: LocalDateTime[]
    durations?: Duration[]
  },
  config: Partial<CIInvariantConfig> = {}
): void {
  const mergedConfig = { ...defaultCIConfig, ...config }
  const result = checkAllInvariants(state)

  if (!result.passed) {
    const report = createViolationReport(result)

    switch (mergedConfig.outputFormat) {
      case 'json':
        console.error(JSON.stringify(report, null, 2))
        break
      case 'junit':
        console.error(formatAsJUnit(report))
        break
      default:
        console.error(formatViolationReport(report))
    }

    if (mergedConfig.failOnViolation) {
      throw new Error(`Invariant violations detected: ${report.totalViolations} violations`)
    }
  }
}

/**
 * Formats a violation report as JUnit XML for CI systems.
 */
function formatAsJUnit(report: ReturnType<typeof createViolationReport>): string {
  const failures = report.details
    .map((detail, i) => `
    <testcase name="invariant-${i}" classname="${detail.invariant}">
      <failure message="${escapeXml(detail.message)}" type="${detail.invariant}">
${escapeXml(detail.context)}
      </failure>
    </testcase>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="Invariant Checks" tests="${report.totalViolations}" failures="${report.totalViolations}" timestamp="${report.timestamp}">
${failures}
</testsuite>`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Vitest plugin for automatic invariant checking.
 *
 * Add to vitest.config.ts:
 * ```typescript
 * import { invariantCheckPlugin } from './tests/fuzz/.ci-invariants'
 *
 * export default defineConfig({
 *   test: {
 *     plugins: [invariantCheckPlugin()],
 *   },
 * })
 * ```
 */
export function invariantCheckPlugin() {
  return {
    name: 'invariant-check',
    // This is a conceptual plugin - actual Vitest plugins have different APIs
  }
}

/**
 * Environment variable configuration for CI.
 *
 * Set these in your CI environment:
 * - FUZZ_INVARIANT_CHECK=true - Enable invariant checking
 * - FUZZ_INVARIANT_FAIL=true - Fail on violations (default)
 * - FUZZ_INVARIANT_OUTPUT=json|junit|console - Output format
 */
export function getCIConfigFromEnv(): CIInvariantConfig {
  return {
    failOnViolation: (process.env.FUZZ_INVARIANT_FAIL ?? 'true') !== 'false',
    outputFormat: (process.env.FUZZ_INVARIANT_OUTPUT ?? 'console') as 'json' | 'junit' | 'console',
    reportPath: process.env.FUZZ_INVARIANT_REPORT_PATH ?? undefined,
  }
}

/**
 * Wrapper for property tests that includes invariant checking.
 *
 * Usage:
 * ```typescript
 * it('my property test', () => {
 *   withInvariantCheck((state) => {
 *     // Your property test logic
 *     // state will be checked for invariants after
 *   })
 * })
 * ```
 */
export function withInvariantCheck<T>(
  fn: () => T,
  stateExtractor?: () => Parameters<typeof checkAllInvariants>[0]
): T {
  try {
    return fn()
  } finally {
    if (stateExtractor) {
      const state = stateExtractor()
      assertNoViolations(checkAllInvariants(state), 'property test invariant check')
    }
  }
}
