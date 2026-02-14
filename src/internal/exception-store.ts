/**
 * Exception Store
 *
 * Stateful exception management. Owns the exceptions Map.
 * Handles storage and retrieval of cancellation/rescheduling exceptions.
 *
 * Intentionally thin — business logic for cancelInstance/rescheduleInstance
 * stays in the orchestrator because it crosses domain boundaries.
 */

import type { Adapter } from '../adapter'
import type { ExceptionReader, InternalException } from './types'

type ExceptionStoreDeps = {
  adapter: Adapter
}

export function createExceptionStore(deps: ExceptionStoreDeps) {
  const { adapter } = deps

  const exceptions = new Map<string, InternalException>()

  // ========== Reader ==========

  const reader: ExceptionReader = {
    getByKey(key: string): InternalException | undefined {
      const e = exceptions.get(key)
      return e ? { ...e } : undefined
    },
  }

  // ========== Operations ==========

  function set(key: string, exception: InternalException): void {
    exceptions.set(key, exception)
  }

  function getByKey(key: string): InternalException | undefined {
    return exceptions.get(key)
  }

  function entries(): Iterable<[string, InternalException]> {
    return exceptions.entries()
  }

  // ========== Hydration ==========

  async function hydrate(): Promise<void> {
    const allExceptions = await adapter.getAllExceptions()
    for (const e of allExceptions) {
      const key = `${e.seriesId}:${e.originalDate}`
      if (!exceptions.has(key)) {
        exceptions.set(key, {
          seriesId: e.seriesId,
          date: e.originalDate,
          type: e.type as 'cancelled' | 'rescheduled',
          ...(e.newTime != null ? { newTime: e.newTime } : {}),
        })
      }
    }
  }

  return {
    reader,
    set,
    getByKey,
    entries,
    hydrate,
  }
}
