/**
 * Series Assembly
 *
 * Fat-series marshaling: converts between the adapter's normalized storage
 * (series + patterns + conditions + tags + cycling + adaptiveDuration as
 * separate tables) and the internal "fat" FullSeries representation used
 * by the public API.
 *
 * `loadFullSeries()` assembles a fat series from adapter calls.
 * `persistNewSeries()` decomposes a fat series into normalized creates.
 * `reconstructConditionTree()` / `persistConditionTree()` handle the
 * recursive condition tree ↔ flat rows conversion.
 */

import type { Adapter, Condition } from './adapter'
import type { AdaptiveDurationConfig } from './adapter'
import type {
  ConditionNode, PatternInput, CyclingInput, AdaptiveDurationInput,
  FullSeries, EnrichedPattern,
} from './public-api'
import type { LocalDate, LocalDateTime } from './time-date'

// ============================================================================
// Condition Tree Marshaling
// ============================================================================

/**
 * Reconstruct a ConditionNode tree from flat adapter condition rows.
 * Pure function — no adapter calls.
 */
export function reconstructConditionTree(
  rootId: string,
  conditionsById: Map<string, Condition>,
  childrenByParent: Map<string, Condition[]>,
): ConditionNode | null {
  const cond = conditionsById.get(rootId)
  if (!cond) return null
  const result: Record<string, unknown> = { ...cond }
  delete result.id
  delete result.seriesId
  delete result.parentId
  if (cond.type === 'and' || cond.type === 'or') {
    const children = childrenByParent.get(rootId) || []
    result.conditions = children
      .map((c: Condition) => reconstructConditionTree(c.id, conditionsById, childrenByParent))
      .filter(Boolean)
  } else if (cond.type === 'not') {
    const children = childrenByParent.get(rootId) || []
    if (children.length > 0) {
      result.condition = reconstructConditionTree(children[0]!.id, conditionsById, childrenByParent)
    }
  }
  return result as unknown as ConditionNode
}

/**
 * Persist a condition tree recursively into flat adapter rows.
 * Returns the root condition's ID.
 */
export async function persistConditionTree(
  adapter: Adapter,
  seriesId: string,
  condition: ConditionNode,
  parentId: string | null,
): Promise<string> {
  const id = crypto.randomUUID()
  // Use record view for serialization — condition fields vary by type
  const c = condition as Record<string, unknown>
  await adapter.createCondition({
    id,
    seriesId,
    parentId,
    type: condition.type,
    ...(c.operator != null ? { operator: c.operator as string } : {}),
    ...(c.comparison != null ? { comparison: c.comparison as string } : {}),
    ...(c.value != null ? { value: c.value as number } : {}),
    ...(c.windowDays != null ? { windowDays: c.windowDays as number } : {}),
    ...(c.seriesRef != null ? { seriesRef: c.seriesRef as string } : {}),
    ...(c.days != null ? { days: c.days as number[] } : {}),
  })

  if ((condition.type === 'and' || condition.type === 'or') && condition.conditions) {
    for (const child of condition.conditions) {
      await persistConditionTree(adapter, seriesId, child, id)
    }
  } else if (condition.type === 'not' && condition.condition) {
    await persistConditionTree(adapter, seriesId, condition.condition, id)
  }
  return id
}

// ============================================================================
// Fat Series Loading
// ============================================================================

/**
 * Load a complete "fat" series object from the adapter's normalized data.
 * Assembles patterns, conditions, tags, cycling, and adaptive duration
 * into a single FullSeries object.
 */
export async function loadFullSeries(adapter: Adapter, id: string): Promise<FullSeries | null> {
  const s = await adapter.getSeries(id)
  if (!s) return null
  const result = { ...s } as FullSeries

  // Patterns + weekdays
  const patterns = await adapter.getPatternsBySeries(id)
  const enrichedPatterns: EnrichedPattern[] = []
  for (const p of patterns) {
    const pat = { ...p } as EnrichedPattern
    const weekdays = await adapter.getPatternWeekdays(p.id)
    if (weekdays.length > 0) pat.days = weekdays.map((d: string) => Number(d))
    // Remove adapter-level fields not expected by internal code
    delete (pat as Record<string, unknown>).seriesId
    enrichedPatterns.push(pat)
  }
  result.patterns = enrichedPatterns

  // Conditions (for pattern condition trees)
  const conditions = await adapter.getConditionsBySeries(id)
  if (conditions.length > 0) {
    const conditionsById = new Map<string, Condition>()
    const childrenByParent = new Map<string, Condition[]>()
    for (const c of conditions) {
      conditionsById.set(c.id, c)
      if (c.parentId) {
        if (!childrenByParent.has(c.parentId)) childrenByParent.set(c.parentId, [])
        childrenByParent.get(c.parentId)!.push(c)
      }
    }
    // Attach condition trees to patterns
    for (const pat of result.patterns) {
      if (pat.conditionId && conditionsById.has(pat.conditionId)) {
        const tree = reconstructConditionTree(pat.conditionId, conditionsById, childrenByParent)
        if (tree) pat.condition = tree
      }
    }
  }

  // Tags
  const tags = await adapter.getTagsForSeries(id)
  if (tags.length > 0) result.tags = tags.map((t: { name: string }) => t.name)

  // Cycling
  const cycling = await adapter.getCyclingConfig(id)
  if (cycling) {
    const items = await adapter.getCyclingItems(id)
    result.cycling = {
      ...(cycling.mode != null ? { mode: cycling.mode } : {}),
      currentIndex: cycling.currentIndex,
      ...(cycling.gapLeap != null ? { gapLeap: cycling.gapLeap } : {}),
      items: items.map((i: { title: string }) => i.title),
    }
  }

  // Adaptive duration
  const adaptive = await adapter.getAdaptiveDuration(id)
  if (adaptive) result.adaptiveDuration = adaptive as AdaptiveDurationInput

  return result
}

/**
 * Load all series as fat objects.
 */
export async function loadAllFullSeries(adapter: Adapter): Promise<FullSeries[]> {
  const allSeries = await adapter.getAllSeries()
  const results: FullSeries[] = []
  for (const s of allSeries) {
    if (s && s.id) {
      const full = await loadFullSeries(adapter, s.id)
      if (full) results.push(full)
    }
  }
  return results
}

// ============================================================================
// Fat Series Persistence
// ============================================================================

/**
 * Persist a new fat series object into the adapter's normalized tables.
 * Decomposes into series + patterns + weekdays + conditions + tags +
 * cycling + adaptive duration.
 */
export async function persistNewSeries(adapter: Adapter, data: FullSeries): Promise<void> {
  await adapter.createSeries({
    id: data.id,
    title: data.title,
    createdAt: data.createdAt,
    ...(data.locked != null ? { locked: data.locked } : {}),
    ...(data.startDate != null ? { startDate: data.startDate } : {}),
    ...(data.endDate != null ? { endDate: data.endDate } : {}),
    ...(data.updatedAt != null ? { updatedAt: data.updatedAt } : {}),
  })

  if (data.patterns && Array.isArray(data.patterns)) {
    for (const p of data.patterns) {
      let condId: string | null = null
      if (p.condition) {
        condId = await persistConditionTree(adapter, data.id, p.condition, null)
      }
      const patternId = crypto.randomUUID()
      await adapter.createPattern({
        id: patternId,
        seriesId: data.id,
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
      if (p.days && Array.isArray(p.days)) {
        await adapter.setPatternWeekdays(patternId, p.days.map(String))
      }
      if (p.daysOfWeek && Array.isArray(p.daysOfWeek)) {
        await adapter.setPatternWeekdays(patternId, p.daysOfWeek.map(String))
      }
    }
  }

  if (data.tags && Array.isArray(data.tags)) {
    for (const tag of data.tags) {
      await adapter.addTagToSeries(data.id, tag)
    }
  }

  if (data.cycling) {
    await adapter.setCyclingConfig(data.id, {
      seriesId: data.id,
      currentIndex: data.cycling.currentIndex ?? 0,
      gapLeap: data.cycling.gapLeap ?? false,
      ...(data.cycling.mode != null ? { mode: data.cycling.mode } : {}),
    })
    if (data.cycling.items && Array.isArray(data.cycling.items)) {
      await adapter.setCyclingItems(data.id,
        data.cycling.items.map((title: string, i: number) => ({
          seriesId: data.id,
          position: i,
          title,
          duration: 0,
        }))
      )
    }
  }

  if (data.adaptiveDuration) {
    await adapter.setAdaptiveDuration(data.id, {
      seriesId: data.id,
      ...data.adaptiveDuration,
    } as AdaptiveDurationConfig)
  }
}
