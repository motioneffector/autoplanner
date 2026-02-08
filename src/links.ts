/**
 * Links Module
 *
 * Parent-child chain relationships between series. A child's scheduling depends
 * on its parent's actual completion time. Supports cycle detection, depth limits,
 * target time calculation, and valid window computation.
 */

import type { Adapter, Link as AdapterLink } from './adapter'
import type { LocalDate, LocalDateTime, LocalTime } from './time-date'
import { addMinutes, makeDateTime, makeTime } from './time-date'

// ============================================================================
// Types
// ============================================================================

type LinkResult<T> = { ok: true; value: T } | { ok: false; error: { type: string; message: string } }

export type { DomainLink } from './domain-types'
import type { DomainLink } from './domain-types'

type LinkInput = {
  parentSeriesId: string
  childSeriesId: string
  targetDistance: number
  earlyWobble?: number
  lateWobble?: number
}

type LinkUpdateInput = {
  targetDistance?: number
  earlyWobble?: number
  lateWobble?: number
  parentSeriesId?: string
  childSeriesId?: string
}

export type Conflict = {
  type: string
  message: string
}

// ============================================================================
// Helpers
// ============================================================================

function ok<T>(value: T): LinkResult<T> {
  return { ok: true, value }
}

function err<T>(type: string, message: string): LinkResult<T> {
  return { ok: false, error: { type, message } }
}

function toDomain(l: AdapterLink): DomainLink {
  return {
    id: l.id,
    parentSeriesId: l.parentSeriesId,
    childSeriesId: l.childSeriesId,
    targetDistance: l.targetDistance,
    earlyWobble: l.earlyWobble,
    lateWobble: l.lateWobble,
  }
}

// ============================================================================
// Public API
// ============================================================================

export async function linkSeries(
  adapter: Adapter,
  input: LinkInput
): Promise<LinkResult<DomainLink>> {
  // Validate targetDistance
  if (input.targetDistance < 0) {
    return err('ValidationError', 'targetDistance must be >= 0')
  }

  // Self-link check
  if (input.parentSeriesId === input.childSeriesId) {
    return err('SelfLinkError', 'Cannot link a series to itself')
  }

  // Check both series exist
  const parent = await adapter.getSeries(input.parentSeriesId)
  if (!parent) {
    return err('NotFoundError', `Series '${input.parentSeriesId}' not found`)
  }
  const child = await adapter.getSeries(input.childSeriesId)
  if (!child) {
    return err('NotFoundError', `Series '${input.childSeriesId}' not found`)
  }

  // Check child not already linked
  const existing = await adapter.getLinkByChild(input.childSeriesId)
  if (existing) {
    return err('AlreadyLinkedError', `Series '${input.childSeriesId}' is already linked`)
  }

  // Cycle detection: walk parent chain from proposed parent, check if we reach child
  let current = input.parentSeriesId
  const visited = new Set<string>()
  while (true) {
    if (current === input.childSeriesId) {
      return err('CycleDetectedError', 'Link would create a cycle')
    }
    if (visited.has(current)) break
    visited.add(current)
    const parentLink = await adapter.getLinkByChild(current)
    if (!parentLink) break
    current = parentLink.parentSeriesId
  }

  // Depth check: new child's depth = parent's depth + 1
  let depth = 0
  current = input.parentSeriesId
  while (true) {
    const parentLink = await adapter.getLinkByChild(current)
    if (!parentLink) break
    depth++
    current = parentLink.parentSeriesId
  }
  // depth is parent's depth, child would be depth + 1
  if (depth + 1 > 32) {
    return err('ChainDepthExceededError', `Chain depth would exceed 32`)
  }

  const id = crypto.randomUUID()
  const link: AdapterLink = {
    id,
    parentSeriesId: input.parentSeriesId,
    childSeriesId: input.childSeriesId,
    targetDistance: input.targetDistance,
    earlyWobble: input.earlyWobble ?? 0,
    lateWobble: input.lateWobble ?? 0,
  }

  try {
    await adapter.createLink(link)
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'InvalidDataError' && /cycle/i.test(e.message)) {
      return err('CycleDetectedError', 'Link would create a cycle')
    }
    throw e
  }

  return ok(toDomain(link))
}

export async function unlinkSeries(
  adapter: Adapter,
  childSeriesId: string
): Promise<LinkResult<void>> {
  const link = await adapter.getLinkByChild(childSeriesId)
  if (!link) {
    return err('NoLinkError', `No link found for child '${childSeriesId}'`)
  }

  await adapter.deleteLink(link.id)
  return ok(undefined as void)
}

export async function getLink(
  adapter: Adapter,
  id: string
): Promise<DomainLink | null> {
  const l = await adapter.getLink(id)
  if (!l) return null
  return toDomain(l)
}

export async function getLinkByChild(
  adapter: Adapter,
  childSeriesId: string
): Promise<DomainLink | null> {
  const l = await adapter.getLinkByChild(childSeriesId)
  if (!l) return null
  return toDomain(l)
}

export async function getLinksByParent(
  adapter: Adapter,
  parentSeriesId: string
): Promise<DomainLink[]> {
  const links = await adapter.getLinksByParent(parentSeriesId)
  return links.map(toDomain)
}

export async function getAllLinks(adapter: Adapter): Promise<DomainLink[]> {
  const links = await adapter.getAllLinks()
  return links.map(toDomain)
}

export async function updateLink(
  adapter: Adapter,
  id: string,
  changes: LinkUpdateInput
): Promise<LinkResult<void>> {
  const existing = await adapter.getLink(id)
  if (!existing) {
    return err('NotFoundError', `Link '${id}' not found`)
  }

  // Cannot change parent or child IDs
  if (changes.parentSeriesId !== undefined) {
    return err('ValidationError', 'Cannot change parentSeriesId')
  }
  if (changes.childSeriesId !== undefined) {
    return err('ValidationError', 'Cannot change childSeriesId')
  }

  const adapterChanges: Partial<AdapterLink> = {}
  if (changes.targetDistance !== undefined) adapterChanges.targetDistance = changes.targetDistance
  if (changes.earlyWobble !== undefined) adapterChanges.earlyWobble = changes.earlyWobble
  if (changes.lateWobble !== undefined) adapterChanges.lateWobble = changes.lateWobble

  await adapter.updateLink(id, adapterChanges)
  return ok(undefined as void)
}

export async function getChainDepth(
  adapter: Adapter,
  seriesId: string
): Promise<number> {
  let depth = 0
  let current = seriesId
  while (true) {
    const link = await adapter.getLinkByChild(current)
    if (!link) break
    depth++
    current = link.parentSeriesId
  }
  return depth
}

async function getParentEndTime(
  adapter: Adapter,
  parentSeriesId: string,
  instanceDate: LocalDate
): Promise<LocalDateTime> {
  const series = await adapter.getSeries(parentSeriesId)
  if (!series) throw new Error(`Series '${parentSeriesId}' not found`)

  // Check if parent completed → use actual end time
  const completions = await adapter.getCompletionsBySeries(parentSeriesId)
  const completion = completions.find(
    (c) => (c.instanceDate as string) === (instanceDate as string)
  )
  if (completion && completion.endTime) {
    return completion.endTime
  }

  // Check if parent rescheduled
  const exceptions = await adapter.getExceptionsBySeries(parentSeriesId)
  const exception = exceptions.find(
    (e) =>
      (e.originalDate as string) === (instanceDate as string) &&
      e.type === 'rescheduled'
  )

  let parentTime: LocalDateTime
  if (exception && exception.newTime) {
    parentTime = exception.newTime
  } else if (series['allDay'] || series['timeOfDay'] === 'allDay') {
    parentTime = makeDateTime(instanceDate, makeTime(0, 0, 0))
  } else {
    parentTime = makeDateTime(instanceDate, series['timeOfDay'] as LocalTime)
  }

  // Add duration
  const duration = typeof series['duration'] === 'number' ? series['duration'] : 0
  return addMinutes(parentTime, duration)
}

export async function calculateChildTarget(
  adapter: Adapter,
  childSeriesId: string,
  instanceDate: LocalDate
): Promise<LocalDateTime> {
  const link = await adapter.getLinkByChild(childSeriesId)
  if (!link) throw new Error(`No link found for child '${childSeriesId}'`)

  const parentEnd = await getParentEndTime(adapter, link.parentSeriesId, instanceDate)
  return addMinutes(parentEnd, link.targetDistance)
}

export async function getChildValidWindow(
  adapter: Adapter,
  childSeriesId: string,
  instanceDate: LocalDate
): Promise<{ earliest: LocalDateTime; latest: LocalDateTime }> {
  const link = await adapter.getLinkByChild(childSeriesId)
  if (!link) throw new Error(`No link found for child '${childSeriesId}'`)

  const target = await calculateChildTarget(adapter, childSeriesId, instanceDate)
  const earliest = addMinutes(target, -(link.earlyWobble))
  const latest = addMinutes(target, link.lateWobble)

  return { earliest, latest }
}

export async function detectConflicts(
  adapter: Adapter,
  seriesId: string,
  instanceDate: LocalDate,
  opts: { proposedTime: LocalDateTime }
): Promise<Conflict[]> {
  const conflicts: Conflict[] = []

  const link = await adapter.getLinkByChild(seriesId)
  if (!link) return conflicts

  const window = await getChildValidWindow(adapter, seriesId, instanceDate)

  if (
    (opts.proposedTime as string) < (window.earliest as string) ||
    (opts.proposedTime as string) > (window.latest as string)
  ) {
    conflicts.push({
      type: 'chainBoundsViolated',
      message: `Proposed time ${opts.proposedTime} is outside valid window [${window.earliest}, ${window.latest}]`,
    })
  }

  return conflicts
}
