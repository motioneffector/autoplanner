/**
 * Shared Types
 *
 * Re-exports branded types from time-date and defines domain ID types
 * used across multiple modules.
 */

export type { LocalDate, LocalTime, LocalDateTime, Weekday } from './time-date'

// ============================================================================
// Branded ID Types
// ============================================================================

declare const __seriesId: unique symbol
declare const __completionId: unique symbol
declare const __reminderId: unique symbol
declare const __linkId: unique symbol
declare const __constraintId: unique symbol
declare const __patternId: unique symbol
declare const __conditionId: unique symbol

export type SeriesId = string & { readonly [__seriesId]: true }
export type CompletionId = string & { readonly [__completionId]: true }
export type ReminderId = string & { readonly [__reminderId]: true }
export type LinkId = string & { readonly [__linkId]: true }
export type ConstraintId = string & { readonly [__constraintId]: true }
export type PatternId = string & { readonly [__patternId]: true }
export type ConditionId = string & { readonly [__conditionId]: true }

// ============================================================================
// Domain Types
// ============================================================================

/** Domain-level cycling config (used by cycling module + tests) */
export type CyclingConfig = {
  items: string[]
  mode: 'sequential' | 'random'
  gapLeap: boolean
  currentIndex?: number
}

/** Adapter-level cycling item row (used by persistence) */
export type CyclingItem = {
  seriesId: string
  position: number
  title: string
  duration: number
}
