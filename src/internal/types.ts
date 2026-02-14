/**
 * Internal Types
 *
 * Shared type definitions for stateful internal modules.
 * Reader interfaces for cross-module synchronous state access.
 */

import type { LocalDate, LocalDateTime } from '../time-date'
import type {
  FullSeries, StoredConstraint, ConstraintInput, ConditionNode,
} from '../public-api'

// ============================================================================
// Internal State Types
// ============================================================================

export type InternalCompletion = {
  id: string
  seriesId: string
  date: LocalDate
  instanceDate: LocalDate
  startTime?: LocalDateTime
  endTime?: LocalDateTime
}

export type InternalException = {
  seriesId: string
  date: LocalDate
  type: 'cancelled' | 'rescheduled'
  newTime?: LocalDateTime
}

export type InternalLink = {
  parentId: string
  childId: string
  distance: number
  earlyWobble?: number
  lateWobble?: number
}

export type InternalReminder = {
  id: string
  seriesId: string
  type: string
  offset?: number
}

// ============================================================================
// Invalidation Scope
// ============================================================================

export type InvalidationScope = {
  type: 'series'; seriesId: string
} | {
  type: 'global'
} | {
  type: 'link' | 'constraint' | 'exception' | 'completion'
}

// ============================================================================
// Reader Interfaces
// ============================================================================

export type SeriesReader = {
  get(id: string): FullSeries | undefined
  getAll(): FullSeries[]
  getByTag(tag: string): string[]
}

export type CompletionReader = {
  get(id: string): InternalCompletion | undefined
  getBySeriesId(seriesId: string): string[]
  hasCompletionForKey(seriesId: string, date: LocalDate): boolean
}

export type ExceptionReader = {
  getByKey(key: string): InternalException | undefined
}

export type LinkReader = {
  get(childId: string): InternalLink | undefined
  getByParent(parentId: string): string[]
  entries(): Iterable<[string, InternalLink]>
}

export type ConstraintReader = {
  getAll(): StoredConstraint[]
  entries(): Iterable<[string, StoredConstraint]>
}

export type ReminderReader = {
  get(id: string): InternalReminder | undefined
  getBySeriesId(seriesId: string): string[]
}

// Re-export for convenience
export type {
  FullSeries, StoredConstraint, ConstraintInput, ConditionNode,
}
