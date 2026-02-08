/**
 * Reflow Algorithm
 *
 * CSP solver for scheduling: constraint propagation (AC-3) followed by
 * backtracking search with MRV variable ordering and ideal-time-first
 * value ordering. Guarantees finding a valid arrangement if one exists.
 */

import type { LocalDate, LocalTime, LocalDateTime } from './time-date'
import type { SeriesId } from './types'
import type { Duration } from './core'
import { addMinutes, addDays, minutesBetween, dateOf, timeOf, makeDateTime } from './time-date'

// ============================================================================
// Types
// ============================================================================

export type Instance = {
  seriesId: SeriesId
  fixed: boolean
  idealTime: LocalDateTime
  duration: Duration
  daysBefore: number
  daysAfter: number
  timeWindow?: { start: LocalTime; end: LocalTime }
  allDay: boolean
  parentId?: SeriesId
  chainDistance?: number
  earlyWobble?: Duration
  lateWobble?: Duration
}

export type ReflowInput = {
  series: SeriesInput[]
  constraints: InputConstraint[]
  chains: ChainInput[]
  today: LocalDate
  windowStart: LocalDate
  windowEnd: LocalDate
}

type SeriesInput = {
  id: SeriesId
  fixed: boolean
  idealTime: LocalDateTime
  duration: Duration
  daysBefore: number
  daysAfter: number
  timeWindow?: { start: LocalTime; end: LocalTime }
  allDay: boolean
  count: number
  cancelled: boolean
  rescheduledTo?: LocalDateTime
  conditionSatisfied: boolean
  adaptiveDuration: boolean
}

type InputConstraint = {
  type: string
  firstSeries?: SeriesId
  secondSeries?: SeriesId
}

type ChainInput = {
  parentId: SeriesId
  childId: SeriesId
  distance: number
  earlyWobble: number
  lateWobble: number
}

export type Domain = Map<Instance, LocalDateTime[]>

export type Assignment = {
  seriesId: SeriesId
  time: LocalDateTime
}

export type ConflictType = 'overlap' | 'chainCannotFit' | 'constraintViolation' | 'noValidSlot'

export type Conflict = {
  type: ConflictType
  severity: 'warning' | 'error'
  message?: string
}

export type ReflowOutput = {
  assignments: Assignment[]
  conflicts: Conflict[]
}

type InternalConstraint =
  | { type: 'noOverlap'; instances: [Instance, Instance] }
  | { type: 'mustBeBefore'; first: Instance; second: Instance }
  | { type: 'chain'; parent: Instance; child: Instance }

// ============================================================================
// Internal Helpers
// ============================================================================

function getDur(inst: Instance): number {
  return (inst.duration as number) ?? 60
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function makeDT(date: string, hour: number, minute: number): LocalDateTime {
  return `${date}T${pad2(hour)}:${pad2(minute)}:00` as LocalDateTime
}

// ============================================================================
// Pure Constraint Checking Functions
// ============================================================================

export function checkNoOverlap(
  startA: LocalDateTime,
  durA: Duration,
  startB: LocalDateTime,
  durB: Duration
): boolean {
  const endA = addMinutes(startA, durA as number)
  const endB = addMinutes(startB, durB as number)
  return (endA as string) <= (startB as string) || (endB as string) <= (startA as string)
}

export function checkChainConstraint(opts: {
  parentScheduledEnd: LocalDateTime
  parentActualEnd?: LocalDateTime
  parentCompleted?: boolean
  childStart: LocalDateTime
  chainDistance: number
  earlyWobble: Duration
  lateWobble: Duration
}): boolean {
  const parentEnd = (opts.parentCompleted && opts.parentActualEnd)
    ? opts.parentActualEnd
    : opts.parentScheduledEnd
  const target = addMinutes(parentEnd, opts.chainDistance)
  const earliest = addMinutes(target, -(opts.earlyWobble as number))
  const latest = addMinutes(target, opts.lateWobble as number)
  return (opts.childStart as string) >= (earliest as string) &&
         (opts.childStart as string) <= (latest as string)
}

export function calculateWorkloadScore(
  date: LocalDate,
  workload: Map<string, number>
): number {
  return workload.get(date as string) ?? 0
}

// ============================================================================
// Phase 1: Generate Instances
// ============================================================================

export function generateInstances(input: ReflowInput): Instance[] {
  const instances: Instance[] = []

  for (const s of input.series) {
    if (s.cancelled) continue
    if (s.conditionSatisfied === false) continue

    const chain = input.chains.find(c => (c.childId as string) === (s.id as string))
    const idealDate = dateOf(s.idealTime)
    const idealTimeStr = timeOf(s.idealTime)
    const count = s.count || 1

    for (let i = 0; i < count; i++) {
      const instanceDate = addDays(idealDate, i)
      const instanceIdealTime = i === 0 && s.rescheduledTo
        ? s.rescheduledTo
        : makeDateTime(instanceDate, idealTimeStr)

      const inst: Instance = {
        seriesId: s.id,
        fixed: s.fixed,
        idealTime: instanceIdealTime,
        duration: s.duration,
        daysBefore: s.daysBefore ?? 0,
        daysAfter: s.daysAfter ?? 0,
        ...(s.timeWindow ? { timeWindow: s.timeWindow } : {}),
        allDay: s.allDay ?? false,
      }

      if (chain) {
        inst.parentId = chain.parentId
        inst.chainDistance = chain.distance
        inst.earlyWobble = chain.earlyWobble as unknown as Duration
        inst.lateWobble = chain.lateWobble as unknown as Duration
      }

      instances.push(inst)
    }
  }

  return instances
}

// ============================================================================
// Phase 3: Compute Domains
// ============================================================================

export function computeDomains(instances: Instance[]): Map<Instance, LocalDateTime[]> {
  const domains = new Map<Instance, LocalDateTime[]>()

  for (const inst of instances) {
    // All-day excluded
    if (inst.allDay) continue

    // Fixed: single slot
    if (inst.fixed) {
      domains.set(inst, [inst.idealTime])
      continue
    }

    // Chain child: compute relative to parent's ideal
    if (inst.parentId) {
      const parent = instances.find(i => (i.seriesId as string) === (inst.parentId as string))
      if (parent) {
        const parentDur = getDur(parent)
        const parentEnd = addMinutes(parent.idealTime, parentDur)
        const distance = inst.chainDistance ?? 0
        const early = (inst.earlyWobble as number) ?? 0
        const late = (inst.lateWobble as number) ?? 0
        const target = addMinutes(parentEnd, distance)
        const earliest = addMinutes(target, -early)
        const latest = addMinutes(target, late)
        domains.set(inst, generateSlotsBetween(earliest, latest))
        continue
      }
    }

    // Flexible: generate 5-min increments
    const idealDate = (inst.idealTime as string).substring(0, 10)
    const daysBefore = inst.daysBefore ?? 0
    const daysAfter = inst.daysAfter ?? 0

    const allSlots: LocalDateTime[] = []

    for (let d = -daysBefore; d <= daysAfter; d++) {
      const currentDate = addDays(idealDate as LocalDate, d) as string

      if (inst.timeWindow) {
        const startH = parseInt((inst.timeWindow.start as string).substring(0, 2))
        const startM = parseInt((inst.timeWindow.start as string).substring(3, 5))
        const endH = parseInt((inst.timeWindow.end as string).substring(0, 2))
        const endM = parseInt((inst.timeWindow.end as string).substring(3, 5))

        let h = startH
        let m = startM
        while (h < endH || (h === endH && m <= endM)) {
          allSlots.push(makeDT(currentDate, h, m))
          m += 5
          if (m >= 60) { m -= 60; h++ }
        }
      } else {
        // Full day at 5-min increments
        for (let h = 0; h < 24; h++) {
          for (let m = 0; m < 60; m += 5) {
            allSlots.push(makeDT(currentDate, h, m))
          }
        }
      }
    }

    domains.set(inst, allSlots)
  }

  return domains
}

function generateSlotsBetween(earliest: LocalDateTime, latest: LocalDateTime): LocalDateTime[] {
  const slots: LocalDateTime[] = []
  let current = earliest
  while ((current as string) <= (latest as string)) {
    slots.push(current)
    current = addMinutes(current, 5)
  }
  return slots
}

// ============================================================================
// Phase 4: Constraint Propagation (AC-3)
// ============================================================================

export function propagateConstraints(
  inputDomains: Map<Instance, LocalDateTime[]>,
  constraints: InternalConstraint[]
): Map<Instance, LocalDateTime[]> {
  // Deep copy domains
  const domains = new Map<Instance, LocalDateTime[]>()
  for (const [inst, domain] of inputDomains) {
    domains.set(inst, [...domain])
  }

  if (constraints.length === 0) return domains

  // Build initial arc queue: [variable, other, constraint]
  type Arc = [Instance, Instance, any]
  const queue: Arc[] = []

  for (const c of constraints) {
    for (const [variable, other] of getArcPairs(c)) {
      queue.push([variable, other, c])
    }
  }

  while (queue.length > 0) {
    const [variable, other, constraint] = queue.shift()!

    const varDomain = domains.get(variable)
    if (!varDomain || varDomain.length === 0) continue

    const otherDomain = domains.get(other)
    if (!otherDomain) continue  // Other not in constraint graph

    if (otherDomain.length === 0) {
      // Other has empty domain → no support exists for any value
      const varDomain = domains.get(variable)
      if (varDomain && varDomain.length > 0) {
        domains.set(variable, [])
        requeueArcs(variable, constraint, constraints, queue)
      }
      continue
    }

    const newDomain: LocalDateTime[] = []

    for (const v of varDomain) {
      let supported = false
      for (const w of otherDomain) {
        if (isArcConsistent(constraint, variable, v, other, w)) {
          supported = true
          break
        }
      }
      if (supported) newDomain.push(v)
    }

    if (newDomain.length < varDomain.length) {
      domains.set(variable, newDomain)
      requeueArcs(variable, constraint, constraints, queue)
    }
  }

  return domains
}

function getArcPairs(constraint: InternalConstraint): [Instance, Instance][] {
  if (constraint.type === 'noOverlap') {
    return [
      [constraint.instances[0], constraint.instances[1]],
      [constraint.instances[1], constraint.instances[0]],
    ]
  }
  if (constraint.type === 'mustBeBefore') {
    return [
      [constraint.first, constraint.second],
      [constraint.second, constraint.first],
    ]
  }
  if (constraint.type === 'chain') {
    return [
      [constraint.parent, constraint.child],
      [constraint.child, constraint.parent],
    ]
  }
  return []
}

function requeueArcs(
  changedVariable: Instance,
  sourceConstraint: InternalConstraint,
  allConstraints: InternalConstraint[],
  queue: [Instance, Instance, InternalConstraint][]
): void {
  for (const c of allConstraints) {
    for (const [v, o] of getArcPairs(c)) {
      if (o === changedVariable) {
        queue.push([v, o, c])
      }
    }
  }
}

function isArcConsistent(
  constraint: InternalConstraint,
  varInst: Instance,
  varVal: LocalDateTime,
  otherInst: Instance,
  otherVal: LocalDateTime
): boolean {
  if (constraint.type === 'noOverlap') {
    // One-directional: varVal_start NOT in [otherVal_start, otherVal_start + otherDur)
    const otherDur = getDur(otherInst)
    const otherEnd = addMinutes(otherVal, otherDur) as string
    return !((varVal as string) >= (otherVal as string) && (varVal as string) < otherEnd)
  }

  if (constraint.type === 'mustBeBefore') {
    if (varInst === constraint.first) {
      // Variable is "first" → need varVal < otherVal
      return (varVal as string) < (otherVal as string)
    } else {
      // Variable is "second" → need otherVal < varVal
      return (otherVal as string) < (varVal as string)
    }
  }

  if (constraint.type === 'chain') {
    if (varInst === constraint.child) {
      // Revising child against parent
      const parentDur = getDur(otherInst)
      const parentEnd = addMinutes(otherVal, parentDur)
      const distance = varInst.chainDistance ?? 0
      const early = (varInst.earlyWobble as number) ?? 0
      const late = (varInst.lateWobble as number) ?? 0
      const target = addMinutes(parentEnd, distance)
      const earliest = addMinutes(target, -early) as string
      const latest = addMinutes(target, late) as string
      return (varVal as string) >= earliest && (varVal as string) <= latest
    } else {
      // Revising parent against child: check if some child value is valid for this parent value
      const child = otherInst
      const parentDur = getDur(varInst)
      const parentEnd = addMinutes(varVal, parentDur)
      const distance = child.chainDistance ?? 0
      const early = (child.earlyWobble as number) ?? 0
      const late = (child.lateWobble as number) ?? 0
      const target = addMinutes(parentEnd, distance)
      const earliest = addMinutes(target, -early) as string
      const latest = addMinutes(target, late) as string
      return (otherVal as string) >= earliest && (otherVal as string) <= latest
    }
  }

  return true
}

// ============================================================================
// Phase 5: Backtracking Search
// ============================================================================

export function backtrackSearch(
  instances: Instance[],
  domains: Map<Instance, LocalDateTime[]>,
  constraints: any[],
  options?: { workload?: Map<string, number> }
): Map<Instance, LocalDateTime> | null {
  // Filter to instances that have domains
  const withDomains = instances.filter(i => domains.has(i))

  // Sort by variable ordering
  const sorted = sortByVariableOrdering(withDomains, domains)

  const assignment = new Map<Instance, LocalDateTime>()
  const result = backtrack(sorted, 0, assignment, domains, constraints, options?.workload)
  return result
}

function sortByVariableOrdering(instances: Instance[], domains: Map<Instance, LocalDateTime[]>): Instance[] {
  // Compute chain depths
  const depthMap = new Map<Instance, number>()
  for (const inst of instances) {
    let depth = 0
    let current: Instance | undefined = inst
    const seen = new Set<string>()
    while (current?.parentId && !seen.has(current.seriesId as string)) {
      seen.add(current.seriesId as string)
      depth++
      current = instances.find(i => (i.seriesId as string) === (current!.parentId as string))
    }
    depthMap.set(inst, depth)
  }

  return [...instances].sort((a, b) => {
    // 1. Fixed first
    if (a.fixed && !b.fixed) return -1
    if (!a.fixed && b.fixed) return 1

    // 2. Lower chain depth first (roots before children)
    const depthA = depthMap.get(a) ?? 0
    const depthB = depthMap.get(b) ?? 0
    if (depthA !== depthB) return depthA - depthB

    // 3. MRV: smallest domain first
    const domA = domains.get(a)?.length ?? 0
    const domB = domains.get(b)?.length ?? 0
    return domA - domB
  })
}

function sortByValueOrdering(
  values: LocalDateTime[],
  inst: Instance,
  workload?: Map<string, number>
): LocalDateTime[] {
  if (values.length <= 1) return values

  return [...values].sort((a, b) => {
    // 1. Distance from ideal time
    const distA = inst.idealTime ? Math.abs(minutesBetween(inst.idealTime, a)) : 0
    const distB = inst.idealTime ? Math.abs(minutesBetween(inst.idealTime, b)) : 0
    if (distA !== distB) return distA - distB

    // 2. Workload score (lower = preferred)
    if (workload) {
      const dateA = (a as string).substring(0, 10)
      const dateB = (b as string).substring(0, 10)
      const loadA = workload.get(dateA) ?? 0
      const loadB = workload.get(dateB) ?? 0
      if (loadA !== loadB) return loadA - loadB
    }

    // 3. Chronological tiebreak
    return (a as string).localeCompare(b as string)
  })
}

function backtrack(
  instances: Instance[],
  index: number,
  assignment: Map<Instance, LocalDateTime>,
  domains: Map<Instance, LocalDateTime[]>,
  constraints: any[],
  workload?: Map<string, number>
): Map<Instance, LocalDateTime> | null {
  if (index >= instances.length) {
    return new Map(assignment)
  }

  const inst = instances[index]!
  const domain = domains.get(inst) || []
  const sortedValues = sortByValueOrdering(domain, inst, workload)

  for (const value of sortedValues) {
    if (isConsistentWithAssignment(inst, value, assignment, constraints)) {
      assignment.set(inst, value)
      const result = backtrack(instances, index + 1, assignment, domains, constraints, workload)
      if (result) return result
      assignment.delete(inst)
    }
  }

  return null
}

function isConsistentWithAssignment(
  inst: Instance,
  value: LocalDateTime,
  assignment: Map<Instance, LocalDateTime>,
  constraints: InternalConstraint[]
): boolean {
  for (const c of constraints) {
    if (c.type === 'noOverlap') {
      const [a, b] = c.instances
      if (a === inst) {
        const bVal = assignment.get(b)
        if (bVal !== undefined) {
          if (!checkNoOverlap(value, getDur(inst) as Duration, bVal, getDur(b) as Duration)) return false
        }
      } else if (b === inst) {
        const aVal = assignment.get(a)
        if (aVal !== undefined) {
          if (!checkNoOverlap(aVal, getDur(a) as Duration, value, getDur(inst) as Duration)) return false
        }
      }
    }

    if (c.type === 'mustBeBefore') {
      if (c.first === inst) {
        const secondVal = assignment.get(c.second)
        if (secondVal !== undefined) {
          if (!((value as string) < (secondVal as string))) return false
        }
      } else if (c.second === inst) {
        const firstVal = assignment.get(c.first)
        if (firstVal !== undefined) {
          if (!((firstVal as string) < (value as string))) return false
        }
      }
    }

    if (c.type === 'chain') {
      if (c.child === inst) {
        const parentVal = assignment.get(c.parent)
        if (parentVal !== undefined) {
          const parentDur = getDur(c.parent)
          const parentEnd = addMinutes(parentVal, parentDur)
          const distance = inst.chainDistance ?? 0
          const early = (inst.earlyWobble as number) ?? 0
          const late = (inst.lateWobble as number) ?? 0
          const target = addMinutes(parentEnd, distance)
          const earliest = addMinutes(target, -early) as string
          const latest = addMinutes(target, late) as string
          if ((value as string) < earliest || (value as string) > latest) return false
        }
      } else if (c.parent === inst) {
        const childVal = assignment.get(c.child)
        if (childVal !== undefined) {
          const parentDur = getDur(inst)
          const parentEnd = addMinutes(value, parentDur)
          const child = c.child as Instance
          const distance = child.chainDistance ?? 0
          const early = (child.earlyWobble as number) ?? 0
          const late = (child.lateWobble as number) ?? 0
          const target = addMinutes(parentEnd, distance)
          const earliest = addMinutes(target, -early) as string
          const latest = addMinutes(target, late) as string
          if ((childVal as string) < earliest || (childVal as string) > latest) return false
        }
      }
    }
  }

  return true
}

// ============================================================================
// Phase 6: Handle No Solution
// ============================================================================

export function handleNoSolution(
  instances: Instance[],
  domains: Map<Instance, LocalDateTime[]>,
  constraints: InternalConstraint[]
): { assignments: Map<Instance, LocalDateTime>; conflicts: Conflict[] } {
  const assignments = new Map<Instance, LocalDateTime>()
  const conflicts: Conflict[] = []

  // Place all fixed items at ideal time
  for (const inst of instances) {
    if (inst.fixed) {
      assignments.set(inst, inst.idealTime)
    }
  }

  // Best-effort placement for flexible items
  for (const inst of instances) {
    if (inst.fixed) continue

    const domain = domains.get(inst)
    if (domain && domain.length > 0) {
      // Pick the first available slot (ideally closest to ideal)
      const sorted = inst.idealTime
        ? [...domain].sort((a, b) =>
            Math.abs(minutesBetween(inst.idealTime, a)) - Math.abs(minutesBetween(inst.idealTime, b))
          )
        : domain
      assignments.set(inst, sorted[0]!)
    } else if (inst.idealTime) {
      assignments.set(inst, inst.idealTime)
    }
  }

  // Detect overlap conflicts between all placed pairs
  const placed = [...assignments.entries()]
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [instA, timeA] = placed[i]!
      const [instB, timeB] = placed[j]!
      if (!checkNoOverlap(timeA, getDur(instA) as Duration, timeB, getDur(instB) as Duration)) {
        conflicts.push({
          type: 'overlap',
          severity: 'warning',
          message: `Overlap: ${instA.seriesId} at ${timeA} and ${instB.seriesId} at ${timeB}`,
        })
      }
    }
  }

  // Detect chain conflicts
  for (const inst of instances) {
    if (!inst.parentId) continue

    const domain = domains.get(inst)
    if (!domain || domain.length === 0) {
      conflicts.push({
        type: 'chainCannotFit',
        severity: 'error',
        message: `No valid slots for chain child ${inst.seriesId}`,
      })
    }
  }

  // Detect constraint violations
  for (const c of constraints) {
    if (c.type === 'mustBeBefore') {
      const firstTime = assignments.get(c.first)
      const secondTime = assignments.get(c.second)
      if (firstTime && secondTime) {
        if (!((firstTime as string) < (secondTime as string))) {
          conflicts.push({
            type: 'constraintViolation',
            severity: 'error',
            message: `${c.first.seriesId} at ${firstTime} must be before ${c.second.seriesId} at ${secondTime}`,
          })
        }
      }
    }
  }

  // Detect noValidSlot for flexible non-chain items
  for (const inst of instances) {
    if (inst.fixed) continue
    if (inst.parentId) continue
    const domain = domains.get(inst)
    if (!domain || domain.length === 0) {
      conflicts.push({
        type: 'noValidSlot',
        severity: 'warning',
        message: `No valid slot for ${inst.seriesId}`,
      })
    }
  }

  return { assignments, conflicts }
}

// ============================================================================
// Full Pipeline
// ============================================================================

export function reflow(input: ReflowInput): ReflowOutput {
  // 1. Generate instances
  const instances = generateInstances(input)

  // Separate all-day and timed
  const timedInstances = instances.filter(i => !i.allDay)
  const allDayInstances = instances.filter(i => i.allDay)

  // 2. Compute domains
  const domains = computeDomains(instances)

  // 3. Build internal constraints
  const constraints: InternalConstraint[] = []

  // Auto-generate noOverlap between all timed pairs
  for (let i = 0; i < timedInstances.length; i++) {
    for (let j = i + 1; j < timedInstances.length; j++) {
      constraints.push({ type: 'noOverlap', instances: [timedInstances[i]!, timedInstances[j]!] })
    }
  }

  // Map input constraints to internal
  for (const c of input.constraints) {
    if (c.type === 'mustBeBefore') {
      const first = timedInstances.find(i => (i.seriesId as string) === (c.firstSeries as string))
      const second = timedInstances.find(i => (i.seriesId as string) === (c.secondSeries as string))
      if (first && second) {
        constraints.push({ type: 'mustBeBefore', first, second })
      }
    }
  }

  // Map chains to chain constraints
  for (const chain of input.chains) {
    const parent = timedInstances.find(i => (i.seriesId as string) === (chain.parentId as string))
    const child = timedInstances.find(i => (i.seriesId as string) === (chain.childId as string))
    if (parent && child) {
      constraints.push({ type: 'chain', parent, child })
    }
  }

  // 4. Propagate constraints (AC-3)
  const propagated = propagateConstraints(domains, constraints)

  // 5. Backtracking search
  const solution = backtrackSearch(timedInstances, propagated, constraints)

  // 6. Build output
  const outputAssignments: Assignment[] = []

  if (solution !== null) {
    for (const [inst, time] of solution) {
      outputAssignments.push({ seriesId: inst.seriesId, time })
    }
    for (const inst of allDayInstances) {
      outputAssignments.push({ seriesId: inst.seriesId, time: inst.idealTime })
    }
    return { assignments: outputAssignments, conflicts: [] }
  }

  // 7. Handle no solution
  const { assignments: bestEffort, conflicts } = handleNoSolution(
    timedInstances, propagated, constraints
  )
  for (const [inst, time] of bestEffort) {
    outputAssignments.push({ seriesId: inst.seriesId, time })
  }
  for (const inst of allDayInstances) {
    outputAssignments.push({ seriesId: inst.seriesId, time: inst.idealTime })
  }
  return { assignments: outputAssignments, conflicts }
}
