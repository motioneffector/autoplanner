/**
 * @motioneffector/autoplanner
 *
 * Public API exports
 */

// Result type
export type { Result } from './result'
export { Ok, Err } from './result'

// Time & Date (canonical source — branded types + utilities)
export * from './time-date'

// Branded ID types
export type { Duration } from './core'
export type {
  SeriesId, PatternId, ConditionId, CompletionId,
  ReminderId, LinkId, ConstraintId,
  CyclingConfig, CyclingItem,
} from './types'

// Pattern expansion
export type { Pattern, DateRange } from './pattern-expansion'
export {
  expandPattern,
  daily, everyNDays, weekly, everyNWeeks, monthly, lastDayOfMonth,
  yearly, weekdays, weekdaysOnly, weekendsOnly,
  nthWeekdayOfMonth, lastWeekdayOfMonth, nthToLastWeekdayOfMonth,
  unionPatterns, exceptPatterns,
  InvalidPatternError, InvalidRangeError,
} from './pattern-expansion'

// Adapter (persistence interface + in-memory mock)
export type {
  Adapter,
  Series as AdapterSeries,
  Pattern as AdapterPattern,
  Condition as AdapterCondition,
  Completion as AdapterCompletion,
  InstanceException, AdaptiveDurationConfig,
  CyclingConfig as AdapterCyclingConfig,
  CyclingItem as AdapterCyclingItem,
  Reminder, ReminderAck, RelationalConstraint, Link, Tag,
} from './adapter'
export {
  createMockAdapter,
  DuplicateKeyError, ForeignKeyError, InvalidDataError,
} from './adapter'

// SQLite adapter
export { createSqliteAdapter } from './sqlite-adapter'

// Series CRUD
export type {
  SeriesInput, SeriesUpdate, Series,
  CrudResult, AdaptiveDurationInput,
} from './series-crud'
export {
  createSeries, getSeries, getSeriesByTag, getAllSeries,
  updateSeries, deleteSeries, lockSeries, unlockSeries, splitSeries,
  addTagToSeries, removeTagFromSeries, getTagsForSeries,
  ValidationError, NotFoundError, LockedSeriesError,
  CompletionsExistError, LinkedChildrenExistError,
} from './series-crud'

// Cycling
export {
  getCyclingItem, advanceCycling, resetCycling,
  resolveInstanceTitle, getInstanceNumber,
} from './cycling'

// Relational constraints
export type { ConstraintTarget, Constraint, ConstraintViolation } from './relational-constraints'
export {
  addConstraint, getConstraint, getAllConstraints, deleteConstraint,
  resolveTarget, checkConstraint, getConstraintViolations,
} from './relational-constraints'

// Reflow (CSP solver)
export type {
  Instance, ReflowInput, Domain, Assignment,
  ConflictType, ReflowOutput,
} from './reflow'
export type { Conflict as ReflowConflict } from './reflow'
export {
  reflow, generateInstances, computeDomains, propagateConstraints,
  backtrackSearch, handleNoSolution, checkNoOverlap, checkChainConstraint,
  calculateWorkloadScore,
} from './reflow'

// High-level API (wraps all modules into a stateful planner object)
export type {
  Autoplanner, AutoplannerConfig, Schedule,
  ScheduleInstance, PendingReminder,
} from './public-api'
export type { Conflict } from './public-api'
export { createAutoplanner } from './public-api'
