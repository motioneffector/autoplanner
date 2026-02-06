/**
 * Core Branded Types
 *
 * Re-exports all branded primitive types from their source modules
 * into a single barrel for convenient importing.
 */

export type { LocalDate, LocalTime, LocalDateTime, Weekday } from './time-date'
export type { SeriesId, PatternId, ConditionId, CompletionId, ReminderId, LinkId, ConstraintId } from './types'

declare const __duration: unique symbol
export type Duration = number & { readonly [__duration]: true }
