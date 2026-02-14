/**
 * Completion Tracker
 *
 * Stateful completion management. Owns completions, completionsByKey, and completionsBySeries.
 * Handles logging, querying, deletion, and adapter persistence.
 */

import type { LocalDate, LocalDateTime } from '../time-date'
import { addDays } from '../time-date'
import type { Adapter, Completion } from '../adapter'
import { ValidationError, NotFoundError, DuplicateCompletionError } from '../errors'
import type { CompletionReader, InternalCompletion, SeriesReader } from './types'
import { uuid } from './helpers'

type LogCompletionOptions = {
  startTime?: LocalDateTime
  endTime?: LocalDateTime
}

type CompletionTrackerDeps = {
  adapter: Adapter
  seriesReader: SeriesReader
}

export function createCompletionTracker(deps: CompletionTrackerDeps) {
  const { adapter, seriesReader } = deps

  const completions = new Map<string, InternalCompletion>()
  const completionsByKey = new Map<string, string>()
  const completionsBySeries = new Map<string, string[]>()

  // ========== Reader ==========

  const reader: CompletionReader = {
    get(id: string): InternalCompletion | undefined {
      const c = completions.get(id)
      return c ? { ...c } : undefined
    },
    getBySeriesId(seriesId: string): string[] {
      return [...(completionsBySeries.get(seriesId) || [])]
    },
    hasCompletionForKey(seriesId: string, date: LocalDate): boolean {
      return completionsByKey.has(`${seriesId}:${date}`)
    },
  }

  // ========== Operations ==========

  async function log(seriesId: string, date: LocalDate, options?: LogCompletionOptions): Promise<string> {
    const s = seriesReader.get(seriesId)
    if (!s) throw new NotFoundError(`Series ${seriesId} not found`)

    const key = `${seriesId}:${date}`
    if (completionsByKey.has(key)) {
      throw new DuplicateCompletionError(`Completion already exists for ${seriesId} on ${date}`)
    }

    const id = uuid()
    const completion: InternalCompletion = {
      id,
      seriesId,
      date,
      instanceDate: date,
      ...(options?.startTime != null ? { startTime: options.startTime } : {}),
      ...(options?.endTime != null ? { endTime: options.endTime } : {}),
    }

    completions.set(id, completion)
    completionsByKey.set(key, id)
    if (!completionsBySeries.has(seriesId)) completionsBySeries.set(seriesId, [])
    completionsBySeries.get(seriesId)!.push(id)

    await adapter.createCompletion({
      id,
      seriesId,
      instanceDate: date,
      date,
      ...(options?.startTime != null ? { startTime: options.startTime } : {}),
      ...(options?.endTime != null ? { endTime: options.endTime } : {}),
    })
    return id
  }

  async function getCompletions(seriesId: string): Promise<Completion[]> {
    const fromAdapter = await adapter.getCompletionsBySeries(seriesId)
    if (fromAdapter && fromAdapter.length > 0) return fromAdapter
    const ids = completionsBySeries.get(seriesId) || []
    return ids.map(id => completions.get(id)).filter((c): c is InternalCompletion => c != null) as Completion[]
  }

  async function deleteCompletion(id: string): Promise<void> {
    const completion = completions.get(id)
    if (completion) {
      const key = `${completion.seriesId}:${completion.date}`
      completionsByKey.delete(key)
      const seriesIds = completionsBySeries.get(completion.seriesId)
      if (seriesIds) {
        const idx = seriesIds.indexOf(id)
        if (idx >= 0) seriesIds.splice(idx, 1)
      }
      completions.delete(id)
      await adapter.deleteCompletion(id)
    }
  }

  function countInWindow(seriesId: string, windowDays: number, asOf: LocalDate): number {
    const windowStart = addDays(asOf, -(windowDays - 1))
    let count = 0
    const ids = completionsBySeries.get(seriesId) || []
    for (const id of ids) {
      const c = completions.get(id)
      if (!c) continue
      const d = c.date as string
      if (d >= (windowStart as string) && d <= (asOf as string)) count++
    }
    return count
  }

  function getLastDate(seriesId: string): LocalDate | null {
    const ids = completionsBySeries.get(seriesId) || []
    let latest: string | null = null
    for (const id of ids) {
      const c = completions.get(id)
      if (!c) continue
      const d = c.date as string
      if (latest === null || d > latest) latest = d
    }
    return latest as LocalDate | null
  }

  function getFirstDate(seriesId: string): LocalDate | null {
    const ids = completionsBySeries.get(seriesId) || []
    let earliest: string | null = null
    for (const id of ids) {
      const c = completions.get(id)
      if (!c) continue
      const d = c.date as string
      if (earliest === null || d < earliest) earliest = d
    }
    return earliest as LocalDate | null
  }

  // ========== Hydration ==========

  async function hydrate(): Promise<void> {
    const allComps = await adapter.getAllCompletions()
    for (const c of allComps) {
      if (!completions.has(c.id)) {
        completions.set(c.id, c)
        const dateKey = `${c.seriesId}:${c.date ?? c.instanceDate}`
        completionsByKey.set(dateKey, c.id)
        if (!completionsBySeries.has(c.seriesId)) completionsBySeries.set(c.seriesId, [])
        if (!completionsBySeries.get(c.seriesId)!.includes(c.id)) {
          completionsBySeries.get(c.seriesId)!.push(c.id)
        }
      }
    }
  }

  return {
    reader,
    log,
    getCompletions,
    deleteCompletion,
    countInWindow,
    getLastDate,
    getFirstDate,
    hydrate,
  }
}
