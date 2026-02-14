/**
 * Link Manager
 *
 * Stateful link management. Owns links and linksByParent Maps.
 * Handles linking, unlinking, chain depth, parent end time computation,
 * and split-copy operations.
 *
 * Cross-module reads happen via injected reader interfaces.
 * triggerReflow is NOT called here — the orchestrator handles that.
 */

import type { LocalDate, LocalTime, LocalDateTime } from '../time-date'
import { makeDateTime } from '../time-date'
import type { Adapter } from '../adapter'
import { NotFoundError, CycleDetectedError, ChainDepthExceededError } from '../errors'
import type { FullSeries, LinkOptions } from '../public-api'
import type { LinkReader, CompletionReader, ExceptionReader, InternalLink } from './types'
import { uuid, normalizeTime, resolveTimeForDate, addMinutesToTime } from './helpers'

type LinkManagerDeps = {
  adapter: Adapter
  getFullSeries: (id: string) => Promise<FullSeries | null>
  completionReader: CompletionReader
  exceptionReader: ExceptionReader
  timezone: string
}

export function createLinkManager(deps: LinkManagerDeps) {
  const { adapter, getFullSeries, completionReader, exceptionReader, timezone } = deps

  const links = new Map<string, InternalLink>()
  const linksByParent = new Map<string, string[]>()

  // ========== Reader ==========

  const reader: LinkReader = {
    get(childId: string): InternalLink | undefined {
      const l = links.get(childId)
      return l ? { ...l } : undefined
    },
    getByParent(parentId: string): string[] {
      return [...(linksByParent.get(parentId) || [])]
    },
    entries(): Iterable<[string, InternalLink]> {
      return [...links.entries()].map(([k, v]) => [k, { ...v }] as [string, InternalLink])
    },
  }

  // ========== Helpers ==========

  function getSeriesDuration(series: FullSeries): number {
    if (series.patterns && series.patterns.length > 0) {
      return series.patterns[0]!.duration || 60
    }
    return 60
  }

  function getChainDepthSync(seriesId: string): number {
    let depth = 0
    let current = seriesId
    while (links.has(current)) {
      current = links.get(current)!.parentId
      depth++
      if (depth > 33) return depth
    }
    return depth
  }

  // ========== Operations ==========

  async function link(parentId: string, childId: string, options: LinkOptions): Promise<void> {
    const parent = await getFullSeries(parentId)
    if (!parent) throw new NotFoundError(`Parent series ${parentId} not found`)
    const child = await getFullSeries(childId)
    if (!child) throw new NotFoundError(`Child series ${childId} not found`)

    if (parentId === childId) throw new CycleDetectedError('Cannot link series to itself')

    if (links.has(childId)) {
      throw new CycleDetectedError(`Series ${childId} is already linked`)
    }

    // Cycle detection
    let current = parentId
    let depth = 0
    while (links.has(current)) {
      current = links.get(current)!.parentId
      depth++
      if (current === childId) throw new CycleDetectedError('Linking would create a cycle')
      if (depth > 32) break
    }

    const chainDepth = getChainDepthSync(parentId) + 1
    if (chainDepth > 32) {
      throw new ChainDepthExceededError(`Chain depth ${chainDepth} exceeds maximum of 32`)
    }

    const linkData: InternalLink = {
      parentId,
      childId,
      distance: options.distance || 0,
      ...(options.earlyWobble != null ? { earlyWobble: options.earlyWobble } : {}),
      ...(options.lateWobble != null ? { lateWobble: options.lateWobble } : {}),
    }

    links.set(childId, linkData)
    if (!linksByParent.has(parentId)) linksByParent.set(parentId, [])
    linksByParent.get(parentId)!.push(childId)

    await adapter.createLink({
      id: uuid(),
      parentSeriesId: parentId,
      childSeriesId: childId,
      targetDistance: options.distance || 0,
      earlyWobble: options.earlyWobble ?? 0,
      lateWobble: options.lateWobble ?? 0,
    })
  }

  async function unlink(childId: string): Promise<void> {
    const l = links.get(childId)
    if (l) {
      const parentChildren = linksByParent.get(l.parentId)
      if (parentChildren) {
        const idx = parentChildren.indexOf(childId)
        if (idx >= 0) parentChildren.splice(idx, 1)
      }
      links.delete(childId)
      const adapterLink = await adapter.getLinkByChild(childId)
      if (adapterLink) await adapter.deleteLink(adapterLink.id)
    }
  }

  function getParentEndTime(
    parentSeries: FullSeries,
    parentId: string,
    instanceDate: LocalDate,
    chainEndTimes?: Map<string, Map<string, LocalDateTime>>
  ): LocalDateTime | null {
    // 1. Check if parent has a completion on this date with endTime (actual data)
    const parentCompIds = completionReader.getBySeriesId(parentId)
    for (const cId of parentCompIds) {
      const c = completionReader.get(cId)
      if (c && (c.date as string) === (instanceDate as string) && c.endTime) {
        return c.endTime as LocalDateTime
      }
    }

    // 2. Check if parent is rescheduled
    const exKey = `${parentId}:${instanceDate}`
    const exception = exceptionReader.getByKey(exKey)
    if (exception?.type === 'rescheduled' && exception.newTime) {
      const parentDur = getSeriesDuration(parentSeries)
      return addMinutesToTime(exception.newTime, parentDur)
    }

    // 3. Check chain-computed end times (from topo-sorted parent instances)
    const chainEnd = chainEndTimes?.get(parentId)?.get(instanceDate as string)
    if (chainEnd) return chainEnd

    // 4. Fallback to pattern time + duration
    if (parentSeries.patterns && parentSeries.patterns.length > 0) {
      const pattern = parentSeries.patterns[0]
      const patternTime = normalizeTime((pattern?.time || '09:00:00') as LocalTime)
      const resolvedTime = resolveTimeForDate(instanceDate, patternTime, timezone)
      const parentTime = makeDateTime(instanceDate, resolvedTime)
      const parentDur = getSeriesDuration(parentSeries)
      return addMinutesToTime(parentTime, parentDur)
    }

    return null
  }

  async function copyForSplit(originalId: string, newId: string): Promise<void> {
    const originalLink = links.get(originalId)
    if (originalLink) {
      const newLink: InternalLink = {
        parentId: originalLink.parentId,
        childId: newId,
        distance: originalLink.distance,
        ...(originalLink.earlyWobble != null ? { earlyWobble: originalLink.earlyWobble } : {}),
        ...(originalLink.lateWobble != null ? { lateWobble: originalLink.lateWobble } : {}),
      }
      links.set(newId, newLink)
      if (!linksByParent.has(originalLink.parentId)) linksByParent.set(originalLink.parentId, [])
      linksByParent.get(originalLink.parentId)!.push(newId)
      await adapter.createLink({
        id: uuid(),
        parentSeriesId: originalLink.parentId,
        childSeriesId: newId,
        targetDistance: originalLink.distance,
        earlyWobble: originalLink.earlyWobble ?? 0,
        lateWobble: originalLink.lateWobble ?? 0,
      })
    }
  }

  // ========== Hydration ==========

  async function hydrate(): Promise<void> {
    const allLinks = await adapter.getAllLinks()
    for (const l of allLinks) {
      const childId = l.childSeriesId
      const parentId = l.parentSeriesId
      if (!links.has(childId)) {
        links.set(childId, { parentId, childId, distance: l.targetDistance, earlyWobble: l.earlyWobble, lateWobble: l.lateWobble })
        if (!linksByParent.has(parentId)) linksByParent.set(parentId, [])
        if (!linksByParent.get(parentId)!.includes(childId)) {
          linksByParent.get(parentId)!.push(childId)
        }
      }
    }
  }

  return {
    reader,
    link,
    unlink,
    getChainDepthSync,
    getParentEndTime,
    getSeriesDuration,
    copyForSplit,
    hydrate,
  }
}
