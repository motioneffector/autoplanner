/**
 * Schedule Engine
 *
 * Stateful schedule building, reflow integration, and conflict detection.
 * Owns all schedule-related caches. Read-only access to other modules via
 * injected reader interfaces and functions.
 */

import type { LocalDate, LocalTime, LocalDateTime } from '../time-date'
import {
  makeTime, makeDateTime,
  hourOf, minuteOf,
  dateOf, timeOf, daysBetween,
} from '../time-date'
import { reflow, type ReflowInput } from '../reflow'
import type {
  FullSeries, EnrichedPattern, ScheduleInstance, Schedule, Conflict,
  ConstraintTarget, StoredConstraint, AdaptiveDurationInput, ConditionNode,
} from '../public-api'
import type { SeriesId } from '../types'
import type { Duration } from '../core'
import { ValidationError } from '../errors'
import type {
  InternalLink, InvalidationScope,
  SeriesReader, CompletionReader, ExceptionReader, LinkReader, ConstraintReader,
} from './types'
import {
  getPatternDates, resolveTimeForDate, addMinutesToTime, simpleHash,
} from './helpers'

// ============================================================================
// Types
// ============================================================================

type InternalInstance = ScheduleInstance & {
  _patternTime?: LocalDateTime
  _hasExplicitTime?: boolean
}

type ScheduleEngineDeps = {
  getAllSeries: () => Promise<FullSeries[]>
  seriesReader: SeriesReader
  completionReader: CompletionReader
  getLastDate: (seriesId: string) => LocalDate | null
  getFirstDate: (seriesId: string) => LocalDate | null
  exceptionReader: ExceptionReader
  linkReader: LinkReader
  getParentEndTime: (
    parentSeries: FullSeries,
    parentId: string,
    instanceDate: LocalDate,
    chainEndTimes?: Map<string, Map<string, LocalDateTime>>
  ) => LocalDateTime | null
  constraintReader: ConstraintReader
  evaluateCondition: (condition: ConditionNode, seriesId: string, date: LocalDate) => boolean
  timezone: string
}

// ============================================================================
// Implementation
// ============================================================================

export function createScheduleEngine(deps: ScheduleEngineDeps) {
  const {
    getAllSeries, seriesReader, completionReader,
    getLastDate, getFirstDate,
    exceptionReader, linkReader, getParentEndTime,
    constraintReader, evaluateCondition, timezone,
  } = deps

  // ========== Schedule Cache State ==========
  let cacheGeneration = 0
  const scheduleResultCache = new Map<string, { generation: number; schedule: Schedule }>()
  let cacheStats = { patternHits: 0, patternMisses: 0, cspHits: 0, cspMisses: 0 }

  // ========== Pattern Date Cache ==========
  // Key: "seriesId:patternIdx:start:end:anchor" → Set<LocalDate>
  const patternDateCache = new Map<string, Set<LocalDate>>()

  function getCachedPatternDates(
    pattern: EnrichedPattern, start: LocalDate, end: LocalDate,
    seriesStart: LocalDate, seriesId: string, patternIdx: number,
    anchor: LocalDate | undefined
  ): Set<LocalDate> {
    const key = `${seriesId}:${patternIdx}:${start}:${end}:${anchor ?? 'none'}`
    const cached = patternDateCache.get(key)
    if (cached) { cacheStats.patternHits++; return cached }
    cacheStats.patternMisses++
    const result = getPatternDates(pattern, start, end, seriesStart)
    patternDateCache.set(key, result)
    return result
  }

  function evictPatternCacheForSeries(seriesId: string): void {
    for (const key of [...patternDateCache.keys()]) {
      if (key.startsWith(seriesId + ':')) patternDateCache.delete(key)
    }
  }

  // ========== CSP Fingerprint Cache ==========
  // Content-addressable: fingerprint of day's CSP inputs → solver output
  // NEVER cleared for correctness. If inputs change, fingerprint changes.
  const cspResultCache = new Map<string, {
    assignments: Array<{ seriesId: string; time: string }>
    conflicts: Array<{ type: string; message?: string }>
  }>()

  function computeCspFingerprint(
    seriesInputs: ReflowInput['series'],
    chains: ReflowInput['chains']
  ): string {
    const sortedSeries = [...seriesInputs].sort((a, b) =>
      (a.id as string).localeCompare(b.id as string)
    )
    const seriesParts = sortedSeries.map(s =>
      `${s.id}|${s.fixed}|${s.idealTime}|${s.duration}|${s.allDay}|${s.timeWindow?.start ?? ''}|${s.timeWindow?.end ?? ''}`
    )
    const sortedChains = [...chains].sort((a, b) => {
      const k1 = `${a.parentId}:${a.childId}`
      const k2 = `${b.parentId}:${b.childId}`
      return k1.localeCompare(k2)
    })
    const chainParts = sortedChains.map(c =>
      `${c.parentId}|${c.childId}|${c.distance}|${c.earlyWobble}|${c.lateWobble}`
    )
    return seriesParts.join(';') + '||' + chainParts.join(';')
  }

  function defensiveCopy(schedule: Schedule): Schedule {
    return structuredClone(schedule)
  }

  // ========== Cache Invalidation ==========

  function invalidate(scope?: InvalidationScope): void {
    if (scope?.type === 'series') {
      evictPatternCacheForSeries(scope.seriesId)
    } else if (scope?.type === 'global') {
      patternDateCache.clear()
    }
    // completions, exceptions, links, constraints → NO pattern eviction

    cacheGeneration++
    scheduleResultCache.clear()
  }

  // ========== Helpers ==========

  // Get cycling title for a series instance.
  // instanceOffset projects forward: instance 0 uses the current cycling position,
  // instance 1 assumes instance 0 will be completed, etc.
  function getCyclingTitle(series: FullSeries, seriesId: string, instanceOffset: number): string {
    const cycling = series.cycling
    if (!cycling || !cycling.items || cycling.items.length === 0) return series.title

    const items = cycling.items
    const mode = cycling.mode || 'sequential'

    if (mode === 'random') {
      const completionCount = completionReader.getBySeriesId(seriesId).length
      const hash = simpleHash(seriesId + ':' + (completionCount + instanceOffset))
      return items[hash % items.length]!
    }

    // Sequential mode: base from completions, project forward by offset
    const completionCount = completionReader.getBySeriesId(seriesId).length
    const index = (completionCount + instanceOffset) % items.length
    return items[index]!
  }

  // Calculate adaptive duration for a series
  function calculateAdaptiveDuration(seriesId: string, config: AdaptiveDurationInput): number | null {
    if (!config) return null
    const ids = completionReader.getBySeriesId(seriesId)
    const durations: number[] = []

    for (const id of ids) {
      const c = completionReader.get(id)
      if (!c || !c.startTime || !c.endTime) continue
      // Calculate duration in minutes
      const startT = timeOf(c.startTime as LocalDateTime)
      const startH = hourOf(startT)
      const startM = minuteOf(startT)
      const endT = timeOf(c.endTime as LocalDateTime)
      const endH = hourOf(endT)
      const endM = minuteOf(endT)
      const dur = (endH * 60 + endM) - (startH * 60 + startM)
      if (dur > 0) durations.push(dur)
    }

    if (durations.length === 0) return config.fallback || null

    // Get last N durations
    const lastN = config.lastN || 5
    const recentDurations = durations.slice(-lastN)

    // Average
    const avg = recentDurations.reduce((a: number, b: number) => a + b, 0) / recentDurations.length

    // Apply multiplier
    const multiplier = config.multiplier || 1.0
    const result = Math.ceil(avg * multiplier)

    return Math.max(1, result)
  }

  function timesOverlap(timeA: LocalDateTime, durA: number, timeB: LocalDateTime, durB: number): boolean {
    if ((timeA as string) === (timeB as string)) return true
    const tA = timeOf(timeA)
    const tB = timeOf(timeB)
    const hA = hourOf(tA) * 60 + minuteOf(tA)
    const hB = hourOf(tB) * 60 + minuteOf(tB)
    const endA = hA + durA
    const endB = hB + durB
    return hA < endB && hB < endA
  }

  // Tag resolution — delegate to seriesReader
  function resolveTagFromReader(tag: string): string[] {
    return seriesReader.getByTag(tag)
  }

  // ========== Reflow Integration ==========

  function applyReflow(
    instances: InternalInstance[],
    linksMap: Map<string, InternalLink>
  ): Conflict[] {
    const allConflicts: Conflict[] = []

    // Group by date
    const byDate = new Map<string, InternalInstance[]>()
    for (const inst of instances) {
      const d = inst.date as string
      if (!byDate.has(d)) byDate.set(d, [])
      byDate.get(d)!.push(inst)
    }

    for (const [dateStr, dayInstances] of byDate) {
      const date = dateStr as LocalDate

      // Build SeriesInput[] — one entry per instance with count=1
      // Synthetic IDs ensure uniqueness when multiple instances share a seriesId
      const seriesInputs: ReflowInput['series'] = []
      const instanceMap = new Map<string, InternalInstance>()

      for (let i = 0; i < dayInstances.length; i++) {
        const inst = dayInstances[i]!
        const syntheticId = `${inst.seriesId}::${i}` as SeriesId
        instanceMap.set(syntheticId as string, inst)

        const internal = inst as InternalInstance
        // Treat as fixed for reflow if: (a) pattern says fixed, or
        // (b) item has an explicit time outside the default waking-hours window.
        // This prevents reflow from overriding DST-adjusted, chain-placed,
        // or rescheduled times that intentionally fall outside 07:00-23:00.
        const instTimeStr = timeOf(inst.time as LocalDateTime) as string
        const outsideWindow = instTimeStr < '07:00:00' || instTimeStr > '23:00:00'
        const isFixed = !!inst.fixed || (!!internal._hasExplicitTime && outsideWindow)

        seriesInputs.push({
          id: syntheticId,
          fixed: isFixed,
          idealTime: inst.time,
          duration: (inst.duration || 60) as Duration,
          daysBefore: 0,
          daysAfter: 0,
          ...(!isFixed && !inst.allDay ? { timeWindow: { start: '07:00:00' as LocalTime, end: '23:00:00' as LocalTime } } : {}),
          allDay: inst.allDay || false,
          count: 1,
          cancelled: false,
          conditionSatisfied: true,
          adaptiveDuration: false,
        })
      }

      // Build ChainInput[] for chains where both parent and child exist on this day
      const chains: ReflowInput['chains'] = []
      const daySeriesIds = new Set(dayInstances.map(i => i.seriesId as string))

      for (let i = 0; i < dayInstances.length; i++) {
        const inst = dayInstances[i]!
        const link = linksMap.get(inst.seriesId as string)
        if (!link || !daySeriesIds.has(link.parentId)) continue

        const childSynth = `${inst.seriesId}::${i}` as SeriesId
        // Find the parent's synthetic ID
        const parentIdx = dayInstances.findIndex(di => (di.seriesId as string) === link.parentId)
        if (parentIdx < 0) continue
        const parentSynth = `${link.parentId}::${parentIdx}` as SeriesId

        // If parent has a completion with endTime on this date, the child's
        // position was already computed from the completion endTime in buildSchedule.
        // Don't send this chain to CSP — derivation would overwrite the
        // completion-adjusted time with the parent's pattern-based position.
        const parentCompIds = completionReader.getBySeriesId(link.parentId)
        let parentHasCompletionOnDate = false
        for (const cId of parentCompIds) {
          const c = completionReader.get(cId)
          if (c && (c.date as string) === (date as string) && c.endTime) {
            parentHasCompletionOnDate = true
            break
          }
        }

        if (parentHasCompletionOnDate) {
          // Mark child as fixed — its position is locked to the completion endTime
          const childInput = seriesInputs.find(si => (si.id as string) === (childSynth as string))
          if (childInput) {
            childInput.fixed = true
            delete childInput.timeWindow
          }
          continue  // skip chain — don't let CSP derivation overwrite it
        }

        chains.push({
          parentId: parentSynth,
          childId: childSynth,
          distance: link.distance || 0,
          earlyWobble: link.earlyWobble || 0,
          lateWobble: link.lateWobble || 0,
        })
      }

      // Check CSP fingerprint cache before running solver
      const fingerprint = computeCspFingerprint(seriesInputs, chains)
      const cachedCsp = cspResultCache.get(fingerprint)
      if (cachedCsp) {
        cacheStats.cspHits++
        for (const assignment of cachedCsp.assignments) {
          const inst = instanceMap.get(assignment.seriesId)
          if (inst) inst.time = assignment.time as LocalDateTime
        }
        for (const c of cachedCsp.conflicts) {
          allConflicts.push({
            type: c.type,
            seriesIds: [],
            instances: [],
            date,
            description: c.message || `Reflow conflict: ${c.type}`,
          })
        }
        continue
      }

      cacheStats.cspMisses++

      // Run CSP solver for this day
      const result = reflow({
        series: seriesInputs,
        constraints: [],
        chains,
        today: date,
        windowStart: date,
        windowEnd: date,
      })

      // Cache the result
      cspResultCache.set(fingerprint, {
        assignments: result.assignments.map(a => ({
          seriesId: a.seriesId as string,
          time: a.time as string,
        })),
        conflicts: result.conflicts.map(c => {
          const entry: { type: string; message?: string } = { type: c.type }
          if (c.message !== undefined) entry.message = c.message
          return entry
        }),
      })

      // Apply optimized times back to instances
      for (const assignment of result.assignments) {
        const inst = instanceMap.get(assignment.seriesId as string)
        if (inst) {
          inst.time = assignment.time
        }
      }

      // Convert reflow conflicts to public Conflict type
      for (const c of result.conflicts) {
        allConflicts.push({
          type: c.type,
          seriesIds: [],
          instances: [],
          date,
          description: c.message || `Reflow conflict: ${c.type}`,
        })
      }
    }

    return allConflicts
  }

  // ========== Build Schedule ==========

  // Build schedule for [start, end) — end is exclusive
  async function buildSchedule(start: LocalDate, end: LocalDate): Promise<Schedule> {
    const allSeries = await getAllSeries()
    const instances: ScheduleInstance[] = []

    if ((end as string) < (start as string)) {
      return { instances: [], conflicts: [] }
    }

    // Build a map of series by id for chain lookups
    const seriesById = new Map<string, FullSeries>()
    for (const s of allSeries) {
      if (s && s.id) seriesById.set(s.id, s)
    }

    // Build constraint-based filtering data
    const allConstraintsList = constraintReader.getAll()
    const mustBeOnSameDayConstraints = allConstraintsList.filter(c => c.type === 'mustBeOnSameDay')

    // First pass: collect all instances for tag-based constraint resolution
    const instancesBySeriesDate = new Map<string, Set<string>>()

    for (const s of allSeries) {
      if (!s || !s.id || !s.patterns) continue
      const seriesStart = s.startDate || ('2000-01-01' as LocalDate)
      const dates = new Set<string>()
      const firstPassAnchor = getLastDate(s.id) !== null
        ? getFirstDate(s.id)
        : null

      for (let pi = 0; pi < s.patterns.length; pi++) {
        const pattern = s.patterns[pi]!
        const anchor = (pattern.type === 'weekly' && pattern.daysOfWeek)
          ? (firstPassAnchor ?? undefined)
          : pattern._anchor
        const patternDates = getCachedPatternDates(pattern, start, end, seriesStart, s.id, pi, anchor)
        for (const date of patternDates) {
          if (s.endDate && (date as string) >= (s.endDate as string)) continue
          dates.add(date as string)
        }
      }
      instancesBySeriesDate.set(s.id, dates)
    }

    // Resolve tag-based targets for constraints
    function resolveConstraintTarget(target: ConstraintTarget): string[] {
      if (!target) return []
      if (target.type === 'tag') {
        return allSeries.filter(s => s && s.tags && s.tags.includes(target.tag)).map(s => s.id)
      }
      if (target.type === 'seriesId') return [target.seriesId]
      return []
    }

    // Build mustBeOnSameDay restrictions
    const sameDayRestrictions = new Map<string, Set<string>>() // seriesId → allowed dates
    for (const c of mustBeOnSameDayConstraints) {
      const secondSeriesIds = c.secondTarget
        ? resolveConstraintTarget(c.secondTarget)
        : c.secondSeries ? [c.secondSeries] : []
      const secondDates = new Set<string>()
      for (const sid of secondSeriesIds) {
        const dates = instancesBySeriesDate.get(sid)
        if (dates) for (const d of dates) secondDates.add(d)
      }
      if (c.firstSeries) {
        sameDayRestrictions.set(c.firstSeries, secondDates)
      }
    }

    // Per-series counter for cycling projection (instance 0 = current, 1 = next, etc.)
    const cyclingCounters = new Map<string, number>()

    // Topological sort: process parents before children so chain offsets
    // can use already-computed parent end times instead of pattern time
    const sortedSeries: FullSeries[] = []
    const remaining = new Set(allSeries.filter(s => s && s.id).map(s => s.id))
    const seriesMap = new Map(allSeries.filter(s => s && s.id).map(s => [s.id, s]))
    // Add root series (no parent link) first
    for (const s of allSeries) {
      if (s && s.id && !linkReader.get(s.id)) {
        sortedSeries.push(s)
        remaining.delete(s.id)
      }
    }
    // Iteratively add children whose parents are already processed
    let sortProgress = true
    while (remaining.size > 0 && sortProgress) {
      sortProgress = false
      for (const id of remaining) {
        const link = linkReader.get(id)
        if (link && !remaining.has(link.parentId)) {
          sortedSeries.push(seriesMap.get(id)!)
          remaining.delete(id)
          sortProgress = true
        }
      }
    }
    // Add any remaining (orphans or cycles) at the end
    for (const id of remaining) {
      sortedSeries.push(seriesMap.get(id)!)
    }

    // Track end times of already-built instances for chain offset computation
    const builtEndTimes = new Map<string, Map<string, LocalDateTime>>()

    // Second pass: generate instances with per-date condition evaluation
    // Conditions are evaluated per-date so weekday/daysSince conditions
    // correctly filter individual dates, not entire patterns
    for (const s of sortedSeries) {
      if (!s || !s.id || !s.patterns) continue
      const seriesStart = s.startDate || ('2000-01-01' as LocalDate)
      const allowedDates = sameDayRestrictions.get(s.id)

      // Determine anchor for weekly daysOfWeek patterns:
      // If series has completions, use first completion date as anchor
      const firstCompDate = getLastDate(s.id) !== null
        ? getFirstDate(s.id)
        : null

      for (let patternIdx = 0; patternIdx < s.patterns.length; patternIdx++) {
        let pattern = s.patterns[patternIdx]!
        // Always assign _anchor for weekly daysOfWeek (clears stale values on deletion)
        if (pattern.type === 'weekly' && pattern.daysOfWeek) {
          pattern = { ...pattern } // clone before mutation to protect cache
          if (firstCompDate) {
            pattern._anchor = firstCompDate
          } else {
            delete pattern._anchor
          }
        }

        const dates = getCachedPatternDates(pattern, start, end, seriesStart, s.id, patternIdx, pattern._anchor)

        for (const date of dates) {
          if (s.endDate && (date as string) >= (s.endDate as string)) continue

          // Evaluate condition per-date (not once for entire window)
          if (pattern.condition && !evaluateCondition(pattern.condition, s.id, date)) continue

          // mustBeOnSameDay filter
          if (allowedDates && !allowedDates.has(date as string)) continue

          // Check exceptions
          const exKey = `${s.id}:${date}`
          const exception = exceptionReader.getByKey(exKey)
          if (exception?.type === 'cancelled') continue

          // Determine time
          let instanceTime: LocalDateTime
          let instanceDate = date
          const isAllDay = pattern.allDay === true
          let patternTimeOriginal: LocalDateTime | undefined

          // Track whether this instance has an explicitly-set time or fell to the 09:00 default
          let hasExplicitTime = !!pattern.time

          if (exception?.type === 'rescheduled' && exception.newTime) {
            instanceTime = exception.newTime
            hasExplicitTime = true  // rescheduled = explicit placement
            // Update date if rescheduled to a different day
            const newDate = dateOf(exception.newTime)
            if ((newDate as string) !== (date as string)) {
              instanceDate = newDate
            }
          } else if (isAllDay) {
            instanceTime = makeDateTime(date, makeTime(0, 0, 0))
            hasExplicitTime = true  // all-day items are intentionally placed
          } else {
            const patternTime = (pattern.time || '09:00:00') as LocalTime
            const resolvedTime = resolveTimeForDate(date, patternTime, timezone)
            instanceTime = makeDateTime(date, resolvedTime)
          }

          // Store original pattern time for chain conflict detection
          patternTimeOriginal = instanceTime

          // Chain adjustment: if this series has a parent link, adjust time
          const link = linkReader.get(s.id)
          if (link && !isAllDay) {
            const parentSeries = seriesById.get(link.parentId)
            if (parentSeries) {
              const parentEnd = getParentEndTime(parentSeries, link.parentId, date, builtEndTimes)
              if (parentEnd) {
                const target = addMinutesToTime(parentEnd, link.distance || 0)
                instanceTime = target
                hasExplicitTime = true  // chain-placed: don't let reflow move it
                if (!pattern.time) {
                  // No explicit pattern time — update so conflict detector
                  // uses chain-computed time (not the 09:00 default)
                  patternTimeOriginal = target
                }
                // If pattern HAS explicit time, keep patternTimeOriginal as-is
                // so chainCannotFit detects the configuration mismatch
              }
            }
          }

          // Determine duration (adaptive or pattern)
          let duration = pattern.duration as number | undefined
          if (s.adaptiveDuration) {
            const adaptiveDur = calculateAdaptiveDuration(s.id, s.adaptiveDuration)
            if (adaptiveDur !== null) duration = adaptiveDur
          }

          // Cycling title — project forward assuming future completions
          let title = s.title
          if (s.cycling && s.cycling.items && s.cycling.items.length > 0) {
            const offset = cyclingCounters.get(s.id) ?? 0
            title = getCyclingTitle(s, s.id, offset)
            cyclingCounters.set(s.id, offset + 1)
          }

          const inst: InternalInstance = {
            seriesId: s.id,
            title,
            date: instanceDate,
            time: instanceTime,
          }
          if (duration != null) inst.duration = duration
          if (pattern.fixed != null) inst.fixed = pattern.fixed
          if (isAllDay) inst.allDay = true
          inst._patternTime = patternTimeOriginal
          inst._hasExplicitTime = hasExplicitTime
          instances.push(inst)

          // Record end time for downstream chain children
          const endTime = addMinutesToTime(instanceTime, (duration || 60) as number)
          if (!builtEndTimes.has(s.id)) builtEndTimes.set(s.id, new Map())
          builtEndTimes.get(s.id)!.set(instanceDate as string, endTime)
        }
      }
    }

    // Run CSP solver to distribute flexible items (mutates instance times in-place)
    const linksSnapshot = new Map<string, InternalLink>(linkReader.entries())
    applyReflow(instances, linksSnapshot)

    // Detect conflicts using the repositioned instances (proper format with seriesIds/instances)
    const conflicts = detectConflicts(instances, allConstraintsList, seriesById)

    instances.sort((a, b) => (a.time as string).localeCompare(b.time as string))

    return { instances, conflicts }
  }

  // ========== Conflict Detection ==========

  function detectConflicts(
    instances: ScheduleInstance[],
    allConstraintsList: StoredConstraint[],
    seriesById: Map<string, FullSeries>
  ): Conflict[] {
    const conflicts: Conflict[] = []

    // 1. Fixed-fixed overlap detection
    const fixedInstances = instances.filter(i => i.fixed && !i.allDay)
    for (let i = 0; i < fixedInstances.length; i++) {
      for (let j = i + 1; j < fixedInstances.length; j++) {
        const a = fixedInstances[i]!
        const b = fixedInstances[j]!
        if (a.date !== b.date) continue
        if (a.seriesId === b.seriesId) continue

        const durA = a.duration || 60
        const durB = b.duration || 60

        if (timesOverlap(a.time, durA, b.time, durB)) {
          // Deduplicate by series pair (report once, not per day)
          const pairKey = [a.seriesId, b.seriesId].sort().join(':')
          const existing = conflicts.find(c =>
            c.type === 'overlap' &&
            [...c.seriesIds].sort().join(':') === pairKey
          )
          if (!existing) {
            conflicts.push({
              type: 'overlap',
              seriesIds: [a.seriesId, b.seriesId],
              instances: [
                { seriesId: a.seriesId, title: a.title, date: a.date, time: a.time },
                { seriesId: b.seriesId, title: b.title, date: b.date, time: b.time },
              ],
              date: a.date,
              description: `Fixed overlap between ${a.title} and ${b.title}`,
            })
          }
        }
      }
    }

    // 2. Constraint violation detection
    for (const constraint of allConstraintsList) {
      switch (constraint.type) {
        case 'mustBeBefore': {
          const firstInstances = instances.filter(i => i.seriesId === constraint.firstSeries)
          const secondInstances = instances.filter(i => i.seriesId === constraint.secondSeries)
          for (const first of firstInstances) {
            for (const second of secondInstances) {
              if (first.date !== second.date) continue
              if ((first.time as string) >= (second.time as string)) {
                conflicts.push({
                  type: 'constraintViolation',
                  seriesIds: [constraint.firstSeries!, constraint.secondSeries!],
                  instances: [
                    { seriesId: first.seriesId, title: first.title, date: first.date },
                    { seriesId: second.seriesId, title: second.title, date: second.date },
                  ],
                  date: first.date,
                  description: `${first.title} must be before ${second.title}`,
                })
              }
            }
          }
          break
        }
        case 'cantBeNextTo': {
          // Resolve target series
          const targetSeriesIds = constraint.target
            ? resolveConstraintTargetFromInstances(constraint.target, instances)
            : []

          // Track flagged pairs to avoid duplicates between instance and pattern checks
          const flaggedPairs = new Set<string>()

          // 1. Instance-based check (for instances within the current window)
          const targetInstances = instances.filter(i => targetSeriesIds.includes(i.seriesId))
          const dateSeriesMap = new Map<string, string[]>()
          for (const inst of targetInstances) {
            if (!dateSeriesMap.has(inst.date as string)) dateSeriesMap.set(inst.date as string, [])
            dateSeriesMap.get(inst.date as string)!.push(inst.seriesId)
          }
          const sortedDates = [...dateSeriesMap.keys()].sort()
          for (let i = 0; i < sortedDates.length - 1; i++) {
            const d1 = sortedDates[i]!
            const d2 = sortedDates[i + 1]!
            const daysDiff = daysBetween(d1 as LocalDate, d2 as LocalDate)
            if (daysDiff === 1) {
              const series1 = dateSeriesMap.get(d1)!
              const series2 = dateSeriesMap.get(d2)!
              for (const s1 of series1) {
                for (const s2 of series2) {
                  if (s1 !== s2) {
                    const pairKey = s1 < s2 ? `${s1}:${s2}` : `${s2}:${s1}`
                    if (flaggedPairs.has(pairKey)) continue
                    flaggedPairs.add(pairKey)
                    const inst1 = targetInstances.find(i => i.seriesId === s1 && (i.date as string) === d1)
                    const inst2 = targetInstances.find(i => i.seriesId === s2 && (i.date as string) === d2)
                    if (inst1 && inst2) {
                      conflicts.push({
                        type: 'constraintViolation',
                        seriesIds: [s1, s2],
                        instances: [
                          { seriesId: s1, title: inst1.title, date: inst1.date },
                          { seriesId: s2, title: inst2.title, date: inst2.date },
                        ],
                        date: inst1.date,
                        description: `${inst1.title} and ${inst2.title} are on adjacent days`,
                      })
                    }
                  }
                }
              }
            }
          }

          // 2. Pattern-based check for weekly series — catches adjacency
          //    regardless of which days fall in the current window
          for (let a = 0; a < targetSeriesIds.length; a++) {
            for (let b = a + 1; b < targetSeriesIds.length; b++) {
              const idA = targetSeriesIds[a]!
              const idB = targetSeriesIds[b]!
              const pairKey = idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`
              if (flaggedPairs.has(pairKey)) continue

              const sA = seriesById.get(idA)
              const sB = seriesById.get(idB)
              if (!sA || !sB) continue

              // Collect all days-of-week each series fires on
              const daysA: number[] = []
              const daysB: number[] = []
              for (const pat of sA.patterns || []) {
                if (pat.type === 'weekly' && pat.daysOfWeek) daysA.push(...pat.daysOfWeek)
                if (pat.type === 'daily') for (let d = 0; d < 7; d++) daysA.push(d)
              }
              for (const pat of sB.patterns || []) {
                if (pat.type === 'weekly' && pat.daysOfWeek) daysB.push(...pat.daysOfWeek)
                if (pat.type === 'daily') for (let d = 0; d < 7; d++) daysB.push(d)
              }

              // Check if any day from A is adjacent to any day from B
              let adjacent = false
              for (const da of daysA) {
                if (adjacent) break
                for (const db of daysB) {
                  const diff = Math.abs(da - db)
                  if (diff === 1 || diff === 6) { // 6 = wrap-around (Sat-Sun)
                    adjacent = true
                    break
                  }
                }
              }

              if (adjacent) {
                flaggedPairs.add(pairKey)
                conflicts.push({
                  type: 'constraintViolation',
                  seriesIds: [idA, idB],
                  instances: [],
                  description: `${sA.title} and ${sB.title} have patterns on adjacent days`,
                })
              }
            }
          }

          break
        }
      }
    }

    // 3. Chain cannot fit detection
    for (const [childId, link] of linkReader.entries()) {
      const childInstances = instances.filter(i => i.seriesId === childId)
      const parentSeries = seriesById.get(link.parentId)
      if (!parentSeries) continue

      for (const childInst of childInstances) {
        const parentEnd = getParentEndTime(parentSeries, link.parentId, childInst.date)
        if (!parentEnd) continue

        const target = addMinutesToTime(parentEnd, link.distance || 0)
        const earliest = addMinutesToTime(target, -(link.earlyWobble || 0))
        const latest = addMinutesToTime(target, link.lateWobble || 0)

        // For items with explicit time, check original pattern time (configuration error detection)
        // For flexible items (no explicit time), check actual post-reflow position
        const internal = childInst as InternalInstance
        const childTimeStr = (internal._hasExplicitTime ? (internal._patternTime || childInst.time) : childInst.time) as string
        const earliestStr = earliest as string
        const latestStr = latest as string

        if (childTimeStr < earliestStr || childTimeStr > latestStr) {
          conflicts.push({
            type: 'chainCannotFit',
            seriesIds: [link.parentId, childId],
            instances: [
              { seriesId: childId, title: childInst.title, date: childInst.date },
            ],
            parentId: link.parentId,
            childId,
            description: `Child ${childInst.title} cannot fit within chain bounds`,
          })
        }
      }
    }

    return conflicts
  }

  function resolveConstraintTargetFromInstances(target: ConstraintTarget, _instances: ScheduleInstance[]): string[] {
    if (target.type === 'tag') {
      // Resolve tag via seriesReader
      return resolveTagFromReader(target.tag)
    }
    return target.seriesId ? [target.seriesId] : []
  }

  // ========== Public Interface ==========

  // Build schedule for [start, end) — end is exclusive
  async function getSchedule(start: LocalDate, end: LocalDate): Promise<Schedule> {
    // end is exclusive: [start, end)
    if ((end as string) < (start as string)) {
      throw new ValidationError(`getSchedule: end (${end}) is before start (${start})`)
    }
    if ((end as string) === (start as string)) {
      // Zero-width range [start, start) is empty — return immediately
      return { instances: [], conflicts: [] }
    }
    const key = `${start}:${end}`
    const cached = scheduleResultCache.get(key)
    if (cached && cached.generation === cacheGeneration) {
      return defensiveCopy(cached.schedule)
    }
    const schedule = await buildSchedule(start, end)
    scheduleResultCache.set(key, { generation: cacheGeneration, schedule })
    return defensiveCopy(schedule)
  }

  function getCacheStats() {
    return { ...cacheStats }
  }

  return {
    getSchedule,
    getCacheStats,
    invalidate,
  }
}
