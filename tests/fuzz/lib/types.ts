/**
 * Type definitions for fuzz testing generators.
 *
 * These mirror the domain types from the autoplanner specifications,
 * providing a reference for property-based testing before the actual
 * implementation exists.
 */
import type { Arbitrary } from 'fast-check'

// ============================================================================
// Branded Types
// ============================================================================

/** Branded type for LocalDate (YYYY-MM-DD format internally) */
export type LocalDate = string & { readonly __brand: 'LocalDate' }

/** Branded type for LocalTime (HH:MM format) */
export type LocalTime = string & { readonly __brand: 'LocalTime' }

/** Branded type for LocalDateTime (ISO 8601 format) */
export type LocalDateTime = string & { readonly __brand: 'LocalDateTime' }

/** Duration in minutes */
export type Duration = number & { readonly __brand: 'Duration' }

/** Unique identifier for a Series */
export type SeriesId = string & { readonly __brand: 'SeriesId' }

/** Unique identifier for a Completion */
export type CompletionId = string & { readonly __brand: 'CompletionId' }

/** Unique identifier for a Condition */
export type ConditionId = string & { readonly __brand: 'ConditionId' }

/** Unique identifier for a Constraint */
export type ConstraintId = string & { readonly __brand: 'ConstraintId' }

/** Unique identifier for a Pattern */
export type PatternId = string & { readonly __brand: 'PatternId' }

// ============================================================================
// Day of Week
// ============================================================================

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Sunday

export const DAYS_OF_WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type DayName = (typeof DAYS_OF_WEEK)[number]

// ============================================================================
// Pattern Types
// ============================================================================

export type PatternType =
  | 'daily'
  | 'everyNDays'
  | 'weekly'
  | 'everyNWeeks'
  | 'monthly'
  | 'nthWeekdayOfMonth'
  | 'lastDayOfMonth'
  | 'yearly'
  | 'weekdays'
  | 'oneOff'
  | 'custom'
  | 'activeOnDates'
  | 'inactiveOnDates'

export interface DailyPattern {
  type: 'daily'
}

export interface EveryNDaysPattern {
  type: 'everyNDays'
  n: number // 2-365
  anchor: LocalDate
}

export interface WeeklyPattern {
  type: 'weekly'
  days: DayName[] // non-empty
}

export interface EveryNWeeksPattern {
  type: 'everyNWeeks'
  n: number // 2-52
  days: DayName[]
  anchor: LocalDate
}

export interface MonthlyPattern {
  type: 'monthly'
  day: number // 1-31, clamped to actual month end
}

export interface NthWeekdayOfMonthPattern {
  type: 'nthWeekdayOfMonth'
  n: 1 | 2 | 3 | 4 | 5 // 5 = "fifth", skipped if month doesn't have it
  weekday: DayName
}

export interface LastDayOfMonthPattern {
  type: 'lastDayOfMonth'
}

export interface YearlyPattern {
  type: 'yearly'
  month: number // 1-12
  day: number // 1-31, clamped
}

export interface WeekdaysPattern {
  type: 'weekdays' // Mon-Fri
}

export interface OneOffPattern {
  type: 'oneOff'
  date: LocalDate
}

export interface CustomPattern {
  type: 'custom'
  dates: LocalDate[]
}

export interface ActiveOnDatesPattern {
  type: 'activeOnDates'
  base: Pattern
  dates: LocalDate[]
}

export interface InactiveOnDatesPattern {
  type: 'inactiveOnDates'
  base: Pattern
  dates: LocalDate[]
}

export type Pattern =
  | DailyPattern
  | EveryNDaysPattern
  | WeeklyPattern
  | EveryNWeeksPattern
  | MonthlyPattern
  | NthWeekdayOfMonthPattern
  | LastDayOfMonthPattern
  | YearlyPattern
  | WeekdaysPattern
  | OneOffPattern
  | CustomPattern
  | ActiveOnDatesPattern
  | InactiveOnDatesPattern

// ============================================================================
// Condition Types
// ============================================================================

export type ComparisonOperator = '<' | '<=' | '=' | '>=' | '>'

export interface Target {
  tag?: string
  seriesId?: SeriesId
}

export interface CountCondition {
  type: 'count'
  target: Target
  comparison: ComparisonOperator
  threshold: number
  windowDays: number
}

export interface DaysSinceCondition {
  type: 'daysSince'
  target: Target
  comparison: ComparisonOperator
  threshold: number
}

export interface AndCondition {
  type: 'and'
  conditions: Condition[]
}

export interface OrCondition {
  type: 'or'
  conditions: Condition[]
}

export interface NotCondition {
  type: 'not'
  condition: Condition
}

export type Condition = CountCondition | DaysSinceCondition | AndCondition | OrCondition | NotCondition

// ============================================================================
// Relational Constraint Types
// ============================================================================

export type ConstraintType =
  | 'mustBeOnSameDay'
  | 'cantBeOnSameDay'
  | 'mustBeNextTo'
  | 'cantBeNextTo'
  | 'mustBeBefore'
  | 'mustBeAfter'
  | 'mustBeWithin'

export interface RelationalConstraint {
  id: ConstraintId
  type: ConstraintType
  sourceTarget: Target
  destTarget: Target
  withinMinutes?: number // required iff type = 'mustBeWithin'
}

// ============================================================================
// Link Types (Chain/Child relationships)
// ============================================================================

export interface Link {
  parentSeriesId: SeriesId
  childSeriesId: SeriesId
  targetDistance: number // minutes
  earlyWobble: number // minutes (0 = no early)
  lateWobble: number // minutes
}

// ============================================================================
// Cycling Types
// ============================================================================

export type CyclingMode = 'sequential' | 'random'

export interface CyclingConfig {
  items: string[]
  mode: CyclingMode
  gapLeap: boolean
  currentIndex: number
}

// ============================================================================
// Adaptive Duration Types
// ============================================================================

export interface AdaptiveDurationLastN {
  mode: 'lastN'
  value: number // count of recent completions
  multiplier: number
  fallback: Duration
}

export interface AdaptiveDurationWindowDays {
  mode: 'windowDays'
  value: number // days to look back
  multiplier: number
  fallback: Duration
}

export type AdaptiveDuration = AdaptiveDurationLastN | AdaptiveDurationWindowDays

// ============================================================================
// Wiggle Config (flexibility for reflow)
// ============================================================================

export interface WiggleConfig {
  daysBefore: number
  daysAfter: number
  timeWindow?: {
    earliest: LocalTime
    latest: LocalTime
  }
}

// ============================================================================
// Reminder Types
// ============================================================================

export interface Reminder {
  minutesBefore: number
  tag: string
}

// ============================================================================
// Series Types
// ============================================================================

export interface SeriesBounds {
  startDate: LocalDate
  endDate?: LocalDate
}

export interface Series {
  id: SeriesId
  title: string
  name: string
  tags: string[]
  patterns: Array<{
    id: PatternId
    pattern: Pattern
    conditionId?: ConditionId
  }>
  timeOfDay?: LocalTime // undefined = all-day
  duration: Duration | AdaptiveDuration
  estimatedDuration: Duration | AdaptiveDuration
  fixed: boolean
  wiggle?: WiggleConfig
  reminders: Reminder[]
  cycling?: CyclingConfig
  locked: boolean
  bounds: SeriesBounds
}

// ============================================================================
// Completion Types
// ============================================================================

export interface Completion {
  id: CompletionId
  seriesId: SeriesId
  instanceDate: LocalDate
  startTime: LocalDateTime
  endTime: LocalDateTime
  actualDuration: Duration
  notes?: string
}

// ============================================================================
// Instance Exception Types
// ============================================================================

export interface CancelledException {
  type: 'cancelled'
  seriesId: SeriesId
  instanceDate: LocalDate
}

export interface RescheduledException {
  type: 'rescheduled'
  seriesId: SeriesId
  instanceDate: LocalDate
  newTime: LocalDateTime
}

export type InstanceException = CancelledException | RescheduledException

// ============================================================================
// Scheduled Instance (output from reflow)
// ============================================================================

export interface ScheduledInstance {
  seriesId: SeriesId
  instanceDate: LocalDate
  scheduledStart: LocalDateTime
  scheduledEnd: LocalDateTime
  title: string
  status: 'scheduled' | 'completed' | 'cancelled'
  idealTime: LocalDateTime
  deviation: Duration
}

// ============================================================================
// Conflict Types
// ============================================================================

export type ConflictType = 'overlap' | 'constraintViolation' | 'chainCannotFit' | 'noValidSlot'
export type ConflictSeverity = 'warning' | 'error'

export interface Conflict {
  type: ConflictType
  severity: ConflictSeverity
  involvedSeries: SeriesId[]
  instanceDates: LocalDate[]
  description: string
  date: LocalDate
}

// ============================================================================
// Generator Type Aliases (for convenience)
// ============================================================================

export type Gen<T> = Arbitrary<T>

// ============================================================================
// System State Types (Task #436)
// ============================================================================

/**
 * Unique identifier for an instance exception.
 */
export type ExceptionId = string & { readonly __brand: 'ExceptionId' }

/**
 * Unique identifier for a link.
 */
export type LinkId = string & { readonly __brand: 'LinkId' }

/**
 * Unique identifier for a reminder.
 */
export type ReminderId = string & { readonly __brand: 'ReminderId' }

/**
 * Unique identifier for a tag.
 */
export type TagId = string & { readonly __brand: 'TagId' }

/**
 * SystemState represents the complete state of the autoplanner system.
 *
 * This is used for:
 * - Model-based testing (comparing expected vs actual state)
 * - Snapshot testing
 * - State machine testing
 * - Invariant verification
 *
 * All entity maps are keyed by their primary identifier.
 */
export interface SystemState {
  /** Map of series by their ID */
  series: Map<SeriesId, Series>

  /** Map of patterns by their ID */
  patterns: Map<PatternId, { pattern: Pattern; seriesId: SeriesId; conditionId?: ConditionId }>

  /** Map of conditions by their ID */
  conditions: Map<ConditionId, Condition>

  /** Map of completions by their ID */
  completions: Map<CompletionId, Completion>

  /** Map of links by child series ID (each child has at most one parent) */
  links: Map<SeriesId, Link>

  /** Map of constraints by their ID */
  constraints: Map<ConstraintId, RelationalConstraint>

  /** Map of instance exceptions by a composite key (seriesId:date) */
  instanceExceptions: Map<string, InstanceException>

  /** Map of series tags (seriesId -> set of tags) */
  seriesTags: Map<SeriesId, Set<string>>

  /** Map of cycling configs by series ID */
  cyclingConfigs: Map<SeriesId, CyclingConfig>

  /** Map of adaptive durations by series ID */
  adaptiveDurations: Map<SeriesId, AdaptiveDuration>

  /** Map of reminders by series ID */
  reminders: Map<SeriesId, Reminder[]>

  /** Map of wiggle configs by series ID */
  wiggleConfigs: Map<SeriesId, WiggleConfig>

  /** The configured timezone for the system */
  configuredTimezone: string

  /** Current transaction state (if any) */
  transactionState?: {
    depth: number
    uncommittedChanges: Set<string>
  }
}

/**
 * Creates an empty system state with default values.
 */
export function emptySystemState(timezone: string = 'UTC'): SystemState {
  return {
    series: new Map(),
    patterns: new Map(),
    conditions: new Map(),
    completions: new Map(),
    links: new Map(),
    constraints: new Map(),
    instanceExceptions: new Map(),
    seriesTags: new Map(),
    cyclingConfigs: new Map(),
    adaptiveDurations: new Map(),
    reminders: new Map(),
    wiggleConfigs: new Map(),
    configuredTimezone: timezone,
  }
}

/**
 * Creates a deep clone of a system state.
 */
export function cloneSystemState(state: SystemState): SystemState {
  return {
    series: new Map(state.series),
    patterns: new Map(state.patterns),
    conditions: new Map(state.conditions),
    completions: new Map(state.completions),
    links: new Map(state.links),
    constraints: new Map(state.constraints),
    instanceExceptions: new Map(state.instanceExceptions),
    seriesTags: new Map(Array.from(state.seriesTags.entries()).map(([k, v]) => [k, new Set(v)])),
    cyclingConfigs: new Map(state.cyclingConfigs),
    adaptiveDurations: new Map(state.adaptiveDurations),
    reminders: new Map(state.reminders),
    wiggleConfigs: new Map(state.wiggleConfigs),
    configuredTimezone: state.configuredTimezone,
    transactionState: state.transactionState
      ? {
          depth: state.transactionState.depth,
          uncommittedChanges: new Set(state.transactionState.uncommittedChanges),
        }
      : undefined,
  }
}

// ============================================================================
// Operation Types (Task #437)
// ============================================================================

/**
 * Operation union type representing all 18 possible operations
 * on the autoplanner system.
 *
 * These are used for:
 * - State machine testing
 * - Model-based testing
 * - Operation sequence generation
 * - Replay/logging
 */

// Series operations
export interface CreateSeriesOp {
  type: 'createSeries'
  series: Omit<Series, 'id'>
}

export interface UpdateSeriesOp {
  type: 'updateSeries'
  seriesId: SeriesId
  updates: Partial<Omit<Series, 'id'>>
}

export interface DeleteSeriesOp {
  type: 'deleteSeries'
  seriesId: SeriesId
}

export interface LockSeriesOp {
  type: 'lockSeries'
  seriesId: SeriesId
}

export interface UnlockSeriesOp {
  type: 'unlockSeries'
  seriesId: SeriesId
}

export interface SplitSeriesOp {
  type: 'splitSeries'
  seriesId: SeriesId
  splitDate: LocalDate
}

// Completion operations
export interface LogCompletionOp {
  type: 'logCompletion'
  seriesId: SeriesId
  instanceDate: LocalDate
  startTime: LocalDateTime
  endTime: LocalDateTime
  notes?: string
}

export interface DeleteCompletionOp {
  type: 'deleteCompletion'
  completionId: CompletionId
}

// Instance exception operations
export interface CancelInstanceOp {
  type: 'cancelInstance'
  seriesId: SeriesId
  instanceDate: LocalDate
}

export interface RestoreInstanceOp {
  type: 'restoreInstance'
  seriesId: SeriesId
  instanceDate: LocalDate
}

export interface RescheduleInstanceOp {
  type: 'rescheduleInstance'
  seriesId: SeriesId
  instanceDate: LocalDate
  newTime: LocalDateTime
}

// Link operations
export interface LinkSeriesOp {
  type: 'linkSeries'
  parentSeriesId: SeriesId
  childSeriesId: SeriesId
  targetDistance: number
  earlyWobble: number
  lateWobble: number
}

export interface UnlinkSeriesOp {
  type: 'unlinkSeries'
  childSeriesId: SeriesId
}

// Constraint operations
export interface AddConstraintOp {
  type: 'addConstraint'
  constraint: Omit<RelationalConstraint, 'id'>
}

export interface RemoveConstraintOp {
  type: 'removeConstraint'
  constraintId: ConstraintId
}

// Tag operations
export interface AddTagOp {
  type: 'addTag'
  seriesId: SeriesId
  tag: string
}

export interface RemoveTagOp {
  type: 'removeTag'
  seriesId: SeriesId
  tag: string
}

// Reminder operations
export interface AcknowledgeReminderOp {
  type: 'acknowledgeReminder'
  seriesId: SeriesId
  instanceDate: LocalDate
  reminderTag: string
}

/**
 * Union of all operation types.
 */
export type Operation =
  | CreateSeriesOp
  | UpdateSeriesOp
  | DeleteSeriesOp
  | LockSeriesOp
  | UnlockSeriesOp
  | SplitSeriesOp
  | LogCompletionOp
  | DeleteCompletionOp
  | CancelInstanceOp
  | RestoreInstanceOp
  | RescheduleInstanceOp
  | LinkSeriesOp
  | UnlinkSeriesOp
  | AddConstraintOp
  | RemoveConstraintOp
  | AddTagOp
  | RemoveTagOp
  | AcknowledgeReminderOp

/**
 * All operation type names for runtime checking.
 */
export const OPERATION_TYPES = [
  'createSeries',
  'updateSeries',
  'deleteSeries',
  'lockSeries',
  'unlockSeries',
  'splitSeries',
  'logCompletion',
  'deleteCompletion',
  'cancelInstance',
  'restoreInstance',
  'rescheduleInstance',
  'linkSeries',
  'unlinkSeries',
  'addConstraint',
  'removeConstraint',
  'addTag',
  'removeTag',
  'acknowledgeReminder',
] as const

export type OperationType = (typeof OPERATION_TYPES)[number]

/**
 * Result of an operation execution.
 */
export interface OperationResult {
  success: boolean
  operation: Operation
  error?: string
  createdId?: SeriesId | CompletionId | ConstraintId
}

/**
 * Compares two system states for equality.
 * Returns true if all entity maps contain equivalent data.
 */
export function statesEqual(a: SystemState, b: SystemState): boolean {
  // Compare map sizes first (quick rejection)
  if (a.series.size !== b.series.size) return false
  if (a.patterns.size !== b.patterns.size) return false
  if (a.conditions.size !== b.conditions.size) return false
  if (a.completions.size !== b.completions.size) return false
  if (a.links.size !== b.links.size) return false
  if (a.constraints.size !== b.constraints.size) return false
  if (a.instanceExceptions.size !== b.instanceExceptions.size) return false
  if (a.configuredTimezone !== b.configuredTimezone) return false

  // Compare series
  for (const [id, series] of a.series) {
    const other = b.series.get(id)
    if (!other || series.title !== other.title) return false
  }

  // Compare links
  for (const [childId, link] of a.links) {
    const other = b.links.get(childId)
    if (!other || link.parentSeriesId !== other.parentSeriesId) return false
  }

  // Compare constraints
  for (const [id, constraint] of a.constraints) {
    const other = b.constraints.get(id)
    if (!other || constraint.type !== other.type) return false
  }

  return true
}

// ============================================================================
// State Equivalence Checker (Task #440)
// ============================================================================

/**
 * Detailed comparison result for debugging test failures.
 */
export interface StateComparisonResult {
  equivalent: boolean
  differences: StateDifference[]
}

export interface StateDifference {
  path: string
  expected: unknown
  actual: unknown
  message: string
}

/**
 * Compares a model state (expected) with a real implementation state (actual).
 * Returns detailed differences for debugging.
 *
 * This is used for model-based testing where we maintain a simplified model
 * of the system state and compare it against the actual implementation.
 *
 * @param model The expected state from our model
 * @param real The actual state from the implementation
 * @returns Comparison result with detailed differences
 */
export function statesEquivalent(model: SystemState, real: SystemState): StateComparisonResult {
  const differences: StateDifference[] = []

  // Compare timezone configuration
  if (model.configuredTimezone !== real.configuredTimezone) {
    differences.push({
      path: 'configuredTimezone',
      expected: model.configuredTimezone,
      actual: real.configuredTimezone,
      message: `Timezone mismatch`,
    })
  }

  // Compare series
  compareMaps(
    'series',
    model.series,
    real.series,
    differences,
    (modelSeries, realSeries, id) => {
      if (modelSeries.title !== realSeries.title) {
        return `Title mismatch for series ${id}: "${modelSeries.title}" vs "${realSeries.title}"`
      }
      if (modelSeries.locked !== realSeries.locked) {
        return `Locked state mismatch for series ${id}: ${modelSeries.locked} vs ${realSeries.locked}`
      }
      if (modelSeries.fixed !== realSeries.fixed) {
        return `Fixed state mismatch for series ${id}: ${modelSeries.fixed} vs ${realSeries.fixed}`
      }
      return null
    }
  )

  // Compare completions
  compareMaps(
    'completions',
    model.completions,
    real.completions,
    differences,
    (modelComp, realComp, id) => {
      if (modelComp.seriesId !== realComp.seriesId) {
        return `Series ID mismatch for completion ${id}`
      }
      if (modelComp.instanceDate !== realComp.instanceDate) {
        return `Instance date mismatch for completion ${id}`
      }
      return null
    }
  )

  // Compare links
  compareMaps(
    'links',
    model.links,
    real.links,
    differences,
    (modelLink, realLink, childId) => {
      if (modelLink.parentSeriesId !== realLink.parentSeriesId) {
        return `Parent mismatch for link ${childId}: ${modelLink.parentSeriesId} vs ${realLink.parentSeriesId}`
      }
      if (modelLink.targetDistance !== realLink.targetDistance) {
        return `Target distance mismatch for link ${childId}`
      }
      return null
    }
  )

  // Compare constraints
  compareMaps(
    'constraints',
    model.constraints,
    real.constraints,
    differences,
    (modelConst, realConst, id) => {
      if (modelConst.type !== realConst.type) {
        return `Type mismatch for constraint ${id}: ${modelConst.type} vs ${realConst.type}`
      }
      return null
    }
  )

  // Compare instance exceptions
  compareMaps(
    'instanceExceptions',
    model.instanceExceptions,
    real.instanceExceptions,
    differences,
    (modelEx, realEx, key) => {
      if (modelEx.type !== realEx.type) {
        return `Exception type mismatch for ${key}: ${modelEx.type} vs ${realEx.type}`
      }
      return null
    }
  )

  // Compare series tags
  for (const [seriesId, modelTags] of model.seriesTags) {
    const realTags = real.seriesTags.get(seriesId)
    if (!realTags) {
      differences.push({
        path: `seriesTags.${seriesId}`,
        expected: Array.from(modelTags),
        actual: undefined,
        message: `Missing tags for series ${seriesId}`,
      })
    } else {
      for (const tag of modelTags) {
        if (!realTags.has(tag)) {
          differences.push({
            path: `seriesTags.${seriesId}.${tag}`,
            expected: tag,
            actual: undefined,
            message: `Missing tag "${tag}" on series ${seriesId}`,
          })
        }
      }
      for (const tag of realTags) {
        if (!modelTags.has(tag)) {
          differences.push({
            path: `seriesTags.${seriesId}.${tag}`,
            expected: undefined,
            actual: tag,
            message: `Unexpected tag "${tag}" on series ${seriesId}`,
          })
        }
      }
    }
  }

  // Check for extra tags in real
  for (const [seriesId] of real.seriesTags) {
    if (!model.seriesTags.has(seriesId)) {
      differences.push({
        path: `seriesTags.${seriesId}`,
        expected: undefined,
        actual: Array.from(real.seriesTags.get(seriesId)!),
        message: `Unexpected tags for series ${seriesId}`,
      })
    }
  }

  return {
    equivalent: differences.length === 0,
    differences,
  }
}

/**
 * Helper to compare two maps and collect differences.
 */
function compareMaps<K, V>(
  name: string,
  model: Map<K, V>,
  real: Map<K, V>,
  differences: StateDifference[],
  compareValues: (model: V, real: V, key: K) => string | null
): void {
  // Check for missing or different entries
  for (const [key, modelValue] of model) {
    const realValue = real.get(key)
    if (!realValue) {
      differences.push({
        path: `${name}.${key}`,
        expected: modelValue,
        actual: undefined,
        message: `Missing ${name} entry: ${key}`,
      })
    } else {
      const diff = compareValues(modelValue, realValue, key)
      if (diff) {
        differences.push({
          path: `${name}.${key}`,
          expected: modelValue,
          actual: realValue,
          message: diff,
        })
      }
    }
  }

  // Check for extra entries in real
  for (const [key, realValue] of real) {
    if (!model.has(key)) {
      differences.push({
        path: `${name}.${key}`,
        expected: undefined,
        actual: realValue,
        message: `Unexpected ${name} entry: ${key}`,
      })
    }
  }
}

/**
 * Formats a state comparison result for display in test output.
 */
export function formatStateComparison(result: StateComparisonResult): string {
  if (result.equivalent) {
    return 'States are equivalent'
  }

  const lines = [`States differ (${result.differences.length} difference(s)):`]
  for (const diff of result.differences) {
    lines.push(`  - ${diff.path}: ${diff.message}`)
    if (diff.expected !== undefined) {
      lines.push(`      expected: ${JSON.stringify(diff.expected)}`)
    }
    if (diff.actual !== undefined) {
      lines.push(`      actual: ${JSON.stringify(diff.actual)}`)
    }
  }
  return lines.join('\n')
}

// ============================================================================
// State Transformer (Task #439)
// ============================================================================

/**
 * Applies an operation to a system state, returning the new state.
 * This is a pure function - it does not mutate the input state.
 *
 * @param op The operation to apply
 * @param state The current system state
 * @returns Result containing success/failure and the new state (or error)
 */
export function applyOperation(
  op: Operation,
  state: SystemState
): { success: boolean; state: SystemState; createdId?: string; error?: string } {
  // Clone state to ensure purity
  const newState = cloneSystemState(state)

  try {
    switch (op.type) {
      case 'createSeries': {
        const id = `series-${Date.now()}-${Math.random().toString(36).slice(2)}` as SeriesId
        const series: Series = { ...op.series, id } as Series
        newState.series.set(id, series)
        return { success: true, state: newState, createdId: id }
      }

      case 'updateSeries': {
        const existing = newState.series.get(op.seriesId)
        if (!existing) {
          return { success: false, state, error: `Series ${op.seriesId} not found` }
        }
        if (existing.locked) {
          return { success: false, state, error: `Series ${op.seriesId} is locked` }
        }
        newState.series.set(op.seriesId, { ...existing, ...op.updates })
        return { success: true, state: newState }
      }

      case 'deleteSeries': {
        const existing = newState.series.get(op.seriesId)
        if (!existing) {
          return { success: false, state, error: `Series ${op.seriesId} not found` }
        }
        if (existing.locked) {
          return { success: false, state, error: `Series ${op.seriesId} is locked` }
        }
        // Check for child links (RESTRICT by default)
        for (const [childId, link] of newState.links) {
          if (link.parentSeriesId === op.seriesId) {
            return { success: false, state, error: `Series has linked children` }
          }
        }
        // Check for completions (RESTRICT by default)
        for (const completion of newState.completions.values()) {
          if (completion.seriesId === op.seriesId) {
            return { success: false, state, error: `Series has completions` }
          }
        }
        newState.series.delete(op.seriesId)
        // Cascade delete related entities
        newState.links.delete(op.seriesId)
        newState.seriesTags.delete(op.seriesId)
        newState.cyclingConfigs.delete(op.seriesId)
        newState.adaptiveDurations.delete(op.seriesId)
        newState.reminders.delete(op.seriesId)
        newState.wiggleConfigs.delete(op.seriesId)
        return { success: true, state: newState }
      }

      case 'lockSeries': {
        const existing = newState.series.get(op.seriesId)
        if (!existing) {
          return { success: false, state, error: `Series ${op.seriesId} not found` }
        }
        newState.series.set(op.seriesId, { ...existing, locked: true })
        return { success: true, state: newState }
      }

      case 'unlockSeries': {
        const existing = newState.series.get(op.seriesId)
        if (!existing) {
          return { success: false, state, error: `Series ${op.seriesId} not found` }
        }
        newState.series.set(op.seriesId, { ...existing, locked: false })
        return { success: true, state: newState }
      }

      case 'splitSeries': {
        const existing = newState.series.get(op.seriesId)
        if (!existing) {
          return { success: false, state, error: `Series ${op.seriesId} not found` }
        }
        if (existing.locked) {
          return { success: false, state, error: `Series ${op.seriesId} is locked` }
        }
        // Create new series with split date as start
        const newId = `series-${Date.now()}-${Math.random().toString(36).slice(2)}` as SeriesId
        const newSeries: Series = {
          ...existing,
          id: newId,
          bounds: { ...existing.bounds, startDate: op.splitDate },
        }
        newState.series.set(newId, newSeries)
        // Update original series with end date
        newState.series.set(op.seriesId, {
          ...existing,
          bounds: { ...existing.bounds, endDate: op.splitDate },
        })
        return { success: true, state: newState, createdId: newId }
      }

      case 'logCompletion': {
        const existing = newState.series.get(op.seriesId)
        if (!existing) {
          return { success: false, state, error: `Series ${op.seriesId} not found` }
        }
        const id = `completion-${Date.now()}-${Math.random().toString(36).slice(2)}` as CompletionId
        const completion: Completion = {
          id,
          seriesId: op.seriesId,
          instanceDate: op.instanceDate,
          startTime: op.startTime,
          endTime: op.endTime,
          actualDuration: Math.round(
            (new Date(op.endTime).getTime() - new Date(op.startTime).getTime()) / (1000 * 60)
          ) as Duration,
          notes: op.notes,
        }
        newState.completions.set(id, completion)
        return { success: true, state: newState, createdId: id }
      }

      case 'deleteCompletion': {
        if (!newState.completions.has(op.completionId)) {
          return { success: false, state, error: `Completion ${op.completionId} not found` }
        }
        newState.completions.delete(op.completionId)
        return { success: true, state: newState }
      }

      case 'cancelInstance': {
        const key = `${op.seriesId}:${op.instanceDate}`
        const existing = newState.instanceExceptions.get(key)
        if (existing?.type === 'cancelled') {
          return { success: false, state, error: `Instance already cancelled` }
        }
        newState.instanceExceptions.set(key, {
          type: 'cancelled',
          seriesId: op.seriesId,
          instanceDate: op.instanceDate,
        })
        return { success: true, state: newState }
      }

      case 'restoreInstance': {
        const key = `${op.seriesId}:${op.instanceDate}`
        const existing = newState.instanceExceptions.get(key)
        if (existing?.type !== 'cancelled') {
          return { success: false, state, error: `Instance not cancelled` }
        }
        newState.instanceExceptions.delete(key)
        return { success: true, state: newState }
      }

      case 'rescheduleInstance': {
        const key = `${op.seriesId}:${op.instanceDate}`
        const existing = newState.instanceExceptions.get(key)
        if (existing?.type === 'cancelled') {
          return { success: false, state, error: `Cannot reschedule cancelled instance` }
        }
        newState.instanceExceptions.set(key, {
          type: 'rescheduled',
          seriesId: op.seriesId,
          instanceDate: op.instanceDate,
          newTime: op.newTime,
        })
        return { success: true, state: newState }
      }

      case 'linkSeries': {
        // Check both series exist
        if (!newState.series.has(op.parentSeriesId)) {
          return { success: false, state, error: `Parent series ${op.parentSeriesId} not found` }
        }
        if (!newState.series.has(op.childSeriesId)) {
          return { success: false, state, error: `Child series ${op.childSeriesId} not found` }
        }
        // Check for cycle
        let current: SeriesId | undefined = op.parentSeriesId
        while (current) {
          if (current === op.childSeriesId) {
            return { success: false, state, error: `Would create cycle` }
          }
          current = newState.links.get(current)?.parentSeriesId
        }
        // Check depth limit (max chain depth is 32 nodes, meaning max 31 links)
        let depth = 0
        current = op.parentSeriesId
        while (current && newState.links.has(current)) {
          depth++
          if (depth >= 31) {
            return { success: false, state, error: `Chain depth would exceed 32` }
          }
          current = newState.links.get(current)?.parentSeriesId
        }
        newState.links.set(op.childSeriesId, {
          parentSeriesId: op.parentSeriesId,
          childSeriesId: op.childSeriesId,
          targetDistance: op.targetDistance,
          earlyWobble: op.earlyWobble,
          lateWobble: op.lateWobble,
        })
        return { success: true, state: newState }
      }

      case 'unlinkSeries': {
        if (!newState.links.has(op.childSeriesId)) {
          return { success: false, state, error: `No link found for ${op.childSeriesId}` }
        }
        newState.links.delete(op.childSeriesId)
        return { success: true, state: newState }
      }

      case 'addConstraint': {
        const id = `constraint-${Date.now()}-${Math.random().toString(36).slice(2)}` as ConstraintId
        const constraint: RelationalConstraint = { ...op.constraint, id }
        newState.constraints.set(id, constraint)
        return { success: true, state: newState, createdId: id }
      }

      case 'removeConstraint': {
        if (!newState.constraints.has(op.constraintId)) {
          return { success: false, state, error: `Constraint ${op.constraintId} not found` }
        }
        newState.constraints.delete(op.constraintId)
        return { success: true, state: newState }
      }

      case 'addTag': {
        const existing = newState.series.get(op.seriesId)
        if (!existing) {
          return { success: false, state, error: `Series ${op.seriesId} not found` }
        }
        const tags = newState.seriesTags.get(op.seriesId) ?? new Set()
        tags.add(op.tag)
        newState.seriesTags.set(op.seriesId, tags)
        return { success: true, state: newState }
      }

      case 'removeTag': {
        const tags = newState.seriesTags.get(op.seriesId)
        if (!tags?.has(op.tag)) {
          return { success: false, state, error: `Tag not found on series` }
        }
        tags.delete(op.tag)
        return { success: true, state: newState }
      }

      case 'acknowledgeReminder': {
        // Acknowledgement is idempotent - just return success
        return { success: true, state: newState }
      }

      default: {
        const _exhaustive: never = op
        return { success: false, state, error: `Unknown operation type` }
      }
    }
  } catch (e) {
    return { success: false, state, error: String(e) }
  }
}
