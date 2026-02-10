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

export type ChainNode = {
  instance: Instance
  distance: number
  earlyWobble: number
  lateWobble: number
  children: ChainNode[]
}

export type ChainTree = Map<Instance, ChainNode[]>

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
// Chain Tree Helpers (Derived Variables)
// ============================================================================

export function buildChainTree(instances: Instance[], chains: ChainInput[]): ChainTree {
  const tree: ChainTree = new Map()
  if (chains.length === 0) return tree

  // Index instances by seriesId for fast lookup
  const instBySeriesId = new Map<string, Instance>()
  for (const inst of instances) {
    instBySeriesId.set(inst.seriesId as string, inst)
  }

  // Build parent→children adjacency
  const childrenOf = new Map<string, Array<{ instance: Instance, chain: ChainInput }>>()
  for (const chain of chains) {
    const childInst = instBySeriesId.get(chain.childId as string)
    if (!childInst) continue
    const parentId = chain.parentId as string
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, [])
    childrenOf.get(parentId)!.push({ instance: childInst, chain })
  }

  // Recursively build nodes
  function buildNodes(parentSeriesId: string): ChainNode[] {
    const entries = childrenOf.get(parentSeriesId)
    if (!entries) return []
    return entries.map(({ instance, chain }) => ({
      instance,
      distance: chain.distance,
      earlyWobble: chain.earlyWobble,
      lateWobble: chain.lateWobble,
      children: buildNodes(instance.seriesId as string),
    }))
  }

  // Find roots: instances that are parents in chains but NOT children in any chain
  const allChildIds = new Set(chains.map(c => c.childId as string))
  for (const chain of chains) {
    const parentId = chain.parentId as string
    if (allChildIds.has(parentId)) continue // This parent is itself a child — not a root
    const parentInst = instBySeriesId.get(parentId)
    if (!parentInst || tree.has(parentInst)) continue
    const children = buildNodes(parentId)
    if (children.length > 0) tree.set(parentInst, children)
  }

  return tree
}

type TimeRange = { start: string; end: string }

// Max depth for phantom/shadow recursion — beyond this, skip optimization.
// Practical chains are 3 levels max (laundry). Pathological 32-deep chains
// in the chain-depth test would cause exponential backtracking overhead.
const MAX_CHAIN_SHADOW_DEPTH = 8

export function chainShadowClear(
  parentTime: LocalDateTime,
  parentDur: number,
  children: ChainNode[],
  occupiedRanges: TimeRange[],
  depth: number = 0
): boolean {
  if (depth >= MAX_CHAIN_SHADOW_DEPTH) return true // Permissive beyond depth limit
  const parentEnd = addMinutes(parentTime, parentDur)

  for (const child of children) {
    const target = addMinutes(parentEnd, child.distance)
    const earliest = addMinutes(target, -child.earlyWobble)
    const latest = addMinutes(target, child.lateWobble)
    const childDur = getDur(child.instance)

    // Find ANY position in [earliest, latest] that avoids ALL occupied ranges
    let canFit = false
    let t = earliest
    while ((t as string) <= (latest as string)) {
      const tEnd = addMinutes(t, childDur) as string
      let overlaps = false
      for (const range of occupiedRanges) {
        if (!((tEnd <= range.start) || ((t as string) >= range.end))) {
          overlaps = true
          break
        }
      }
      if (!overlaps) {
        // This slot is clear — check grandchildren recursively
        if (child.children.length > 0) {
          if (chainShadowClear(t, childDur, child.children, occupiedRanges, depth + 1)) {
            canFit = true
            break
          }
        } else {
          canFit = true
          break
        }
      }
      t = addMinutes(t, 5)
    }

    if (!canFit) return false
  }

  return true
}

export function pruneByChainShadow(
  domains: Map<Instance, LocalDateTime[]>,
  chainTree: ChainTree,
  instances: Instance[]
): void {
  if (chainTree.size === 0) return

  // Collect fixed-item time ranges
  const fixedRanges: TimeRange[] = []
  for (const inst of instances) {
    if (inst.fixed && !inst.allDay) {
      const end = addMinutes(inst.idealTime, getDur(inst))
      fixedRanges.push({ start: inst.idealTime as string, end: end as string })
    }
  }
  if (fixedRanges.length === 0) return

  for (const [root, children] of chainTree) {
    const domain = domains.get(root)
    if (!domain || domain.length === 0) continue

    const pruned = domain.filter(slot =>
      chainShadowClear(slot, getDur(root), children, fixedRanges)
    )
    domains.set(root, pruned)
  }
}

function deriveChildTime(
  parentEnd: LocalDateTime,
  child: ChainNode,
  assignedRanges: TimeRange[]
): LocalDateTime {
  const target = addMinutes(parentEnd, child.distance)
  const earliest = addMinutes(target, -child.earlyWobble)
  const latest = addMinutes(target, child.lateWobble)
  const childDur = getDur(child.instance)

  function isFree(t: LocalDateTime): boolean {
    const tEnd = addMinutes(t, childDur) as string
    for (const range of assignedRanges) {
      if (!((tEnd <= range.start) || ((t as string) >= range.end))) return false
    }
    return true
  }

  // Prefer child's idealTime if it falls within the wobble range and is free.
  // This preserves completion-adjusted timing from buildSchedule.
  const ideal = child.instance.idealTime
  if (ideal && (ideal as string) >= (earliest as string) && (ideal as string) <= (latest as string)) {
    if (isFree(ideal)) return ideal
  }

  // Try chain target (parentEnd + distance)
  if (isFree(target)) return target

  // Scan wobble range for a free slot
  let t = earliest
  while ((t as string) <= (latest as string)) {
    if ((t as string) === (target as string) || (t as string) === (ideal as string)) {
      t = addMinutes(t, 5)
      continue
    }
    if (isFree(t)) return t
    t = addMinutes(t, 5)
  }

  // No free slot in wobble — fall back to target (overlap will be reported as conflict)
  return target
}

/**
 * Derive concrete child positions for phantom occupancy during backtracking.
 * Returns TimeRange[] for all derived children (recursive for grandchildren).
 * Mutates occupiedRanges by pushing derived child ranges (needed for sibling checking).
 */
function deriveChainPhantoms(
  parentTime: LocalDateTime,
  parentDur: number,
  children: ChainNode[],
  occupiedRanges: TimeRange[],
  depth: number = 0
): TimeRange[] {
  if (depth >= MAX_CHAIN_SHADOW_DEPTH) return [] // Stop deriving beyond depth limit
  const phantoms: TimeRange[] = []
  const parentEnd = addMinutes(parentTime, parentDur)

  for (const child of children) {
    const bestTime = deriveChildTime(parentEnd, child, occupiedRanges)
    const childDur = getDur(child.instance)
    const range: TimeRange = { start: bestTime as string, end: addMinutes(bestTime, childDur) as string }
    phantoms.push(range)
    occupiedRanges.push(range) // Needed for sibling/grandchild checking

    if (child.children.length > 0) {
      const grandPhantoms = deriveChainPhantoms(bestTime, childDur, child.children, occupiedRanges, depth + 1)
      phantoms.push(...grandPhantoms)
    }
  }

  return phantoms
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

    // Chain children are derived variables — not CSP variables
    if (inst.parentId) continue

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
      // Other has empty domain. Cascade selectively:
      // - noOverlap: trivially satisfied when one party absent → skip
      // - mustBeBefore: trivially satisfied when one party absent → skip
      // - chain (child revising against empty parent): child can't be placed → cascade
      // - chain (parent revising against empty child): parent is independent → skip
      if (constraint.type === 'noOverlap' || constraint.type === 'mustBeBefore') {
        continue
      }
      if (constraint.type === 'chain' && other !== (constraint as any).parent) {
        continue  // parent revising against empty child — parent is independent
      }
      // Chain child with empty parent → cascade to empty child's domain
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
    return checkNoOverlap(varVal, getDur(varInst) as Duration, otherVal, getDur(otherInst) as Duration)
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

type ConstraintIndex = Map<Instance, InternalConstraint[]>

function buildConstraintIndex(constraints: InternalConstraint[]): ConstraintIndex {
  const index: ConstraintIndex = new Map()
  for (const c of constraints) {
    if (c.type === 'noOverlap') {
      const [a, b] = c.instances
      if (!index.has(a)) index.set(a, [])
      if (!index.has(b)) index.set(b, [])
      index.get(a)!.push(c)
      index.get(b)!.push(c)
    } else if (c.type === 'mustBeBefore') {
      if (!index.has(c.first)) index.set(c.first, [])
      if (!index.has(c.second)) index.set(c.second, [])
      index.get(c.first)!.push(c)
      index.get(c.second)!.push(c)
    } else if (c.type === 'chain') {
      if (!index.has(c.parent)) index.set(c.parent, [])
      if (!index.has(c.child)) index.set(c.child, [])
      index.get(c.parent)!.push(c)
      index.get(c.child)!.push(c)
    }
  }
  return index
}

export function backtrackSearch(
  instances: Instance[],
  domains: Map<Instance, LocalDateTime[]>,
  constraints: InternalConstraint[],
  options?: { workload?: Map<string, number>; chainTree?: ChainTree }
): Map<Instance, LocalDateTime> | null {
  // Filter to instances that have domains
  const withDomains = instances.filter(i => domains.has(i))

  // Sort by variable ordering
  const sorted = sortByVariableOrdering(withDomains, domains)

  // Build constraint index for O(V) lookup instead of O(V²) scan
  const constraintIndex = buildConstraintIndex(constraints)

  const assignment = new Map<Instance, LocalDateTime>()
  const iterations = { count: 0, deadline: Date.now() + MAX_BACKTRACK_MS }
  const phantomRanges: TimeRange[] = []
  const result = backtrack(sorted, 0, assignment, domains, constraints, options?.workload, iterations, options?.chainTree, phantomRanges, constraintIndex)
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

const MAX_BACKTRACK_ITERATIONS = 100_000
const MAX_BACKTRACK_MS = 2_000 // Wall-clock time limit for backtracking

function backtrack(
  instances: Instance[],
  index: number,
  assignment: Map<Instance, LocalDateTime>,
  domains: Map<Instance, LocalDateTime[]>,
  constraints: InternalConstraint[],
  workload?: Map<string, number>,
  iterations?: { count: number; deadline?: number; bailed?: boolean },
  chainTree?: ChainTree,
  phantomRanges?: TimeRange[],
  constraintIndex?: ConstraintIndex
): Map<Instance, LocalDateTime> | null {
  if (iterations) {
    if (iterations.bailed) return null
    iterations.count++
    if (iterations.count > MAX_BACKTRACK_ITERATIONS) {
      iterations.bailed = true
      return null
    }
    // Check wall-clock every 1024 iterations to avoid Date.now() overhead
    if (iterations.deadline && (iterations.count & 0x3FF) === 0) {
      if (Date.now() > iterations.deadline) {
        iterations.bailed = true
        return null
      }
    }
  }

  if (index >= instances.length) {
    return new Map(assignment)
  }

  const phantoms = phantomRanges || []
  const inst = instances[index]!
  const domain = domains.get(inst) || []
  const sortedValues = sortByValueOrdering(domain, inst, workload)

  for (const value of sortedValues) {
    if (isConsistentWithAssignment(inst, value, assignment, constraints, chainTree, phantoms, constraintIndex)) {
      assignment.set(inst, value)

      // Phantom occupancy: when assigning a chain root, derive concrete child
      // positions and reserve them so future assignments can't steal those slots
      let phantomCount = 0
      if (chainTree) {
        const childNodes = chainTree.get(inst)
        if (childNodes && childNodes.length > 0) {
          const occupied: TimeRange[] = []
          for (const [ai, at] of assignment) {
            occupied.push({ start: at as string, end: addMinutes(at, getDur(ai)) as string })
          }
          occupied.push(...phantoms)
          const newPhantoms = deriveChainPhantoms(value, getDur(inst), childNodes, occupied)
          phantoms.push(...newPhantoms)
          phantomCount = newPhantoms.length
        }
      }

      const result = backtrack(instances, index + 1, assignment, domains, constraints, workload, iterations, chainTree, phantoms, constraintIndex)
      if (result) return result

      // Backtrack: remove phantoms for this root
      assignment.delete(inst)
      if (phantomCount > 0) {
        phantoms.splice(phantoms.length - phantomCount, phantomCount)
      }

      // Propagate bail signal — don't let the parent loop continue
      // trying values after the iteration/deadline limit has been reached
      if (iterations?.bailed) return null
    }
  }

  return null
}

function isConsistentWithAssignment(
  inst: Instance,
  value: LocalDateTime,
  assignment: Map<Instance, LocalDateTime>,
  constraints: InternalConstraint[],
  chainTree?: ChainTree,
  phantomRanges?: TimeRange[],
  constraintIndex?: ConstraintIndex
): boolean {
  // Use indexed constraints if available (O(V) instead of O(V²))
  const relevantConstraints = constraintIndex ? (constraintIndex.get(inst) || []) : constraints
  for (const c of relevantConstraints) {
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

  // Check against phantom ranges — derived chain children from other roots
  // that have been concretely placed during backtracking
  if (phantomRanges && phantomRanges.length > 0) {
    const instEnd = addMinutes(value, getDur(inst)) as string
    for (const range of phantomRanges) {
      if (!((instEnd <= range.start) || ((value as string) >= range.end))) {
        return false
      }
    }
  }

  // Chain shadow check: if this instance is a chain root, verify derived children
  // don't overlap any already-assigned items or phantom ranges
  if (chainTree) {
    const childNodes = chainTree.get(inst)
    if (childNodes && childNodes.length > 0) {
      const assignedRanges: TimeRange[] = []
      for (const [assignedInst, assignedTime] of assignment) {
        assignedRanges.push({
          start: assignedTime as string,
          end: addMinutes(assignedTime, getDur(assignedInst)) as string,
        })
      }
      // Also include this instance's own range
      assignedRanges.push({
        start: value as string,
        end: addMinutes(value, getDur(inst)) as string,
      })
      // Include phantom ranges from other chain roots' derived children
      if (phantomRanges) {
        assignedRanges.push(...phantomRanges)
      }
      if (!chainShadowClear(value, getDur(inst), childNodes, assignedRanges)) {
        return false
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
  constraints: InternalConstraint[],
  chainTree?: ChainTree
): { assignments: Map<Instance, LocalDateTime>; conflicts: Conflict[] } {
  const assignments = new Map<Instance, LocalDateTime>()
  const conflicts: Conflict[] = []

  // Place all fixed items at ideal time
  for (const inst of instances) {
    if (inst.fixed) {
      assignments.set(inst, inst.idealTime)
    }
  }

  // Derive children for fixed chain roots
  if (chainTree) {
    for (const [root, childNodes] of chainTree) {
      if (!root.fixed) continue
      const rootTime = assignments.get(root)
      if (!rootTime) continue
      const occupiedRanges: TimeRange[] = []
      for (const [ai, at] of assignments) {
        occupiedRanges.push({ start: at as string, end: addMinutes(at, getDur(ai)) as string })
      }
      deriveAndPlaceChildren(rootTime, getDur(root), childNodes, occupiedRanges, assignments)
    }
  }

  // Build occupied-slot set for O(1) overlap checks instead of scanning all assignments
  const occupiedSlots = new Set<string>()
  function markOccupied(time: LocalDateTime, dur: number): void {
    let t = time
    for (let m = 0; m < dur; m += 5) {
      occupiedSlots.add(t as string)
      t = addMinutes(t, 5)
    }
  }
  function isSlotFree(time: LocalDateTime, dur: number): boolean {
    let t = time
    for (let m = 0; m < dur; m += 5) {
      if (occupiedSlots.has(t as string)) return false
      t = addMinutes(t, 5)
    }
    return true
  }
  // Mark already-placed fixed items
  for (const [inst, time] of assignments) {
    markOccupied(time, getDur(inst))
  }

  // Best-effort greedy placement for flexible CSP variables (skip chain children)
  for (const inst of instances) {
    if (inst.fixed) continue
    if (inst.parentId) continue  // Chain children are derived, not placed independently

    // Use propagated domain if available, otherwise regenerate from timeWindow
    let candidates = domains.get(inst)
    if (!candidates || candidates.length === 0) {
      // Domain was emptied by AC-3 cascade — regenerate from timeWindow
      if (inst.timeWindow) {
        const idealDate = (inst.idealTime as string).substring(0, 10)
        const startH = parseInt((inst.timeWindow.start as string).substring(0, 2))
        const startM = parseInt((inst.timeWindow.start as string).substring(3, 5))
        const endH = parseInt((inst.timeWindow.end as string).substring(0, 2))
        const endM = parseInt((inst.timeWindow.end as string).substring(3, 5))
        candidates = []
        let h = startH, m = startM
        while (h < endH || (h === endH && m <= endM)) {
          candidates.push(makeDateTime(idealDate as any, `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00` as any))
          m += 5
          if (m >= 60) { m -= 60; h++ }
        }
      } else if (inst.idealTime) {
        candidates = [inst.idealTime]
      }
    }

    if (candidates && candidates.length > 0) {
      // Sort by proximity to ideal time
      const sorted = inst.idealTime
        ? [...candidates].sort((a, b) =>
            Math.abs(minutesBetween(inst.idealTime, a)) - Math.abs(minutesBetween(inst.idealTime, b))
          )
        : candidates

      // Pick first slot that doesn't overlap (O(dur/5) per check via slot set)
      let placed = false
      const dur = getDur(inst)
      for (const slot of sorted) {
        if (isSlotFree(slot, dur)) {
          assignments.set(inst, slot)
          markOccupied(slot, dur)
          placed = true
          break
        }
      }
      // If every slot overlaps, fall back to closest-to-ideal
      if (!placed) {
        assignments.set(inst, sorted[0]!)
        markOccupied(sorted[0]!, dur)
      }
    } else if (inst.idealTime) {
      assignments.set(inst, inst.idealTime)
      markOccupied(inst.idealTime, getDur(inst))
    }

    // If this is a chain root, derive and place its children
    if (chainTree) {
      const childNodes = chainTree.get(inst)
      if (childNodes && childNodes.length > 0) {
        const rootTime = assignments.get(inst)
        if (rootTime) {
          const assignedBefore = new Set(assignments.keys())
          const occupiedRanges: TimeRange[] = []
          for (const [ai, at] of assignments) {
            occupiedRanges.push({ start: at as string, end: addMinutes(at, getDur(ai)) as string })
          }
          deriveAndPlaceChildren(rootTime, getDur(inst), childNodes, occupiedRanges, assignments)
          // Mark newly-derived children in occupiedSlots so subsequent
          // greedy iterations see them via isSlotFree()
          for (const [ci, ct] of assignments) {
            if (!assignedBefore.has(ci)) {
              markOccupied(ct, getDur(ci))
            }
          }
        }
      }
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

  // Detect chain conflicts — check if derived children ended up overlapping
  if (chainTree) {
    for (const [root, children] of chainTree) {
      const rootTime = assignments.get(root)
      if (!rootTime) continue
      checkChainChildConflicts(rootTime, getDur(root), children, assignments, conflicts)
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

function deriveAndPlaceChildren(
  parentTime: LocalDateTime,
  parentDur: number,
  children: ChainNode[],
  occupiedRanges: TimeRange[],
  assignments: Map<Instance, LocalDateTime>
): void {
  const parentEnd = addMinutes(parentTime, parentDur)
  for (const child of children) {
    const bestTime = deriveChildTime(parentEnd, child, occupiedRanges)
    assignments.set(child.instance, bestTime)
    const childDur = getDur(child.instance)
    occupiedRanges.push({ start: bestTime as string, end: addMinutes(bestTime, childDur) as string })
    if (child.children.length > 0) {
      deriveAndPlaceChildren(bestTime, childDur, child.children, occupiedRanges, assignments)
    }
  }
}

function checkChainChildConflicts(
  parentTime: LocalDateTime,
  parentDur: number,
  children: ChainNode[],
  assignments: Map<Instance, LocalDateTime>,
  conflicts: Conflict[]
): void {
  const parentEnd = addMinutes(parentTime, parentDur)
  for (const child of children) {
    const childTime = assignments.get(child.instance)
    if (!childTime) {
      conflicts.push({
        type: 'chainCannotFit',
        severity: 'error',
        message: `No valid slots for chain child ${child.instance.seriesId}`,
      })
      continue
    }
    // Check overlap with all other assigned items
    const childDur = getDur(child.instance)
    for (const [otherInst, otherTime] of assignments) {
      if (otherInst === child.instance) continue
      if (!checkNoOverlap(childTime, childDur as Duration, otherTime, getDur(otherInst) as Duration)) {
        conflicts.push({
          type: 'overlap',
          severity: 'warning',
          message: `Overlap: ${child.instance.seriesId} at ${childTime} and ${otherInst.seriesId} at ${otherTime}`,
        })
      }
    }
    if (child.children.length > 0) {
      checkChainChildConflicts(childTime, childDur, child.children, assignments, conflicts)
    }
  }
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

  // 2. Build chain tree (derived variables — children won't be CSP variables)
  const chainTree = buildChainTree(timedInstances, input.chains)

  // CSP variables = timed instances that are NOT chain children
  const cspVariables = timedInstances.filter(i => !i.parentId)

  // 3. Compute domains (chain children excluded)
  const domains = computeDomains(instances)

  // Shadow-prune: remove parent slots where derived children overlap fixed items
  pruneByChainShadow(domains, chainTree, timedInstances)

  // 4. Build internal constraints (CSP variables only — no chain constraints)
  const constraints: InternalConstraint[] = []

  // Auto-generate noOverlap between CSP variable pairs only
  for (let i = 0; i < cspVariables.length; i++) {
    for (let j = i + 1; j < cspVariables.length; j++) {
      constraints.push({ type: 'noOverlap', instances: [cspVariables[i]!, cspVariables[j]!] })
    }
  }

  // Map input constraints to internal (mustBeBefore only — chain constraints eliminated)
  for (const c of input.constraints) {
    if (c.type === 'mustBeBefore') {
      const first = cspVariables.find(i => (i.seriesId as string) === (c.firstSeries as string))
      const second = cspVariables.find(i => (i.seriesId as string) === (c.secondSeries as string))
      if (first && second) {
        constraints.push({ type: 'mustBeBefore', first, second })
      }
    }
  }

  // 5. Propagate constraints (AC-3) — only CSP variables, no chain arcs
  // Skip AC-3 when all constraints are noOverlap. In the derived-variable model,
  // chain constraints are eliminated, leaving only noOverlap. AC-3 with noOverlap
  // between same-domain variables is O(V² × D²) and removes nothing — every slot
  // is trivially supported. The noOverlap constraints are still enforced during
  // backtracking's consistency check.
  const hasNonOverlapConstraints = constraints.some(c => c.type !== 'noOverlap')
  const propagated = hasNonOverlapConstraints
    ? propagateConstraints(domains, constraints)
    : domains

  // 5.5 Capacity check: if total required time exceeds available window,
  // skip backtracking (guaranteed to fail) and go straight to greedy placement.
  // Use the narrowest window from CSP variables (typically 07:00-23:00 = 960min).
  let solution: Map<Instance, LocalDateTime> | null = null
  const totalMinutes = cspVariables.reduce((sum, i) => sum + getDur(i), 0)
  let windowMinutes = 24 * 60
  for (const inst of cspVariables) {
    if (inst.timeWindow) {
      const wStart = parseInt((inst.timeWindow.start as string).substring(0, 2)) * 60 +
        parseInt((inst.timeWindow.start as string).substring(3, 5))
      const wEnd = parseInt((inst.timeWindow.end as string).substring(0, 2)) * 60 +
        parseInt((inst.timeWindow.end as string).substring(3, 5))
      const w = wEnd - wStart
      if (w > 0 && w < windowMinutes) windowMinutes = w
    }
  }
  if (totalMinutes <= windowMinutes) {
    // 6. Backtracking search with chain shadow checking
    const _btStart = Date.now()
    solution = backtrackSearch(cspVariables, propagated, constraints, { chainTree })
    const _btMs = Date.now() - _btStart
  }

  // 7. Build output
  const outputAssignments: Assignment[] = []

  if (solution !== null) {
    for (const [inst, time] of solution) {
      outputAssignments.push({ seriesId: inst.seriesId, time })
    }

    // Derive chain children positions from parent assignments
    const solutionRanges: TimeRange[] = []
    for (const [inst, time] of solution) {
      solutionRanges.push({ start: time as string, end: addMinutes(time, getDur(inst)) as string })
    }
    for (const [root, children] of chainTree) {
      const rootTime = solution.get(root)
      if (!rootTime) continue
      deriveAndAddChildren(rootTime, getDur(root), children, solutionRanges, outputAssignments)
    }

    for (const inst of allDayInstances) {
      outputAssignments.push({ seriesId: inst.seriesId, time: inst.idealTime })
    }
    return { assignments: outputAssignments, conflicts: [] }
  }

  // 8. Handle no solution
  const { assignments: bestEffort, conflicts } = handleNoSolution(
    timedInstances, propagated, constraints, chainTree
  )
  for (const [inst, time] of bestEffort) {
    outputAssignments.push({ seriesId: inst.seriesId, time })
  }
  for (const inst of allDayInstances) {
    outputAssignments.push({ seriesId: inst.seriesId, time: inst.idealTime })
  }
  return { assignments: outputAssignments, conflicts }
}

function deriveAndAddChildren(
  parentTime: LocalDateTime,
  parentDur: number,
  children: ChainNode[],
  occupiedRanges: TimeRange[],
  output: Assignment[]
): void {
  const parentEnd = addMinutes(parentTime, parentDur)

  for (const child of children) {
    const bestTime = deriveChildTime(parentEnd, child, occupiedRanges)
    output.push({ seriesId: child.instance.seriesId, time: bestTime })

    // Add this child to occupied ranges for sibling/grandchild overlap checking
    const childDur = getDur(child.instance)
    occupiedRanges.push({ start: bestTime as string, end: addMinutes(bestTime, childDur) as string })

    // Recurse for grandchildren
    if (child.children.length > 0) {
      deriveAndAddChildren(bestTime, childDur, child.children, occupiedRanges, output)
    }
  }
}
