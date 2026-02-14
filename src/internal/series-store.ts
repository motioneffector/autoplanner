/**
 * Series Store
 *
 * Stateful series management. Owns seriesCache and tagCache.
 * Handles CRUD, tag management, and adapter persistence.
 */

import type { LocalDate, LocalDateTime } from '../time-date'
import { makeDate, makeTime, makeDateTime } from '../time-date'
import type { Adapter } from '../adapter'
import { persistConditionTree } from '../series-assembly'
import {
  ValidationError, NotFoundError, LockedSeriesError,
  CompletionsExistError, LinkedChildrenExistError,
} from '../errors'
import type { FullSeries, EnrichedPattern, CreateSeriesInput, CyclingInput } from '../public-api'
import type { SeriesReader, CompletionReader, LinkReader } from './types'
import { uuid } from './helpers'

type SeriesStoreDeps = {
  adapter: Adapter
  persistNewSeries: (data: FullSeries) => Promise<void>
  loadFullSeries: (id: string) => Promise<FullSeries | null>
  loadAllFullSeries: () => Promise<FullSeries[]>
}

export function createSeriesStore(deps: SeriesStoreDeps) {
  const { adapter, persistNewSeries, loadFullSeries, loadAllFullSeries } = deps

  const seriesCache = new Map<string, FullSeries>()
  const tagCache = new Map<string, string[]>()

  // ========== Reader ==========

  const reader: SeriesReader = {
    get(id: string): FullSeries | undefined {
      const s = seriesCache.get(id)
      return s ? { ...s } : undefined
    },
    getAll(): FullSeries[] {
      return [...seriesCache.values()].map(s => ({ ...s }))
    },
    getByTag(tag: string): string[] {
      return [...(tagCache.get(tag) || [])]
    },
  }

  // ========== Cache-aware loading ==========

  async function getFullSeries(id: string): Promise<FullSeries | null> {
    if (seriesCache.has(id)) return { ...seriesCache.get(id)! }
    return loadFullSeries(id)
  }

  async function updatePersistedSeries(id: string, changes: Record<string, unknown>): Promise<void> {
    await adapter.updateSeries(id, changes)
  }

  // ========== CRUD ==========

  async function create(input: CreateSeriesInput): Promise<string> {
    if (!input.title || input.title.trim() === '') {
      throw new ValidationError('Series title is required')
    }
    if (input.endDate != null && input.startDate != null &&
        (input.endDate as string) <= (input.startDate as string)) {
      throw new ValidationError('endDate must be > startDate (exclusive)')
    }

    const id = uuid()
    const now = makeDateTime(
      makeDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()),
      makeTime(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds())
    )

    const seriesData: FullSeries = {
      id,
      title: input.title,
      patterns: (input.patterns || []) as EnrichedPattern[],
      locked: false,
      createdAt: now,
      updatedAt: now,
      ...(input.tags != null ? { tags: input.tags } : {}),
      ...(input.startDate != null ? { startDate: input.startDate } : {}),
      ...(input.endDate != null ? { endDate: input.endDate } : {}),
      ...(input.cycling != null ? { cycling: input.cycling } : {}),
      ...(input.adaptiveDuration != null ? { adaptiveDuration: input.adaptiveDuration } : {}),
    }

    await persistNewSeries(seriesData)
    seriesCache.set(id, { ...seriesData })

    if (input.tags && Array.isArray(input.tags)) {
      for (const tag of input.tags) {
        if (!tagCache.has(tag)) tagCache.set(tag, [])
        tagCache.get(tag)!.push(id)
      }
    }

    return id
  }

  async function getAllSeries(): Promise<FullSeries[]> {
    const all = await loadAllFullSeries()
    return all.filter(s => s && s.id).map(s => ({ ...s }))
  }

  async function getSeriesByTag(tag: string): Promise<FullSeries[]> {
    const all = await getAllSeries()
    return all.filter(s => s.tags && s.tags.includes(tag))
  }

  async function update(id: string, changes: Partial<CreateSeriesInput>): Promise<void> {
    const s = await getFullSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)
    if (s.locked) throw new LockedSeriesError(`Series ${id} is locked`)

    const updated = { ...s, ...changes, id: s.id, createdAt: s.createdAt }
    updated.updatedAt = makeDateTime(
      makeDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()),
      makeTime(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds())
    )

    await updatePersistedSeries(id, {
      ...(changes.title != null ? { title: changes.title } : {}),
      ...(changes.startDate != null ? { startDate: changes.startDate } : {}),
      ...(changes.endDate != null ? { endDate: changes.endDate } : {}),
      updatedAt: updated.updatedAt,
    })

    if (changes.patterns != null) {
      const oldConditions = await adapter.getConditionsBySeries(id)
      for (const c of oldConditions) await adapter.deleteCondition(c.id)
      const oldPatterns = await adapter.getPatternsBySeries(id)
      for (const p of oldPatterns) await adapter.deletePattern(p.id)
      for (const p of changes.patterns) {
        let condId: string | null = null
        if (p.condition) {
          condId = await persistConditionTree(adapter, id, p.condition, null)
        }
        const patternId = crypto.randomUUID()
        await adapter.createPattern({
          id: patternId,
          seriesId: id,
          type: p.type,
          conditionId: condId,
          ...(p.time != null ? { time: p.time } : {}),
          ...(p.n != null ? { n: p.n } : {}),
          ...(p.day != null ? { day: p.day } : {}),
          ...(p.month != null ? { month: p.month } : {}),
          ...(p.weekday != null ? { weekday: p.weekday } : {}),
          ...(p.allDay != null ? { allDay: p.allDay } : {}),
          ...(p.duration != null ? { duration: p.duration } : {}),
          ...(p.fixed != null ? { fixed: p.fixed } : {}),
        })
        if (p.daysOfWeek && Array.isArray(p.daysOfWeek)) {
          await adapter.setPatternWeekdays(patternId, p.daysOfWeek.map(String))
        }
      }
    }

    if (changes.tags != null) {
      const oldTags = (s.tags || []) as string[]
      const newTags = changes.tags
      for (const tag of oldTags) {
        if (!newTags.includes(tag)) {
          await adapter.removeTagFromSeries(id, tag)
          const cached = tagCache.get(tag)
          if (cached) {
            const idx = cached.indexOf(id)
            if (idx >= 0) cached.splice(idx, 1)
            if (cached.length === 0) tagCache.delete(tag)
          }
        }
      }
      for (const tag of newTags) {
        if (!oldTags.includes(tag)) {
          await adapter.addTagToSeries(id, tag)
          if (!tagCache.has(tag)) tagCache.set(tag, [])
          if (!tagCache.get(tag)!.includes(id)) tagCache.get(tag)!.push(id)
        }
      }
    }

    if (changes.cycling != null) {
      await adapter.setCyclingConfig(id, {
        seriesId: id,
        currentIndex: changes.cycling.currentIndex ?? 0,
        gapLeap: changes.cycling.gapLeap ?? false,
        ...(changes.cycling.mode != null ? { mode: changes.cycling.mode } : {}),
      })
      const items = changes.cycling.items && Array.isArray(changes.cycling.items)
        ? changes.cycling.items
        : []
      await adapter.setCyclingItems(id,
        items.map((title: string, i: number) => ({
          seriesId: id,
          position: i,
          title,
          duration: 0,
        }))
      )
    }

    if (changes.adaptiveDuration != null) {
      await adapter.setAdaptiveDuration(id, {
        seriesId: id,
        ...changes.adaptiveDuration,
      } as import('../adapter').AdaptiveDurationConfig)
    }

    seriesCache.set(id, { ...updated } as FullSeries)
  }

  async function lock(id: string): Promise<void> {
    const s = await getFullSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)
    await updatePersistedSeries(id, { locked: true })
    if (seriesCache.has(id)) seriesCache.set(id, { ...seriesCache.get(id)!, locked: true })
  }

  async function unlock(id: string): Promise<void> {
    const s = await getFullSeries(id)
    if (!s) throw new NotFoundError(`Series ${id} not found`)
    await updatePersistedSeries(id, { locked: false })
    if (seriesCache.has(id)) seriesCache.set(id, { ...seriesCache.get(id)!, locked: false })
  }

  async function deleteSeries(id: string): Promise<void> {
    await adapter.deleteSeries(id)
    seriesCache.delete(id)
  }

  // ========== Hydration ==========

  async function hydrate(): Promise<void> {
    const allSeries = await loadAllFullSeries()
    for (const s of allSeries) {
      seriesCache.set(s.id, { ...s })
      if (s.tags && Array.isArray(s.tags)) {
        for (const tag of s.tags) {
          if (!tagCache.has(tag)) tagCache.set(tag, [])
          if (!tagCache.get(tag)!.includes(s.id)) {
            tagCache.get(tag)!.push(s.id)
          }
        }
      }
    }
  }

  // ========== Split helpers ==========

  function setCached(id: string, series: FullSeries): void {
    seriesCache.set(id, { ...series })
  }

  function addToTagCache(id: string, tags: string[]): void {
    for (const tag of tags) {
      if (!tagCache.has(tag)) tagCache.set(tag, [])
      if (!tagCache.get(tag)!.includes(id)) tagCache.get(tag)!.push(id)
    }
  }

  return {
    reader,
    getFullSeries,
    create,
    getAllSeries,
    getSeriesByTag,
    update,
    lock,
    unlock,
    delete: deleteSeries,
    hydrate,
    updatePersistedSeries,
    persistNewSeries,
    setCached,
    addToTagCache,
  }
}
