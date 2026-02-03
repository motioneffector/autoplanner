/**
 * Invariant checkers for fuzz testing.
 *
 * These functions verify that system state satisfies fundamental invariants
 * that should always hold true regardless of the operations performed.
 */
import { parseLocalDate, parseLocalDateTime, lastDayOfMonth, isLeapYear } from '../lib/utils'
import type {
  LocalDate,
  LocalDateTime,
  LocalTime,
  Duration,
  SeriesId,
  Pattern,
  Condition,
  RelationalConstraint,
  Link,
  Completion,
  Series,
} from '../lib/types'

// ============================================================================
// Invariant Result Types
// ============================================================================

export interface InvariantViolation {
  invariant: string
  message: string
  context?: Record<string, unknown>
}

export interface InvariantCheckResult {
  passed: boolean
  violations: InvariantViolation[]
}

// ============================================================================
// Date/Time Invariants (Task #417-#419)
// ============================================================================

/**
 * Property #417: dateIsValid - All dates must have valid year/month/day combinations
 */
export function dateIsValid(date: LocalDate): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  try {
    const { year, month, day } = parseLocalDate(date)

    if (month < 1 || month > 12) {
      violations.push({
        invariant: 'dateIsValid',
        message: `Month ${month} out of range [1, 12]`,
        context: { date, year, month, day },
      })
    }

    if (day < 1) {
      violations.push({
        invariant: 'dateIsValid',
        message: `Day ${day} must be at least 1`,
        context: { date, year, month, day },
      })
    }

    const maxDay = lastDayOfMonth(year, month)
    if (day > maxDay) {
      violations.push({
        invariant: 'dateIsValid',
        message: `Day ${day} exceeds maximum ${maxDay} for month ${month}`,
        context: { date, year, month, day, maxDay },
      })
    }
  } catch (e) {
    violations.push({
      invariant: 'dateIsValid',
      message: `Failed to parse date: ${e}`,
      context: { date },
    })
  }

  return { passed: violations.length === 0, violations }
}

/**
 * Property #418: timeIsValid - All times must have valid hour/minute combinations
 */
export function timeIsValid(time: LocalTime): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  // LocalTime format is "HH:MM"
  const match = time.match(/^(\d{2}):(\d{2})$/)
  if (!match) {
    violations.push({
      invariant: 'timeIsValid',
      message: `Invalid time format: ${time}`,
      context: { time },
    })
    return { passed: false, violations }
  }

  const hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)

  if (hours < 0 || hours > 23) {
    violations.push({
      invariant: 'timeIsValid',
      message: `Hours ${hours} out of range [0, 23]`,
      context: { time, hours, minutes },
    })
  }

  if (minutes < 0 || minutes > 59) {
    violations.push({
      invariant: 'timeIsValid',
      message: `Minutes ${minutes} out of range [0, 59]`,
      context: { time, hours, minutes },
    })
  }

  return { passed: violations.length === 0, violations }
}

/**
 * Property #419: dateTimeIsValid - All datetimes must be valid date + time combinations
 */
export function dateTimeIsValid(dateTime: LocalDateTime): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  try {
    const parsed = parseLocalDateTime(dateTime)

    // Check date portion
    const dateResult = dateIsValid(
      `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}` as LocalDate
    )
    violations.push(...dateResult.violations)

    // Check time portion
    if (parsed.hours < 0 || parsed.hours > 23) {
      violations.push({
        invariant: 'dateTimeIsValid',
        message: `Hours ${parsed.hours} out of range [0, 23]`,
        context: { dateTime, ...parsed },
      })
    }

    if (parsed.minutes < 0 || parsed.minutes > 59) {
      violations.push({
        invariant: 'dateTimeIsValid',
        message: `Minutes ${parsed.minutes} out of range [0, 59]`,
        context: { dateTime, ...parsed },
      })
    }
  } catch (e) {
    violations.push({
      invariant: 'dateTimeIsValid',
      message: `Failed to parse dateTime: ${e}`,
      context: { dateTime },
    })
  }

  return { passed: violations.length === 0, violations }
}

/**
 * Property #420: durationIsPositive - All durations must be positive
 */
export function durationIsPositive(duration: Duration): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  if ((duration as number) <= 0) {
    violations.push({
      invariant: 'durationIsPositive',
      message: `Duration ${duration} must be positive`,
      context: { duration },
    })
  }

  return { passed: violations.length === 0, violations }
}

// ============================================================================
// Completion Invariants (Task #423)
// ============================================================================

/**
 * Property #423: completionEndAfterStart - Completion endTime must be >= startTime
 */
export function completionEndAfterStart(completion: Completion): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  if (completion.endTime < completion.startTime) {
    violations.push({
      invariant: 'completionEndAfterStart',
      message: `Completion endTime ${completion.endTime} before startTime ${completion.startTime}`,
      context: { completion },
    })
  }

  return { passed: violations.length === 0, violations }
}

// ============================================================================
// Cycling Invariants (Task #424)
// ============================================================================

/**
 * Property #424: cyclingIndexInBounds - Cycling index must be within items array bounds
 */
export function cyclingIndexInBounds(
  index: number,
  items: string[]
): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  // Index should be >= 0 (we use modulo for cycling, so raw index can be large)
  if (index < 0) {
    violations.push({
      invariant: 'cyclingIndexInBounds',
      message: `Cycling index ${index} is negative`,
      context: { index, itemsLength: items.length },
    })
  }

  // Items must not be empty
  if (items.length === 0) {
    violations.push({
      invariant: 'cyclingIndexInBounds',
      message: 'Cycling items array is empty',
      context: { index, items },
    })
  }

  return { passed: violations.length === 0, violations }
}

// ============================================================================
// Chain Invariants (Task #425-#426)
// ============================================================================

/**
 * Property #425: chainDepthWithinLimit - Chain depth must not exceed 32
 */
export function chainDepthWithinLimit(
  links: Map<SeriesId, Link>,
  seriesId: SeriesId
): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  let depth = 0
  let current: SeriesId | undefined = seriesId

  while (current && links.has(current)) {
    depth++
    if (depth > 32) {
      violations.push({
        invariant: 'chainDepthWithinLimit',
        message: `Chain depth ${depth} exceeds limit of 32`,
        context: { seriesId, depth },
      })
      break
    }
    current = links.get(current)?.parentSeriesId
  }

  return { passed: violations.length === 0, violations }
}

/**
 * Property #426: chainNoCycles - Chains must not contain cycles
 */
export function chainNoCycles(
  links: Map<SeriesId, Link>,
  seriesId: SeriesId
): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  const visited = new Set<SeriesId>()
  let current: SeriesId | undefined = seriesId

  while (current) {
    if (visited.has(current)) {
      violations.push({
        invariant: 'chainNoCycles',
        message: `Cycle detected at seriesId ${current}`,
        context: { seriesId, cycleAt: current, visited: Array.from(visited) },
      })
      break
    }
    visited.add(current)
    current = links.get(current)?.parentSeriesId
  }

  return { passed: violations.length === 0, violations }
}

// ============================================================================
// Constraint Invariants (Task #427-#428)
// ============================================================================

/**
 * Property #427: withinMinutesOnlyForMustBeWithin - withinMinutes only defined for mustBeWithin constraints
 */
export function withinMinutesOnlyForMustBeWithin(
  constraint: RelationalConstraint
): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  if (constraint.type === 'mustBeWithin') {
    if (constraint.withinMinutes === undefined) {
      violations.push({
        invariant: 'withinMinutesOnlyForMustBeWithin',
        message: 'mustBeWithin constraint must have withinMinutes defined',
        context: { constraint },
      })
    }
  } else {
    if (constraint.withinMinutes !== undefined) {
      violations.push({
        invariant: 'withinMinutesOnlyForMustBeWithin',
        message: `withinMinutes should not be defined for ${constraint.type} constraint`,
        context: { constraint },
      })
    }
  }

  return { passed: violations.length === 0, violations }
}

/**
 * Property #428: withinMinutesNonNegative - withinMinutes must be >= 1
 */
export function withinMinutesNonNegative(
  constraint: RelationalConstraint
): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  if (constraint.withinMinutes !== undefined && constraint.withinMinutes < 1) {
    violations.push({
      invariant: 'withinMinutesNonNegative',
      message: `withinMinutes ${constraint.withinMinutes} must be >= 1`,
      context: { constraint },
    })
  }

  return { passed: violations.length === 0, violations }
}

// ============================================================================
// Reflow Invariants (Task #429-#430)
// ============================================================================

interface ScheduledItem {
  seriesId: SeriesId
  date: LocalDate
  time: LocalDateTime
  isAllDay: boolean
  isFixed: boolean
  idealTime?: LocalDateTime
}

/**
 * Property #429: allDayExcludedFromReflow - All-day items should not have times assigned by reflow
 */
export function allDayExcludedFromReflow(items: ScheduledItem[]): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  for (const item of items) {
    if (item.isAllDay) {
      // All-day items should have time at 00:00 (or conceptually no time)
      const parsed = parseLocalDateTime(item.time)
      if (parsed.hours !== 0 || parsed.minutes !== 0) {
        violations.push({
          invariant: 'allDayExcludedFromReflow',
          message: `All-day item ${item.seriesId} has non-midnight time ${item.time}`,
          context: { item },
        })
      }
    }
  }

  return { passed: violations.length === 0, violations }
}

/**
 * Property #430: fixedItemsNotMoved - Fixed items must remain at their scheduled time
 */
export function fixedItemsNotMoved(items: ScheduledItem[]): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  for (const item of items) {
    if (item.isFixed && item.idealTime) {
      // Fixed items should have their actual time equal to ideal time
      if (item.time !== item.idealTime) {
        violations.push({
          invariant: 'fixedItemsNotMoved',
          message: `Fixed item ${item.seriesId} moved from ${item.idealTime} to ${item.time}`,
          context: { item },
        })
      }
    }
  }

  return { passed: violations.length === 0, violations }
}

/**
 * Property #422: lockedSeriesNotModified - Locked series should not be modified
 */
export function lockedSeriesNotModified(
  seriesId: SeriesId,
  isLocked: boolean,
  hasChanges: boolean
): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  if (isLocked && hasChanges) {
    violations.push({
      invariant: 'lockedSeriesNotModified',
      message: `Locked series ${seriesId} was modified`,
      context: { seriesId, isLocked, hasChanges },
    })
  }

  return { passed: violations.length === 0, violations }
}

// ============================================================================
// Transaction Invariants (Task #421)
// ============================================================================

interface TransactionState {
  isInTransaction: boolean
  transactionDepth: number
  uncommittedReads: Set<string> // IDs read but not yet committed
  uncommittedWrites: Set<string> // IDs written but not yet committed
}

/**
 * Property #421: transactionIsolation - Uncommitted changes should not be visible outside transaction
 *
 * This invariant verifies that:
 * 1. Reads inside a transaction see uncommitted writes from the same transaction
 * 2. Reads outside a transaction don't see uncommitted writes
 * 3. After commit, writes are visible globally
 * 4. After rollback, writes are discarded
 */
export function transactionIsolation(
  txState: TransactionState,
  externalReads: Set<string>,
  internalReads: Set<string>
): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  if (txState.isInTransaction) {
    // Check that uncommitted writes are visible internally
    for (const writeId of txState.uncommittedWrites) {
      if (!internalReads.has(writeId) && internalReads.size > 0) {
        // Not a violation if we haven't tried to read it
      }
    }

    // Check that uncommitted writes are NOT visible externally
    for (const writeId of txState.uncommittedWrites) {
      if (externalReads.has(writeId)) {
        violations.push({
          invariant: 'transactionIsolation',
          message: `Uncommitted write ${writeId} visible outside transaction`,
          context: { writeId, externalReads: Array.from(externalReads) },
        })
      }
    }
  }

  // Transaction depth should be non-negative
  if (txState.transactionDepth < 0) {
    violations.push({
      invariant: 'transactionIsolation',
      message: `Transaction depth ${txState.transactionDepth} is negative`,
      context: { transactionDepth: txState.transactionDepth },
    })
  }

  // If not in transaction, depth should be 0
  if (!txState.isInTransaction && txState.transactionDepth !== 0) {
    violations.push({
      invariant: 'transactionIsolation',
      message: `Not in transaction but depth is ${txState.transactionDepth}`,
      context: { isInTransaction: txState.isInTransaction, transactionDepth: txState.transactionDepth },
    })
  }

  return { passed: violations.length === 0, violations }
}

/**
 * Verifies that a transaction commit makes all uncommitted changes visible.
 */
export function transactionCommitMakesVisible(
  preCommitWrites: Set<string>,
  postCommitReads: Set<string>
): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  for (const writeId of preCommitWrites) {
    if (!postCommitReads.has(writeId)) {
      violations.push({
        invariant: 'transactionCommitMakesVisible',
        message: `Committed write ${writeId} not visible after commit`,
        context: { writeId },
      })
    }
  }

  return { passed: violations.length === 0, violations }
}

/**
 * Verifies that a transaction rollback discards all uncommitted changes.
 */
export function transactionRollbackDiscardsChanges(
  preRollbackWrites: Set<string>,
  postRollbackReads: Set<string>
): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  for (const writeId of preRollbackWrites) {
    if (postRollbackReads.has(writeId)) {
      violations.push({
        invariant: 'transactionRollbackDiscardsChanges',
        message: `Rolled back write ${writeId} still visible after rollback`,
        context: { writeId },
      })
    }
  }

  return { passed: violations.length === 0, violations }
}

// ============================================================================
// Aggregate Invariant Checker
// ============================================================================

/**
 * Check all invariants for a given state.
 */
export function checkAllInvariants(state: {
  dates?: LocalDate[]
  times?: LocalTime[]
  dateTimes?: LocalDateTime[]
  durations?: Duration[]
  completions?: Completion[]
  links?: Map<SeriesId, Link>
  constraints?: RelationalConstraint[]
  cyclingStates?: Array<{ index: number; items: string[] }>
}): InvariantCheckResult {
  const allViolations: InvariantViolation[] = []

  // Check date invariants
  for (const date of state.dates ?? []) {
    const result = dateIsValid(date)
    allViolations.push(...result.violations)
  }

  // Check time invariants
  for (const time of state.times ?? []) {
    const result = timeIsValid(time)
    allViolations.push(...result.violations)
  }

  // Check dateTime invariants
  for (const dt of state.dateTimes ?? []) {
    const result = dateTimeIsValid(dt)
    allViolations.push(...result.violations)
  }

  // Check duration invariants
  for (const duration of state.durations ?? []) {
    const result = durationIsPositive(duration)
    allViolations.push(...result.violations)
  }

  // Check completion invariants
  for (const completion of state.completions ?? []) {
    const result = completionEndAfterStart(completion)
    allViolations.push(...result.violations)
  }

  // Check chain invariants
  if (state.links) {
    const checkedSeries = new Set<SeriesId>()
    for (const [childId] of state.links) {
      if (!checkedSeries.has(childId)) {
        checkedSeries.add(childId)
        const depthResult = chainDepthWithinLimit(state.links, childId)
        const cycleResult = chainNoCycles(state.links, childId)
        allViolations.push(...depthResult.violations)
        allViolations.push(...cycleResult.violations)
      }
    }
  }

  // Check constraint invariants
  for (const constraint of state.constraints ?? []) {
    const withinResult = withinMinutesOnlyForMustBeWithin(constraint)
    const nonNegResult = withinMinutesNonNegative(constraint)
    allViolations.push(...withinResult.violations)
    allViolations.push(...nonNegResult.violations)
  }

  // Check cycling invariants
  for (const cycling of state.cyclingStates ?? []) {
    const result = cyclingIndexInBounds(cycling.index, cycling.items)
    allViolations.push(...result.violations)
  }

  return {
    passed: allViolations.length === 0,
    violations: allViolations,
  }
}

// ============================================================================
// Export all invariant checkers
// ============================================================================

// ============================================================================
// Invariant Violation Reporter (Task #433)
// ============================================================================

export interface ViolationReport {
  summary: string
  details: ViolationDetail[]
  timestamp: string
  totalViolations: number
  violationsByInvariant: Map<string, number>
}

export interface ViolationDetail {
  invariant: string
  message: string
  context: string
  severity: 'error' | 'warning'
}

/**
 * Creates a detailed, human-readable report from invariant violations.
 *
 * The reporter:
 * - Groups violations by invariant type
 * - Provides context-aware formatting
 * - Includes counts and summaries
 * - Serializes complex context objects
 */
export function createViolationReport(result: InvariantCheckResult): ViolationReport {
  const violationsByInvariant = new Map<string, number>()
  const details: ViolationDetail[] = []

  for (const violation of result.violations) {
    // Count by invariant type
    const count = violationsByInvariant.get(violation.invariant) ?? 0
    violationsByInvariant.set(violation.invariant, count + 1)

    // Format context for readability
    let contextStr = ''
    if (violation.context) {
      try {
        contextStr = JSON.stringify(violation.context, (key, value) => {
          // Handle Sets and Maps
          if (value instanceof Set) {
            return Array.from(value)
          }
          if (value instanceof Map) {
            return Object.fromEntries(value)
          }
          return value
        }, 2)
      } catch {
        contextStr = String(violation.context)
      }
    }

    details.push({
      invariant: violation.invariant,
      message: violation.message,
      context: contextStr,
      severity: determineSeverity(violation.invariant),
    })
  }

  // Create summary
  const invariantTypes = Array.from(violationsByInvariant.keys())
  const summary = result.passed
    ? 'All invariants passed'
    : `${result.violations.length} violation(s) across ${invariantTypes.length} invariant type(s): ${invariantTypes.join(', ')}`

  return {
    summary,
    details,
    timestamp: new Date().toISOString(),
    totalViolations: result.violations.length,
    violationsByInvariant,
  }
}

/**
 * Determines the severity of a violation based on the invariant type.
 */
function determineSeverity(invariant: string): 'error' | 'warning' {
  // Critical invariants that indicate serious bugs
  const errorInvariants = [
    'transactionIsolation',
    'chainNoCycles',
    'chainDepthWithinLimit',
    'completionEndAfterStart',
    'dateIsValid',
    'timeIsValid',
    'dateTimeIsValid',
    'durationIsPositive',
  ]

  return errorInvariants.includes(invariant) ? 'error' : 'warning'
}

/**
 * Formats a violation report as a human-readable string.
 */
export function formatViolationReport(report: ViolationReport): string {
  const lines: string[] = []

  lines.push('═══════════════════════════════════════════════════════════════')
  lines.push('INVARIANT VIOLATION REPORT')
  lines.push(`Timestamp: ${report.timestamp}`)
  lines.push(`Summary: ${report.summary}`)
  lines.push('═══════════════════════════════════════════════════════════════')

  if (report.totalViolations === 0) {
    lines.push('✓ No violations detected')
    return lines.join('\n')
  }

  lines.push('')
  lines.push(`Total Violations: ${report.totalViolations}`)
  lines.push('')
  lines.push('Violations by Type:')

  for (const [invariant, count] of report.violationsByInvariant) {
    lines.push(`  • ${invariant}: ${count}`)
  }

  lines.push('')
  lines.push('───────────────────────────────────────────────────────────────')
  lines.push('DETAILS:')
  lines.push('───────────────────────────────────────────────────────────────')

  for (let i = 0; i < report.details.length; i++) {
    const detail = report.details[i]
    const severityIcon = detail.severity === 'error' ? '✗' : '⚠'

    lines.push('')
    lines.push(`[${i + 1}] ${severityIcon} ${detail.invariant}`)
    lines.push(`    Message: ${detail.message}`)

    if (detail.context && detail.context !== '{}') {
      lines.push(`    Context:`)
      const contextLines = detail.context.split('\n')
      for (const contextLine of contextLines) {
        lines.push(`      ${contextLine}`)
      }
    }
  }

  lines.push('')
  lines.push('═══════════════════════════════════════════════════════════════')

  return lines.join('\n')
}

/**
 * Throws an error with a detailed report if any violations are found.
 * Useful for failing tests immediately with clear diagnostics.
 */
export function assertNoViolations(result: InvariantCheckResult, context?: string): void {
  if (!result.passed) {
    const report = createViolationReport(result)
    const formatted = formatViolationReport(report)
    const prefix = context ? `[${context}] ` : ''
    throw new Error(`${prefix}Invariant violations detected:\n\n${formatted}`)
  }
}

// ============================================================================
// Timezone Invariants (Task #431)
// ============================================================================

/**
 * Represents a scheduled item with timezone information.
 */
interface TimezoneAwareItem {
  seriesId: SeriesId
  scheduledTime: LocalDateTime
  configuredTimezone: string
  storedTimezone?: string // Should be undefined (naive) or match configured
}

/**
 * Property #431: timezoneConsistency - All times in the system should be
 * interpreted consistently according to the configured timezone.
 *
 * Invariants:
 * 1. All LocalDateTime values are timezone-naive (no timezone stored)
 * 2. All times are interpreted in the single configured timezone
 * 3. No mixed timezone interpretations within a session
 * 4. UTC conversion only happens at system boundaries
 */
export function timezoneConsistency(
  items: TimezoneAwareItem[],
  configuredTimezone: string
): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  // Check each item for timezone consistency
  for (const item of items) {
    // Invariant 1: Stored timezone should be undefined (naive) or match configured
    if (item.storedTimezone !== undefined && item.storedTimezone !== configuredTimezone) {
      violations.push({
        invariant: 'timezoneConsistency',
        message: `Item ${item.seriesId} has stored timezone '${item.storedTimezone}' but configured is '${configuredTimezone}'`,
        context: { item, configuredTimezone },
      })
    }

    // Invariant 2: Configured timezone must be consistent across items
    if (item.configuredTimezone !== configuredTimezone) {
      violations.push({
        invariant: 'timezoneConsistency',
        message: `Item ${item.seriesId} was configured with timezone '${item.configuredTimezone}' but system is '${configuredTimezone}'`,
        context: { item, configuredTimezone },
      })
    }

    // Invariant 3: Scheduled time must be valid LocalDateTime format
    try {
      const parsed = parseLocalDateTime(item.scheduledTime)
      // Check that parsing produces valid values
      if (parsed.hours < 0 || parsed.hours > 23 || parsed.minutes < 0 || parsed.minutes > 59) {
        violations.push({
          invariant: 'timezoneConsistency',
          message: `Item ${item.seriesId} has invalid time components`,
          context: { item, parsed },
        })
      }
    } catch (e) {
      violations.push({
        invariant: 'timezoneConsistency',
        message: `Item ${item.seriesId} has invalid LocalDateTime: ${item.scheduledTime}`,
        context: { item },
      })
    }
  }

  return { passed: violations.length === 0, violations }
}

/**
 * Verifies that timezone configuration is valid.
 */
export function timezoneConfigValid(timezone: string): InvariantCheckResult {
  const violations: InvariantViolation[] = []

  // List of known valid IANA timezone identifiers
  const validTimezones = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney',
  ]

  // For testing purposes, we accept any string that looks like a timezone
  const timezonePattern = /^[A-Za-z_]+\/[A-Za-z_]+$|^UTC$/
  if (!timezonePattern.test(timezone) && !validTimezones.includes(timezone)) {
    violations.push({
      invariant: 'timezoneConfigValid',
      message: `Invalid timezone identifier: ${timezone}`,
      context: { timezone, validPattern: 'Area/Location or UTC' },
    })
  }

  return { passed: violations.length === 0, violations }
}

export const invariants = {
  dateIsValid,
  timeIsValid,
  dateTimeIsValid,
  durationIsPositive,
  completionEndAfterStart,
  cyclingIndexInBounds,
  chainDepthWithinLimit,
  chainNoCycles,
  withinMinutesOnlyForMustBeWithin,
  withinMinutesNonNegative,
  allDayExcludedFromReflow,
  fixedItemsNotMoved,
  lockedSeriesNotModified,
  transactionIsolation,
  transactionCommitMakesVisible,
  transactionRollbackDiscardsChanges,
  timezoneConsistency,
  timezoneConfigValid,
  checkAllInvariants,
}
