/**
 * @motioneffector/autoplanner
 *
 * Public API exports
 */

// Error system (canonical source — base class, codes, all error classes)
export {
  AutoplannerError, AutoplannerErrorCode,
  DuplicateKeyError, NotFoundError, ForeignKeyError, InvalidDataError,
  ValidationError, LockedSeriesError, CompletionsExistError, LinkedChildrenExistError,
  NonExistentInstanceError, AlreadyCancelledError, CancelledInstanceError,
  CycleDetectedError, ChainDepthExceededError, DuplicateCompletionError,
  ParseError, InvalidPatternError, InvalidRangeError, InvalidConditionError,
} from './errors'
export type { AutoplannerErrorCode as AutoplannerErrorCodeType } from './errors'

// Result type
export type { Result } from './result'
export { Ok, Err } from './result'

// Time & Date (canonical source — branded types + utilities)
export type { LocalDate, LocalTime, LocalDateTime, Weekday } from './time-date'
export {
  isLeapYear, daysInMonth, daysInYear,
  parseDate, parseTime, parseDateTime,
  makeDate, makeTime, makeDateTime,
  yearOf, monthOf, dayOf, hourOf, minuteOf, secondOf, dateOf, timeOf,
  formatDate, formatTime, formatDateTime,
  addDays, daysBetween, addMinutes, minutesBetween,
  dayOfWeek, weekdayToIndex, indexToWeekday,
  compareDates, compareTimes, compareDateTimes,
  dateEquals, dateBefore, dateAfter,
  toLocal, toUTC, isDSTAt,
} from './time-date'

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
export { createMockAdapter } from './adapter'

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

// Reflow (CSP solver — public interface only; internals accessed via src/reflow directly)
export type {
  Instance, ReflowInput, Domain, Assignment,
  ConflictType, ReflowOutput,
} from './reflow'
export type { Conflict as ReflowConflict } from './reflow'
export { reflow, generateInstances } from './reflow'

// High-level API (wraps all modules into a stateful planner object)
export type {
  Autoplanner, AutoplannerConfig, Schedule,
  ScheduleInstance, PendingReminder,
} from './public-api'
export type { Conflict } from './public-api'
export { createAutoplanner } from './public-api'
