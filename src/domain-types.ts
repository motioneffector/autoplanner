/**
 * Canonical Domain Types
 *
 * Single source of truth for all business entity types. These sit between
 * adapter storage types (flat, nullable, string-typed) and public API types
 * (input-oriented, consumer-facing). Domain modules import from here rather
 * than defining their own copies.
 */

import type { LocalDate, LocalDateTime } from './time-date'

// ============================================================================
// Shared Discriminated Unions
// ============================================================================

/** Target for completion queries and constraints — identifies a series or tag */
export type Target =
  | { type: 'seriesId'; seriesId: string }
  | { type: 'tag'; tag: string }

// ============================================================================
// Condition Tree
// ============================================================================

type Operator = '>=' | '>' | '<=' | '<' | '==' | '!='

/** Recursive condition tree used for pattern gating */
export type ConditionTree =
  | { type: 'count'; target: Target; operator: Operator; value: number; windowDays: number }
  | { type: 'daysSince'; target: Target; operator: Operator; value: number }
  | { type: 'and'; conditions: ConditionTree[] }
  | { type: 'or'; conditions: ConditionTree[] }
  | { type: 'not'; condition: ConditionTree }

// ============================================================================
// Domain Entities
// ============================================================================

export type DomainCompletion = {
  id: string
  seriesId: string
  date: LocalDate
  instanceDate: LocalDate
  startTime?: LocalDateTime
  endTime?: LocalDateTime
  durationMinutes?: number
  createdAt: string
}

export type DomainLink = {
  id: string
  parentSeriesId: string
  childSeriesId: string
  targetDistance: number
  earlyWobble: number
  lateWobble: number
}

export type DomainReminder = {
  id: string
  seriesId: string
  minutesBefore: number
  tag: string
}

export type PendingReminder = {
  reminderId: string
  seriesId: string
  instanceDate: LocalDate
  tag: string
}

export type DomainException = {
  id: string
  seriesId: string
  instanceDate: LocalDate
  type: 'cancelled' | 'rescheduled'
  newTime?: LocalDateTime
}

export type Constraint = {
  id: string
  type: string
  source: Target
  dest: Target
  withinMinutes?: number
}

export type ConstraintViolation = {
  sourceInstance: string
  destInstance: string
  description: string
  date: LocalDate
}
