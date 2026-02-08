/**
 * Completion Store
 *
 * Formalized interface for derived completion queries. These are computed from
 * base adapter CRUD (getCompletionsBySeries, getAllCompletions) rather than
 * being adapter methods themselves. This keeps the Adapter interface focused on
 * primitive storage operations.
 *
 * The completions module (completions.ts) provides the implementation via
 * its exported functions. This file defines the canonical interface and
 * the factory function that bridges to those implementations.
 */

import type { Adapter } from './adapter'
import type { LocalDate } from './time-date'
import { makeDate } from './time-date'
import type { Target, DomainCompletion } from './domain-types'
import {
  countCompletionsInWindow,
  daysSinceLastCompletion,
  getDurationsForAdaptive,
  getCompletionsByTarget,
  getLastCompletion,
} from './completions'

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

/**
 * Create a CompletionStore backed by an adapter.
 * Bridges the CompletionStore interface to the standalone functions in completions.ts.
 */
export function createCompletionStore(adapter: Adapter): CompletionStore {
  return {
    countInWindow(target, windowDays, asOf) {
      return countCompletionsInWindow(adapter, { target, windowDays, asOf })
    },

    daysSinceLast(target, asOf) {
      return daysSinceLastCompletion(adapter, { target, asOf })
    },

    getRecentDurations(seriesId, options) {
      if ('lastN' in options) {
        return getDurationsForAdaptive(adapter, {
          seriesId,
          mode: { type: 'lastN', n: options.lastN },
          asOf: makeDate(9999, 12, 31),
        })
      }
      return getDurationsForAdaptive(adapter, {
        seriesId,
        mode: { type: 'windowDays', days: options.windowDays },
        asOf: options.asOf,
      })
    },

    getCompletionsInWindow(target, windowDays, asOf) {
      return getCompletionsByTarget(adapter, { target, windowDays, asOf })
    },

    getLastCompletion(target) {
      return getLastCompletion(adapter, { target })
    },
  }
}
