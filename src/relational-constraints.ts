/**
 * Relational Constraints Module
 *
 * Constraint CRUD, target resolution, constraint checking, and violation detection.
 * Constraints define rules about how instances of different series relate to each
 * other in the schedule. Day-level (mustBeOnSameDay, cantBeOnSameDay) and
 * intra-day ordering constraints (mustBeBefore, mustBeAfter, mustBeNextTo,
 * cantBeNextTo, mustBeWithin).
 */

import type { Adapter, RelationalConstraint as AdapterConstraint } from './adapter'
import type { LocalDate, LocalDateTime, LocalTime } from './time-date'
import { makeDateTime, makeTime, addMinutes, addDays, minutesBetween } from './time-date'
import { expandPattern, type Pattern } from './pattern-expansion'

// ============================================================================
// Types
// ============================================================================

type ConstraintResult<T> = { ok: true; value: T } | { ok: false; error: { type: string; message: string } }

export type ConstraintTarget =
  | { type: 'seriesId'; seriesId: string }
  | { type: 'tag'; tag: string }

export type Constraint = {
  id: string
  type: string
  source: ConstraintTarget
  dest: ConstraintTarget
  withinMinutes?: number
}

export type ConstraintViolation = {
  sourceInstance: string
  destInstance: string
  description: string
  date: LocalDate
}

type ConstraintInput = {
  type: string
  source: ConstraintTarget
  dest: ConstraintTarget
  withinMinutes?: number
}

type TimedInstance = {
  seriesId: string
  startTime: LocalDateTime
  endTime: LocalDateTime
  allDay: boolean
  date: LocalDate
}

// ============================================================================
// Helpers
// ============================================================================

function ok<T>(value: T): ConstraintResult<T> {
  return { ok: true, value }
}

function err<T>(type: string, message: string): ConstraintResult<T> {
  return { ok: false, error: { type, message } }
}

function toAdapterTarget(t: ConstraintTarget): { tag: string } | { seriesId: string } {
  if (t.type === 'tag') return { tag: t.tag }
  return { seriesId: t.seriesId }
}

function fromAdapterTarget(t: { tag: string } | { seriesId: string }): ConstraintTarget {
  if ('tag' in t) return { type: 'tag', tag: t.tag }
  return { type: 'seriesId', seriesId: t.seriesId }
}

function toDomain(c: AdapterConstraint): Constraint {
  const result: Constraint = {
    id: c.id,
    type: c.type,
    source: fromAdapterTarget(c.sourceTarget),
    dest: fromAdapterTarget(c.destinationTarget),
  }
  if (c.type === 'mustBeWithin' && c.withinMinutes !== undefined) {
    result.withinMinutes = c.withinMinutes as number
  }
  return result
}

async function getInstanceInfo(
  adapter: Adapter,
  seriesId: string,
  date: LocalDate
): Promise<TimedInstance | null> {
  const series = await adapter.getSeries(seriesId)
  if (!series) return null

  // Check date bounds
  if (series.startDate && (date as string) < (series.startDate as string)) return null
  if (series.endDate && (date as string) > (series.endDate as string)) return null

  // Expand patterns for this date
  const patterns = await adapter.getPatternsBySeries(seriesId)
  let found = false
  for (const p of patterns) {
    const expanded = expandPattern(
      p as unknown as Pattern,
      { start: date, end: date },
      (series.startDate ?? date) as LocalDate
    )
    if (expanded.has(date)) { found = true; break }
  }

  if (!found) return null

  // Check exceptions
  const exceptions = await adapter.getExceptionsBySeries(seriesId)
  const exception = exceptions.find(e => (e.originalDate as string) === (date as string))
  if (exception?.type === 'cancelled') return null

  const isAllDay = series['allDay'] || series['timeOfDay'] === 'allDay'
  if (isAllDay) {
    return {
      seriesId,
      startTime: makeDateTime(date, makeTime(0, 0, 0)),
      endTime: makeDateTime(date, makeTime(23, 59, 59)),
      allDay: true,
      date,
    }
  }

  // Determine start time
  let startTime: LocalDateTime
  if (exception?.type === 'rescheduled' && exception.newTime) {
    startTime = exception.newTime
  } else {
    startTime = makeDateTime(date, series['timeOfDay'] as LocalTime)
  }

  const duration = typeof series['duration'] === 'number' ? series['duration'] : 0
  const endTime = addMinutes(startTime, duration)

  return { seriesId, startTime, endTime, allDay: false, date }
}

// ============================================================================
// Public API
// ============================================================================

export async function addConstraint(
  adapter: Adapter,
  input: ConstraintInput
): Promise<ConstraintResult<{ id: string }>> {
  // Validate withinMinutes for mustBeWithin
  if (input.type === 'mustBeWithin') {
    if (input.withinMinutes === undefined || input.withinMinutes < 0) {
      return err('ValidationError', 'withinMinutes must be >= 0 for mustBeWithin')
    }
  }

  const id = crypto.randomUUID()
  const adapterConstraint: AdapterConstraint = {
    id,
    type: input.type,
    sourceTarget: toAdapterTarget(input.source),
    destinationTarget: toAdapterTarget(input.dest),
  }

  if (input.type === 'mustBeWithin' && input.withinMinutes !== undefined) {
    adapterConstraint.withinMinutes = input.withinMinutes
  }

  await adapter.createRelationalConstraint(adapterConstraint)
  return ok({ id })
}

export async function getConstraint(
  adapter: Adapter,
  id: string
): Promise<Constraint | null> {
  const c = await adapter.getRelationalConstraint(id)
  if (!c) return null
  return toDomain(c)
}

export async function getAllConstraints(adapter: Adapter): Promise<Constraint[]> {
  const constraints = await adapter.getAllRelationalConstraints()
  return constraints.map(toDomain)
}

export async function deleteConstraint(
  adapter: Adapter,
  id: string
): Promise<void> {
  await adapter.deleteRelationalConstraint(id)
}

export async function resolveTarget(
  adapter: Adapter,
  target: ConstraintTarget
): Promise<string[]> {
  if (target.type === 'seriesId') {
    const series = await adapter.getSeries(target.seriesId)
    return series ? [target.seriesId] : []
  }
  const series = await adapter.getSeriesByTag(target.tag)
  return series.map(s => s.id)
}

export async function checkConstraint(
  adapter: Adapter,
  constraint: ConstraintInput,
  date: LocalDate
): Promise<boolean> {
  // Resolve targets
  const sourceIds = await resolveTarget(adapter, constraint.source)
  const destIds = await resolveTarget(adapter, constraint.dest)

  // Get instances on this date
  const sourceInstances: TimedInstance[] = []
  for (const id of sourceIds) {
    const inst = await getInstanceInfo(adapter, id, date)
    if (inst) sourceInstances.push(inst)
  }

  const destInstances: TimedInstance[] = []
  for (const id of destIds) {
    const inst = await getInstanceInfo(adapter, id, date)
    if (inst) destInstances.push(inst)
  }

  // Empty source → trivially satisfied for ALL constraint types
  if (sourceInstances.length === 0) return true

  // Day-level constraints
  if (constraint.type === 'mustBeOnSameDay') {
    return destInstances.length > 0
  }
  if (constraint.type === 'cantBeOnSameDay') {
    return destInstances.length === 0
  }

  // Intra-day constraints: empty dest → trivially satisfied
  if (destInstances.length === 0) return true

  // Filter out all-day instances for intra-day constraints
  const sourceTimed = sourceInstances.filter(i => !i.allDay)
  const destTimed = destInstances.filter(i => !i.allDay)

  // All-day excluded → satisfied
  if (sourceTimed.length === 0 || destTimed.length === 0) return true

  switch (constraint.type) {
    case 'mustBeBefore':
      // Source must start strictly before dest starts
      return sourceTimed.every(s =>
        destTimed.every(d => (s.startTime as string) < (d.startTime as string))
      )

    case 'mustBeAfter':
      // Source must start strictly after dest starts
      return sourceTimed.every(s =>
        destTimed.every(d => (s.startTime as string) > (d.startTime as string))
      )

    case 'mustBeWithin': {
      const withinMinutes = constraint.withinMinutes ?? 0
      return sourceTimed.every(s =>
        destTimed.some(d => {
          // Gap between nearest edges (0 if overlapping)
          const gapSD = minutesBetween(s.endTime, d.startTime)
          const gapDS = minutesBetween(d.endTime, s.startTime)
          const gap = Math.max(0, gapSD, gapDS)
          return gap <= withinMinutes
        })
      )
    }

    case 'mustBeNextTo':
      return areAdjacentOnDate(adapter, sourceTimed, destTimed, date)

    case 'cantBeNextTo': {
      const adjacent = await areAdjacentOnDate(adapter, sourceTimed, destTimed, date)
      return !adjacent
    }

    default:
      return true
  }
}

async function areAdjacentOnDate(
  adapter: Adapter,
  sourceTimed: TimedInstance[],
  destTimed: TimedInstance[],
  date: LocalDate
): Promise<boolean> {
  // Get ALL timed instances on this date across all series
  const allSeries = await adapter.getAllSeries()
  const allInstances: TimedInstance[] = []

  for (const series of allSeries) {
    const inst = await getInstanceInfo(adapter, series.id, date)
    if (inst && !inst.allDay) allInstances.push(inst)
  }

  // Sort by start time
  allInstances.sort((a, b) => (a.startTime as string).localeCompare(b.startTime as string))

  const sourceIds = new Set(sourceTimed.map(s => s.seriesId))
  const destIds = new Set(destTimed.map(d => d.seriesId))

  // Check if any source and dest are adjacent in sorted order
  for (let i = 0; i < allInstances.length - 1; i++) {
    const curr = allInstances[i]!
    const next = allInstances[i + 1]!

    if (
      (sourceIds.has(curr.seriesId) && destIds.has(next.seriesId)) ||
      (destIds.has(curr.seriesId) && sourceIds.has(next.seriesId))
    ) {
      return true
    }
  }

  return false
}

export async function getConstraintViolations(
  adapter: Adapter,
  constraint: ConstraintInput,
  range: { start: LocalDate; end: LocalDate }
): Promise<ConstraintViolation[]> {
  const violations: ConstraintViolation[] = []

  let current = range.start
  while ((current as string) <= (range.end as string)) {
    const satisfied = await checkConstraint(adapter, constraint, current)

    if (!satisfied) {
      const sourceIds = await resolveTarget(adapter, constraint.source)
      const destIds = await resolveTarget(adapter, constraint.dest)

      let sourceInst = ''
      let destInst = ''
      let sourceTime = ''
      let destTime = ''

      for (const id of sourceIds) {
        const inst = await getInstanceInfo(adapter, id, current)
        if (inst && !inst.allDay) {
          sourceInst = `${id}@${current}`
          sourceTime = inst.startTime as string
          break
        }
      }

      for (const id of destIds) {
        const inst = await getInstanceInfo(adapter, id, current)
        if (inst && !inst.allDay) {
          destInst = `${id}@${current}`
          destTime = inst.startTime as string
          break
        }
      }

      violations.push({
        sourceInstance: sourceInst,
        destInstance: destInst,
        description: `Constraint '${constraint.type}' violated on ${current}: source at ${sourceTime} must be before dest at ${destTime}`,
        date: current,
      })
    }

    current = addDays(current, 1)
  }

  return violations
}
