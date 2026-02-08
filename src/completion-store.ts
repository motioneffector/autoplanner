/**
 * Completion Store
 *
 * Formalized interface for derived completion queries. These are computed from
 * base adapter CRUD (getCompletionsBySeries, getAllCompletions) rather than
 * being adapter methods themselves. This keeps the Adapter interface focused on
 * primitive storage operations.
 *
 * The completions module (completions.ts) provides the implementation via
 * its exported functions. This file defines the canonical interface.
 */

import type { LocalDate } from './time-date'
import type { Target, DomainCompletion } from './domain-types'

/** Derived completion query interface */
export type CompletionStore = {
  /** Count completions for a target within a time window */
  countInWindow(target: Target, windowDays: number, asOf: LocalDate): Promise<number>

  /** Days since the most recent completion for a target, or null if none */
  daysSinceLast(target: Target, asOf: LocalDate): Promise<number | null>

  /** Recent completion durations for adaptive duration calculations */
  getRecentDurations(seriesId: string, options: { lastN: number } | { windowDays: number; asOf: LocalDate }): Promise<number[]>

  /** All completions for a target within a time window */
  getCompletionsInWindow(target: Target, windowDays: number, asOf: LocalDate): Promise<DomainCompletion[]>

  /** Most recent completion for a target, or null if none */
  getLastCompletion(target: Target): Promise<DomainCompletion | null>
}
